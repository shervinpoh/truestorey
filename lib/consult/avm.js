/**
 * An estimate of what a home would sell for. INTERNAL — see the boundary note.
 *
 * ── WHY THIS IS NOT ON THE SITE, AND THE TEST THAT KEEPS IT OFF ────────────
 * Rule 2 forbids publishing a single valuation number, and nothing here
 * relaxes it. `/blindspot` asks "you have been quoted X — where does X sit",
 * which is a percentile over filed sales and is defensible because the reader
 * brought the number. This module answers the inverted question, produces a
 * point, and therefore belongs to Shervin's own practice and not to
 * truestorey.vercel.app.
 *
 * That distinction is worth exactly as much as its enforcement, so
 * `test/consult-boundary.test.js` fails if anything under app/ or components/
 * imports this directory. `clientSafe()` at the bottom is the supported way to
 * move part of this across: it drops the point and keeps the band and the
 * comparables, which is the rule 2 shape.
 *
 * ── WHAT IS REUSED AND WHY ─────────────────────────────────────────────────
 * The hard, tested, already-audited part of this problem is COHORT SELECTION:
 * same type family, floor area within a band, same tenure family, a similar
 * amount of lease left, a radius that widens only until enough exist, and a
 * ladder that widens time before geography. That is `priceAnalysis` in
 * lib/blindspot/measure.js and it is not reimplemented here. Writing a second
 * matcher is the failure this repo already has a note about.
 *
 * So this module takes that cohort and adds the three things an estimate needs
 * that a percentile does not:
 *
 *   1. TIME. Every comparable restated in one quarter's money — lib/consult/timebase.js.
 *   2. WEIGHT. A sale in this block last quarter is better evidence than one
 *      1.4km away two years ago, and a flat median says they are equal.
 *   3. AN ERROR THE ESTIMATE DID NOT CHOOSE FOR ITSELF. See `band` below.
 *
 * ── THE SEED, AND THE CIRCULARITY IT WOULD CAUSE IF IT MATTERED ────────────
 * `priceAnalysis` takes an asking price because it exists to place one. It is
 * needed here only to get the cohort back, so a constant is passed. That is
 * safe ONLY because rung selection depends on `sample >= min` and never on the
 * asking price — if that ever changes, this AVM silently becomes anchored on
 * its own seed and every backtest it passes becomes meaningless. The seed is
 * deliberately absurd, and `test/avm.test.js` asserts the cohort is identical
 * across two wildly different seeds so the day someone couples them is the day
 * a test goes red rather than the day an estimate quietly starts agreeing with
 * whatever it was told.
 */
import fs from 'node:fs';
import path from 'node:path';
import { priceAnalysis, typeFamily } from '../blindspot/measure.js';
import { timebase } from './timebase.js';
import { errorFor } from './error.js';

/** See the circularity note above. Not 0: priceAnalysis rejects a
 *  non-positive asking price, so a sentinel has to be a real number. */
const SEED_PSF = 1;

/**
 * ── THE WEIGHTS ───────────────────────────────────────────────────────────
 * Published constants, for the same reason the Blindspot rubric is a published
 * formula: a weighting nobody can read is an opinion wearing arithmetic's
 * clothes. Each is a HALF-WEIGHT DISTANCE — the point at which a comparable
 * counts half as much as a perfect one — because that is a quantity someone
 * can disagree with in units they understand.
 */
export const WEIGHTS = {
  /**
   * 110 m. MEASURED, and the single biggest surprise in this file.
   *
   * It was 400m, chosen on the argument that past roughly there a Singapore
   * comparable is a different precinct. The argument was reasonable and the
   * number was nearly four times too generous. `npm run tune:avm` picked 110m
   * in four of five address-split runs and 150m in the fifth, and distance is
   * far the strongest of the three dimensions — 0.283pp of median error across
   * its range against 0.097pp for time and 0.082pp for area.
   *
   * What it says, in words: the BUILDING is almost the whole price. A sale in
   * your own block counts fully, one 110m away counts a third of it, and one
   * 400m away — which the old setting treated as half-weight — counts about a
   * fortieth. That is a stronger claim than the ladder in measure.js makes and
   * the record supports it.
   */
  distanceM: 110,
  /**
   * 18 months, UNCHANGED, and deliberately not tuned.
   *
   * The search wanted 48, 12, 18, 12 and 12 across five splits — it bounces,
   * because the dimension barely measures: 0.097pp across a range from six
   * months to ninety-six. That is what you would expect once the index has
   * already restated every comparable's price; what is left is only the risk
   * that something the index cannot see has changed — the block's condition,
   * its lift upgrading, what went up next door.
   *
   * A dimension that does not measure keeps its explainable default rather
   * than taking whichever value one split happened to prefer. Adopting a
   * number that moves is how a fitted model becomes unexplainable for no gain.
   */
  months: 18,
  /**
   * 4% of floor area. MEASURED, down from 12%; picked in four of five splits.
   *
   * The cohort already bounds area to ±10%, so at 4% a comparable at the edge
   * of that band carries about a tenth of the weight of an exact size match.
   *
   * ── AND THIS IS WHY THERE IS NO SIZE ADJUSTMENT ─────────────────────────
   * There was one, briefly. `npm run measure:size` finds a real gradient:
   * fitted within one block and one flat type, HDB's elasticity of psf to
   * floor area is −0.387 over 541 groups, 86% negative, and −0.444 with the
   * storey band held constant too. A flat 10% larger sells for about 4% less
   * per square foot — buyers price the flat, not the foot.
   *
   * Restating every comparable onto the target's area moved the median error
   * by 0.01pp, and once this half-weight was tuned from 12% down to 4% it
   * moved it the WRONG WAY — 3.44% with the adjustment against 3.40% without,
   * on three separate runs. The tightened weight already discards the
   * comparables the adjustment existed to correct, and a single global
   * elasticity applied to what is left adds its own error and nothing else.
   *
   * The gradient is real. The adjustment is not worth having, and a component
   * that does not earn its place does not ship. Anyone who proposes it again
   * should run the measurement first — it is still there, and it agrees with
   * them right up to the point where it stops mattering.
   */
  areaPct: 0.04,
};

export const VERSION = '2026-09-avm-v6';

const monthsApart = (month, asOf) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(month || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return Math.max(0, (asOf.getFullYear() - d.getFullYear()) * 12 + (asOf.getMonth() - d.getMonth()));
};

/** Weighted quantile over rows already sorted by psf. Interpolation is
 *  deliberately absent: the answer is always a price some home actually
 *  transacted at, not a point between two of them. */
function weightedQuantile(sorted, q) {
  const total = sorted.reduce((s, r) => s + r.weight, 0);
  if (!(total > 0)) return null;
  let acc = 0;
  for (const r of sorted) {
    acc += r.weight;
    if (acc >= total * q) return r.psf;
  }
  return sorted.at(-1).psf;
}

/**
 * @param rec       a record with `recent`, `href`, `kind`, `label`
 * @param areaSqft  the unit's floor area. Required — an estimate without one
 *                  would be an estimate of the address, not of a home.
 * @param floor     storey, optional. Supplied, the cohort is restated onto it
 *                  by the existing storey curve before anything here runs.
 * @returns null with a `reason` when it cannot run. Never a guess, and never a
 *          wider band standing in for a missing answer.
 */
/**
 * Each project's own price level, from data/private-scan.json.
 *
 * ── WHY A NEARBY CONDOMINIUM IS NOT A COMPARABLE ──────────────────────────
 * On the HDB side "nearby" works: blocks in a town are genuinely alike, and
 * the whole estimator was tuned and backtested there. Private breaks the
 * assumption. 8 SAINT THOMAS trades around 2,990 psf; LA CRYSTAL, four
 * hundred metres away and the same size, trades around 2,190. Distance, size
 * and recency say they are close neighbours. They are different assets.
 *
 * Asked for a 97 sqm unit at 8 Saint Thomas, the estimator found two sales at
 * the address inside its window and thirty-four nearby, let the strangers
 * outvote the building 62/38, and returned 2,276 psf — BELOW the lowest sale
 * that building has ever filed. Measured across private projects, the error
 * against a project's own median runs 2.9% when its own sales carry the
 * weight and 14-16% when neighbours outvote them.
 *
 * So a comparable from another building is restated to this building's level
 * first. The levels come from the per-district hedonic in
 * scripts/build-private-scan.mjs, which holds size, tenure, remaining lease,
 * storey and property type constant — so what is left is the building, and
 * it is exactly the thing distance cannot see. It persists at r=0.72 between
 * halves of the window, which is why it can be used as a constant at all.
 *
 * No level for either side means no adjustment and the comparable is counted
 * unrestated, because inventing one would be worse than the gap it closes.
 */
let LEVELS = null;
function levelIndex(root = process.cwd()) {
  if (LEVELS) return LEVELS;
  LEVELS = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'private-scan.json'), 'utf8'));
    /* Keyed by name AND district. A level is a measurement made inside one
       district's fit, so applying it to a same-named project elsewhere is
       comparing two different measurements — and the pool for 8 Saint Thomas
       in D09 picked up a D23 project called ESPA doing exactly that. A miss
       means no adjustment, which is the safe direction. */
    for (const p of raw.projects) LEVELS.set(normName(p.project) + '|' + p.district, p.gap);
  } catch { /* not built — every lookup misses and nothing is adjusted */ }
  return LEVELS;
}
/** Tests rebuild the file underneath us; nothing else needs this. */
export function _clearLevels() { LEVELS = null; }
const normName = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export function estimate(rec, { areaSqft, floor = null, asOf = new Date(), months = 12, min = 5, useLevels = true,
                                index = null, weights = WEIGHTS,
                                /* ── ABLATION SWITCHES ──────────────────────────────────────────
                                 * Each of the three additions this module makes over the raw
                                 * comparables engine can be turned off individually, so the
                                 * backtest can say what each is WORTH rather than assuming it
                                 * earns its place. A component that cannot be switched off is a
                                 * component nobody has measured. Defaults are the live path. */
                                useIndex = true, unionRungs = true,
                                /**
                                 * Which evidence is allowed to price this home.
                                 *   'all'        the union of every rung — the normal path
                                 *   'self'       only sales at this address
                                 *   'neighbours' only sales at OTHER addresses
                                 *
                                 * The last two are disjoint, which is what makes them
                                 * comparable: run both and the gap between them is
                                 * "what this block trades at against what its
                                 * neighbourhood predicts", with identical floor, time
                                 * and weighting machinery on each side. Running one
                                 * cohort through a different code path and calling the
                                 * difference a finding is how a bug becomes a market signal.
                                 */
                                cohort = 'all',
                                /**
                                 * ── THE FLOOR ON EFFECTIVE SAMPLE ──────────────────────
                                 * Weights are RELATIVE, which means they protect an estimate
                                 * only when the cohort is mixed. When every comparable is
                                 * equally far away the weights are all tiny, all tiny is the
                                 * same shape as all full, and the distance penalty silently
                                 * does nothing at all.
                                 *
                                 * Blk 310A Ang Mo Kio is the case that found it. Its own
                                 * adjacent blocks file no 5-room sales at that size, so the
                                 * radius widened to a kilometre and the cohort came back as
                                 * ten Bishan sales at 899-973m — a different and far more
                                 * expensive town — every one of them carrying a weight of
                                 * 0.000. The "neighbourhood" said 1,121 psf against the
                                 * block's own 973, and the neighbourhood was Bishan.
                                 *
                                 * effN is the sum of the weights: roughly "how many perfect
                                 * comparables is this worth". A same-address sale this
                                 * quarter at the right size is about 1.0; the error table's
                                 * own bins cut at 3.27 and 5.91, so a typical lookup runs 3
                                 * to 6.
                                 *
                                 * 0.5 — half of one good comparable — is where the trade
                                 * stops paying. Swept on 4,000 held-out sales:
                                 *
                                 *   floor  coverage  MdAPE   within10
                                 *   0       81.6%    3.17%    88.5%
                                 *   0.25    77.6%    3.05%    90.6%
                                 *   0.5     75.0%    2.99%    91.5%   ← the knee
                                 *   1.0     68.8%    2.93%    92.5%
                                 *   2.0     55.1%    2.86%    92.9%
                                 *
                                 * Past 0.5 each further step costs six to fourteen points of
                                 * coverage to buy six hundredths of a point of error. The
                                 * catastrophic cases — 310A's cohort was worth 0.001 — are
                                 * refused at any of these settings; what the higher floors
                                 * buy is merely-thin lookups, and those the error table
                                 * already reports honestly.
                                 *
                                 * Callers that RANK rather than answer should raise it.
                                 * scripts/scan.mjs passes 1.0, because a false positive at
                                 * the top of a list costs a Saturday.
                                 */
                                minEffectiveN = 0.5 } = {}) {
  if (!rec?.recent?.length) return { ok: false, reason: 'No filed sales are held for this address.' };
  if (!(Number(areaSqft) > 0)) return { ok: false, reason: 'A floor area is required — psf alone describes the address, not the home.' };

  const analysis = priceAnalysis(rec, SEED_PSF, { areaSqft, floor, months, min, now: asOf, index,
                                                 forceNearby: cohort === 'neighbours' });
  if (!analysis) return { ok: false, reason: 'The comparables engine could not read this record.' };
  /* With a restricted cohort the ladder's own `scored` may be null while the
     requested rung is perfectly usable, so the sufficiency test moves below,
     onto the cohort actually being used. */
  if (cohort === 'all' && !analysis.scored) return { ok: false, reason: analysis.unavailable, coverage: analysis };

  /* ── THE RUNGS ARE UNIONED, NOT CHOSEN BETWEEN ───────────────────────────
   * `priceAnalysis` picks ONE rung — this address over 12 months, else this
   * address over 24, else nearby addresses — and returns it as `scored`. That
   * is right for a percentile: the reader is told which cohort placed their
   * price and can judge it as one claim.
   *
   * It is wrong for an estimate, and the backtest said so in numbers. On 600
   * held-out sales the private column scored a 6.83% median absolute error
   * against 4.86% for a plain median of the same address's own sales — the
   * AVM was WORSE than the naive baseline it exists to beat — with a worst
   * case of 503%. The cause is that the third rung REPLACES the first: a
   * condo whose own building filed four sales in 24 months drops all four and
   * prices itself off neighbouring projects, and for private property the
   * project is most of what sets the price. HDB did not show this because two
   * blocks of the same age in the same town really are the same product.
   *
   * So every rung that ran contributes, and `WEIGHTS.distanceM` arbitrates —
   * which is what it was for. A sale in this building sits at distance 0 and
   * carries full weight; one 400m away carries 0.37 of it. The ladder was
   * preventing that comparison from ever being made.
   *
   * Deduped on the fields that identify a filed sale, because `wider` is a
   * 24-month superset of `same` and the overlap would otherwise double-count
   * the most recent and most relevant sales. */
  const seen = new Set();
  const pool = [];
  let fromAddress = 0, fromNearby = 0;
  const rungsUsed = cohort === 'self' ? [analysis.same, analysis.wider]
    : cohort === 'neighbours' ? [analysis.nearby]
    : unionRungs ? [analysis.same, analysis.wider, analysis.nearby]
    : [analysis.scored];
  for (const rung of rungsUsed) {
    for (const c of (rung?.comparisons || [])) {
      const k = `${c.href}|${c.month}|${c.psf}|${c.areaSqm}|${c.storey}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(c);
      if ((c.distanceM || 0) === 0) fromAddress++; else fromNearby++;
    }
  }
  if (pool.length < min) {
    return { ok: false, reason: `Fewer than ${min} comparable sales in the "${cohort}" cohort `
      + `(${pool.length} found). A thinner cohort is a different claim, not a wider range.` };
  }

  const fam = typeFamily(analysis.flatType);
  const tb = useIndex ? timebase(rec.kind, fam, { asOf }) : null;

  /* Restate, then weight. Order matters: the weight is applied to the adjusted
     price, so a heavily-indexed old comparable is down-weighted for its age
     and still contributes at its corrected level rather than its filed one. */
  let unindexed = 0;
  /* Switchable, like every other component here, so the ablation in
     scripts/backtest-avm.mjs can measure it rather than assume it. */
  const levels = useLevels && rec.kind !== 'HDB' ? levelIndex() : new Map();
  const dk = String(rec.district ?? '').padStart(2, '0');
  const levelKey = name => (dk ? levels.get(normName(name) + '|' + dk) : undefined);
  const ownLevel = levelKey(rec.label);
  let levelled = 0, levelMissing = 0;

  const rows = pool.map(c => {
    const moved = tb ? tb.adjust(c.psf, c.month) : null;
    if (!moved) unindexed++;
    /* Restate a neighbour's price to THIS building's level. Same address
       needs no restatement; a different one with no measured level is left
       alone and counted. */
    let levelFactor = null;
    if (ownLevel !== undefined && c.href && c.href !== rec.href) {
      const theirs = levelKey(c.label);
      if (theirs === undefined) levelMissing++;
      else if (theirs > -0.9) { levelFactor = (1 + ownLevel) / (1 + theirs); levelled++; }
    }
    const age = monthsApart(c.month, asOf instanceof Date ? asOf : new Date(asOf));
    const wD = Math.exp(-(c.distanceM || 0) / weights.distanceM);
    const wT = age === null ? 0.5 : Math.exp(-age / weights.months);
    const areaGap = (Number.isFinite(c.areaSqm) && Number.isFinite(analysis.targetAreaSqm) && analysis.targetAreaSqm > 0)
      ? Math.abs(c.areaSqm - analysis.targetAreaSqm) / analysis.targetAreaSqm
      : 0;
    const wA = Math.exp(-areaGap / weights.areaPct);
    return {
      ...c,
      /** The price after the floor curve but BEFORE the index. `psfFiled` (set
       *  by applyFloor) is the untouched filed figure. Three stages, three
       *  names, because an adjusted number that hides what it started from is
       *  not evidence. */
      psfPreIndex: c.psf,
      psfPreLevel: moved ? Math.round(moved.psf) : c.psf,
      psf: Math.round((moved ? moved.psf : c.psf) * (levelFactor ?? 1)),
      indexFactor: moved ? moved.factor : null,
      levelFactor,
      ageMonths: age,
      /** The factors separately, not just their product. An estimate nobody
       *  can decompose is one Shervin cannot defend when a client asks why
       *  that sale counted for so little. */
      w: { distance: wD, time: wT, area: wA },
      /** The RAW gap each weight was computed from. A tuner needs these: the
       *  weights themselves are a function of the half-distances being tuned,
       *  so recovering a gap by taking a logarithm of its own weight would
       *  make the search circular. */
      gapArea: Number(areaGap.toFixed(4)),
      weight: wD * wT * wA,
    };
  }).sort((a, b) => a.psf - b.psf);

  const point = weightedQuantile(rows, 0.50);
  if (!Number.isFinite(point)) return { ok: false, reason: 'No comparable carried a usable weight.' };

  const effectiveN = rows.reduce((s2, r) => s2 + r.weight, 0);
  if (effectiveN < minEffectiveN) {
    const far = Math.round(rows.reduce((s2, r) => s2 + (r.distanceM || 0), 0) / rows.length);
    return { ok: false, reason: `${rows.length} comparables were found but they are worth only `
      + `${effectiveN.toFixed(3)} of one good one (average ${far}m away). Too far to be about this `
      + `home — the weights are relative, so a cohort that is uniformly distant carries no `
      + `distance penalty at all.`, effectiveN: Number(effectiveN.toFixed(3)) };
  }

  const sqft = Number(areaSqft);
  const p25 = weightedQuantile(rows, 0.25);
  const p75 = weightedQuantile(rows, 0.75);

  /* The measured error for a lookup shaped like this one — see
     lib/consult/error.js. Both inputs are knowable before the answer is, which
     is what makes the table usable live and not only in a backtest. */
  const err = errorFor({ kind: rec.kind, bandPct: (p75 - p25) / point, effN: effectiveN });

  return {
    ok: true,
    version: VERSION,
    weights,
    /** The point. This is the number rule 2 keeps off the site. */
    psf: Math.round(point),
    price: Math.round(point * sqft),
    /**
     * ── WHY THIS BAND IS NOT A CONFIDENCE INTERVAL ────────────────────────
     * It is the weighted interquartile range of what comparable homes ACTUALLY
     * TRANSACTED AT, restated to one quarter. It is not ±x% of the point, and
     * it is not derived from a distribution nobody fitted. A portal's ± is
     * usually a fixed percentage, which tells the reader nothing except how
     * confident the vendor decided to look.
     *
     * The honest error of the ESTIMATE is a different quantity and it is not
     * in this object, because it cannot be computed from one lookup. It comes
     * out of scripts/backtest-avm.mjs, measured over held-out sales.
     */
    band: {
      psfLow: Math.round(p25),
      psfHigh: Math.round(p75),
      priceLow: Math.round(p25 * sqft),
      priceHigh: Math.round(p75 * sqft),
      basis: 'weighted interquartile range of the adjusted comparables',
    },
    spread: { psfLow: rows[0].psf, psfHigh: rows.at(-1).psf },
    /**
     * How wrong this is likely to be, measured over held-out sales — NOT the
     * width of the band above. The band says where comparable homes
     * transacted; this says how often an estimate built this way has missed.
     * Two different quantities, and conflating them is how a tight-looking
     * band gets read as a confident answer.
     *
     * null when no table has been built. The caller must then say the error is
     * UNMEASURED, never that it is small.
     */
    error: err,
    effectiveN: Number(effectiveN.toFixed(2)),
    /* Everything needed to say where the number came from — rule 6 applies to
       an internal tool too, because the tool is what Shervin reads before he
       speaks, and a figure he cannot source is one he cannot defend. */
    evidence: {
      sample: rows.length,
      /** Where the cohort came from, since it is now a union of the rungs that
       *  ran rather than the single one `priceAnalysis` scored. */
      fromAddress,
      fromNearby,
      rungs: rungsUsed
        .filter(r => r?.comparisons?.length)
        .map(r => ({ basis: r.basis, months: r.months, n: r.comparisons.length,
                     radiusKm: r.radiusKm ?? null })),
      basis: analysis.scored.basis,
      months: analysis.scored.months,
      radiusKm: analysis.scored.radiusKm ?? null,
      blocks: analysis.scored.blocks ?? null,
      flatType: analysis.flatType,
      flatTypeBasis: analysis.flatTypeBasis,
      targetAreaSqm: analysis.targetAreaSqm,
      areaFromSqm: analysis.scored.areaFromSqm ?? null,
      areaToSqm: analysis.scored.areaToSqm ?? null,
      tenure: analysis.scored.tenure ?? null,
      floor: analysis.floor,
      floorCurve: analysis.floorCurve,
      floorAdjusted: analysis.scored.adjusted ?? null,
      /* Visible, because a comparable that was moved 23% to stand in for this
         building is the single largest adjustment in the chain and nobody
         should have to read the source to find it. */
      levelAdjusted: ownLevel === undefined ? null
        : { ownLevel, restated: levelled, noLevelForTheirs: levelMissing },
      /**
       * How much of the answer is this building's own sales.
       *
       * Measured across private projects: when the address carries the
       * weight the estimate lands 2.9% from the building's own median; when
       * neighbours outvote it, 14-16%. 8 SAINT THOMAS came back at 2,276 psf
       * against a building that has never filed below 2,538, because two of
       * its own sales cleared the size band and thirty-four strangers did.
       *
       * Published because the estimator cannot refuse on it without gutting
       * coverage, and a reader who can see that 38% of the answer came from
       * the building can weigh it. A number that hides this is the one that
       * loses an argument with someone who knows the block.
       */
      ownShare: (() => {
        const all = rows.reduce((t, c) => t + (c.weight || 0), 0);
        const own = rows.filter(c => c.href === rec.href).reduce((t, c) => t + (c.weight || 0), 0);
        return all > 0 ? own / all : null;
      })(),
      source: analysis.source,
      period: analysis.period,
    },
    indexed: tb
      ? { ...tb.summary(), unindexed, series: tb.series, asOfQuarter: tb.targetQuarter,
          lagMonths: tb.lagMonths, note: tb.describe() }
      /* Rule: a check that cannot run scores nothing and says so. An
         unadjusted estimate is NOT an estimate that needed no adjustment. */
      : { ran: false, note: 'No price index was available for this kind of home. '
          + 'Comparables are as filed and have NOT been restated to one date.' },
    comparables: rows,
  };
}

/**
 * The same result with the point removed.
 *
 * This is the only supported way any of this reaches a reader, a client
 * document or the site. It keeps the observed band and the comparables behind
 * it — which is what /blindspot already publishes and what rule 2 permits —
 * and drops `psf`, `price` and the weights that produced them.
 *
 * It is a function rather than a convention because a convention is something
 * a person has to remember at the moment they are in a hurry.
 */
export function clientSafe(result) {
  if (!result?.ok) return result;
  const { psf, price, comparables, ...rest } = result;
  return {
    ...rest,
    psf: undefined,
    price: undefined,
    comparables: comparables.map(({ weight, indexFactor, ...c }) => c),
    note: 'A range of what comparable homes transacted at. Not a valuation of this home.',
  };
}
