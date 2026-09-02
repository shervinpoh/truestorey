/**
 * The Blindspot rubric.
 *
 * WHY THIS IS A FUNCTION AND NOT A PROMPT.
 *
 * The competitor sells a Project Scorecard and it was refused here on the
 * grounds that a score assembled by a model is opinion wearing a number's
 * clothes — it reads objective, it cannot be sourced, and it will not give the
 * same answer twice. Shervin wants the score anyway, and he is right that it is
 * the thing that makes the tool spread.
 *
 * So the score is built the only way it can be both useful and defensible: as
 * a PUBLISHED FORMULA over sourced figures. Every rule below is rendered on the
 * page beside the result. A reader can check the arithmetic, disagree with a
 * threshold, and see exactly which filed transactions moved the number.
 *
 * Three consequences, all deliberate:
 *
 *  1. A model never assigns a point. Language models write the prose and fetch
 *     facts that are not in the repo; the number comes from here.
 *  2. The same inputs always produce the same score. No temperature, no drift,
 *     no "it said 7 yesterday".
 *  3. A check with no data SCORES NOTHING AND SAYS SO. It is never quietly
 *     treated as zero risk, because absence of evidence would otherwise read
 *     as evidence of safety — which is the exact failure this rubric exists to
 *     avoid.
 *
 * Higher means MORE to check. This is a risk score, not a rating: 8 does not
 * mean good. Every surface that renders it has to say so.
 *
 * CEA PG 02-11 s3.1 requires market claims to be substantiated. A published
 * rubric over filed transactions is substantiation. A model's impression is not.
 */

/*
 * Bumped when the FORMULA changes, not when data refreshes. v2 moved the
 * `view` check from Master Plan plot ratio to URA planning decisions — a
 * different quantity from a different source — so a score produced under v1 is
 * not comparable to one under v2, and the page prints the version beside it.
 *
 * v4 adds the LEASE check. An audit of the four-check version found it scored
 * nothing on 69% of private lookups and reached "Little flagged" on most of
 * the rest, because two of the four checks — land sales and approvals nearby —
 * usually have nothing to report. A tool that mostly says "nothing stood out"
 * has not told anyone anything. Lease runs on every home whose tenure is known
 * and genuinely separates them.
 */
export const RUBRIC_VERSION = '2026-09-v5';

/**
 * Bands are named for what the reader should DO, not for how good the property
 * is. "Worth a closer look" is an instruction. "7/10" is a verdict, and the
 * words are what stop it being read as one.
 */
export const BANDS = [
  { upTo: 0.20, label: 'Little flagged', meaning: 'Nothing in the checks below stood out. That is not the same as no risk — it is no risk of the four kinds this tool measures.' },
  { upTo: 0.45, label: 'Worth a closer look', meaning: 'One or two things here deserve a question before you commit.' },
  { upTo: 0.70, label: 'Several things to check', meaning: 'More than one check flagged. None of these is disqualifying on its own; together they are a reason to do the work.' },
  { upTo: 1.01, label: 'A lot flagged', meaning: 'Most of what this tool can measure came back flagged. Worth understanding every one before proceeding.' },
];

/**
 * The six checks. `max` is what a check can contribute when it runs; the
 * denominator is the sum of the maxima of the checks that ACTUALLY RAN, never
 * a fixed ten. A score of 4 out of a possible 6 is an honest 4 out of 6, and
 * calling it 6.7/10 would be inventing two checks that never happened.
 */
export const CHECKS = {
  price: {
    key: 'price',
    max: 3,
    title: 'Where the asking price sits',
    needs: 'At least five comparable filed transactions in the last 12 months.',
    source: 'HDB via data.gov.sg · URA Data Service',
    /**
     * Percentile of the asking psf within the last 12 months of filed sales at
     * the same address. A thin HDB block falls back to nearby flats of the same
     * type, similar size and similar lease; the radius and every comparable are
     * printed. This is not a town comparison and it is not a valuation.
     */
    bands: [
      { over: 0.90, points: 3, say: (p, c) => `${priceRank(p, c)}.` },
      { over: 0.75, points: 2, say: (p, c) => `${priceRank(p, c)}.` },
      { over: 0.50, points: 1, say: (p, c) => `In the upper half of ${priceBasis(c)} — above ${pcOf(p)}.` },
      { over: -1,   points: 0, say: (p, c) => `At or below the middle of ${priceBasis(c)} — above ${pcOf(p)}.` },
    ],
  },

  lease: {
    key: 'lease',
    max: 3,
    points: leasePoints,
    title: 'What the lease is doing',
    needs: 'A remaining lease — from HDB\u2019s register, or from the tenure filed with URA.',
    source: 'SLA leasehold relativity table · HDB · URA',
    /**
     * The blind spot this tool most needed.
     *
     * Nothing on a listing tells a buyer that a lease loses value faster the
     * shorter it gets. Sixty years reads as a long time; the State\u2019s own
     * table says a lease at sixty is worth 80% of freehold and shedding half a
     * percentage point a year, and that by forty years the rate has gone to
     * 0.8 and by twenty to 1.4. Same table, same lease, six times the erosion.
     *
     * Scored on years remaining, with the thresholds taken off the curve where
     * the annual rate steps up rather than chosen for roundness: 0.5 points a
     * year at 80, 0.6 through the sixties and fifties, 0.8 by 40, 1.0 by 30.
     *
     * FREEHOLD SCORES ZERO AND STILL RUNS. A check that disappeared on
     * freehold would leave a reader unable to tell "nothing to worry about
     * here" from "we could not look", which is the distinction this whole
     * rubric is built on.
     *
     * This is not a valuation and not advice about whether to buy. It is the
     * published relativity for a number of years, printed beside the number of
     * years this home has left.
     */
    bands: [
      { over: 999, points: 0, say: () => 'Freehold, so there is no lease running down.' },
      { over: -1, points: 0, say: (y, c) => leaseSay(y, c) },
    ],
    caveat: (_y, c) => {
      if (!c || c.freehold) return null;
      const bits = [];
      if (c.relativity == null) bits.push('The published table covers 1 to 99 years and has no row for this lease, so no relativity is shown');
      bits.push('The table is what the State applies to a lease extension. It is not a valuation of this home and nothing here projects a future price');
      return bits.join('. ') + '.';
    },
  },

  liquidity: {
    key: 'liquidity',
    max: 2,
    points: (rate, c) => (c?.quieter === 'p10' ? 2 : c?.quieter === 'p25' ? 1 : 0),
    title: 'How often anything here sells',
    needs: 'Filed sales at this address with a coordinate — held in the repo.',
    source: 'HDB via data.gov.sg · URA Data Service',
    /**
     * Exit liquidity, which almost nobody checks before buying.
     *
     * Scored against the market's own distribution rather than a fixed number,
     * because "few sales" means nothing on its own and the two markets are
     * different shapes — see scripts/build-comps.mjs, which measures the
     * percentiles from the same data this reads.
     *
     * A quiet address is not a bad one. It flags because it is slower to sell,
     * because a buyer has more room to push on price, and because it is the
     * reason the price check above may be running on very little.
     */
    bands: [
      { over: -1, points: 0, say: (rate, c) => liquiditySay(rate, c) },
    ],
    caveat: (_r, c) => c && c.sales >= 20
      ? 'Only the twenty most recent sales are held for any address, so a busier one cannot be told from a busy one. That limit bites at the active end and not at the quiet end this check is about.'
      : null,
  },

  supply: {
    key: 'supply',
    max: 3,
    title: 'Flats reaching MOP nearby',
    needs: 'HDB Property Information plus geocodes — both held in the repo.',
    source: 'HDB Property Information via data.gov.sg',
    /**
     * Units reaching their fifth year within 2km over the next five years, as a
     * share of the existing stock within the same radius. This is the closest
     * thing to a measurable answer to "who else will be selling when I want to".
     */
    bands: [
      { over: 0.20, points: 3, say: r => `${pct(r)} of nearby flats reach MOP in the next five years. That is a lot of competing sellers.` },
      { over: 0.10, points: 2, say: r => `${pct(r)} of nearby flats reach MOP in the next five years.` },
      { over: 0.05, points: 1, say: r => `${pct(r)} of nearby flats reach MOP in the next five years — a normal amount.` },
      { over: -1,   points: 0, say: r => `Only ${pct(r)} of nearby flats reach MOP in the next five years.` },
    ],
  },

  gls: {
    key: 'gls',
    max: 2,
    title: 'Government Land Sales nearby',
    // `needs` is rendered to READERS on /blindspot, not just to whoever runs
    // the repo. It said "Run `npm run ingest:gls`" and that script has never
    // existed, so the page was telling everyone who looked to run a command
    // that answers "Missing script". Say what is absent and why; do not
    // instruct an action nobody can take.
    needs: 'A published unit yield for a GLS site nearby. The programme is held here '
         + '(2026 H2), but URA\'s Schedule of Confirmed and Reserve List Sites gives site '
         + 'area and plot ratio only — no yields — so this cannot be counted in units.',
    source: 'URA Government Land Sales programme',
    /**
     * New supply within 1km, as units. A site is competition before it is a
     * comparable.
     *
     * This scores nothing at present and says so. URA publishes the GLS
     * schedule with site area and gross plot ratio and no unit yield, and
     * measure.js returns null rather than 0 when sites are nearby but none
     * carries one — because 0 renders as "No GLS site within 1km", which
     * standing beside a real site is false in the reassuring direction.
     *
     * The floor area IS known (area x plot ratio) and rides along in the
     * caveat. It is not divided by an assumed unit size to manufacture a
     * count: that would be this rubric assigning a figure nobody published,
     * which is the one thing it exists not to do.
     */
    bands: [
      { over: 800, points: 2, say: (u, c) => `${Math.round(u).toLocaleString('en-SG')} units are coming within 1km from land already sold or launched${inProgramme(c)}.` },
      { over: 200, points: 1, say: (u, c) => `${Math.round(u).toLocaleString('en-SG')} units are coming within 1km from land in the GLS programme${inProgramme(c)}.` },
      // The zero case is the one that matters. Unqualified, "No GLS site
      // within 1km" reads as a fact about the neighbourhood; it is only ever a
      // fact about one half-yearly programme, transcribed by hand.
      { over: -1,  points: 0, say: (u, c) => u
          ? `${Math.round(u).toLocaleString('en-SG')} units coming within 1km${inProgramme(c)} — small.`
          : `No GLS site within 1km${inProgramme(c) || ' in the programme held here'}.` },
    ],
    caveat: (_u, c) => {
      if (!c) return null;
      const bits = [];
      if (c.programme) bits.push(`Covers the ${c.programme} programme only, transcribed by hand from URA`);
      // Only claim yields are missing when they actually are. Five of the
      // sites now carry URA's own published figure.
      const noYield = (c.sites?.length || 0) - (c.sitesWithPublishedUnits || 0);
      if (noYield > 0 && c.gfaSqm) {
        bits.push(`${noYield} of the ${c.sites.length} GLS site${c.sites.length > 1 ? 's' : ''} in this radius ${noYield > 1 ? 'have' : 'has'} no published unit yield and ${noYield > 1 ? 'are' : 'is'} not in that count — together the sites carry ${c.gfaSqm.toLocaleString('en-SG')} sqm of zoned floor area`);
      }
      return bits.length ? bits.join('. ') + '.' : null;
    },

  },

  view: {
    key: 'view',
    max: 2,
    title: 'What has been approved nearby',
    needs: 'URA planning decisions — held in the repo.',
    source: 'URA Planning Decisions via the URA Data Service',
    /**
     * The tallest thing URA has PERMITTED within 300m in the last three years.
     *
     * This was scored on Master Plan plot ratio and is not any more. Zoning
     * says what is allowed and has often said so for a decade; a written
     * permission is a decision, with an applicant, a date and an address.
     * Within 800m of Parc Clematis that is the difference between "zoned to
     * 2.1" and "three blocks of 40-storey public housing, permitted 16 Oct
     * 2025". The zoning figure is still measured and still shown — as the
     * caveat, where it belongs, because a permission nobody has acted on is
     * context rather than a finding.
     *
     * Scored on height because the question is what changes the outlook.
     * 2,842 of the 4,689 decisions held here are three storeys or fewer —
     * landed reconstruction, which is not the thing anyone means by "what
     * could be built next door".
     *
     * A REFUSAL IS NEVER SCORED. Someone proposing a tower and being turned
     * down belongs on the page and is not evidence a tower is coming.
     */
    bands: [
      { over: 20, points: 2, say: (n, c) => `A ${n}-storey development was approved within ${c?.m ?? 300}m — tall enough to change what you look at.` },
      { over: 8,  points: 1, say: (n, c) => `A ${n}-storey development was approved within ${c?.m ?? 300}m.` },
      { over: -1, points: 0, say: (n, c) => n
          ? `Nothing taller than ${n} storeys has been approved within ${c?.m ?? 300}m since ${c?.since ?? 'recently'}.`
          : `Nothing new has been approved within ${c?.m ?? 300}m since ${c?.since ?? 'recently'}.` },
    ],
    /**
     * Three things the number on its own does not say: what was refused, what
     * could not be read, and what the plan would still allow regardless.
     */
    caveat: (_n, c) => {
      if (!c) return null;
      const bits = [];
      if (c.refused) bits.push(`${c.refused} application${c.refused > 1 ? 's were' : ' was'} refused in the same radius — proposed, not permitted`);
      if (c.unparsed) bits.push(`${c.unparsed} approval${c.unparsed > 1 ? 's carry' : ' carries'} no storey figure in URA's description and ${c.unparsed > 1 ? 'are' : 'is'} not counted here`);
      if (c.zonedTo) bits.push(`land within 300m is zoned to a plot ratio of ${c.zonedTo}, whether or not anyone has applied`);
      return bits.length ? bits.map(b => b.replace(/^./, m => m.toUpperCase())).join('. ') + '.' : null;
    },
  },
};

/* Names the half-year a GLS finding covers. Without it the zero case reads as
 * a fact about the neighbourhood rather than about one transcribed list. */
const inProgramme = c => (c && c.programme ? ` (${c.programme})` : '');

/* An HDB cohort is blocks; a private one is projects. The word was hardcoded
 * to "HDB blocks" while the cohort was HDB-only, and it survived the change —
 * Perfect Ten, a freehold condominium, reported "13 comparable filed sales
 * across 7 HDB blocks". A finding that names the wrong kind of building is
 * wrong in exactly the way a reader cannot catch. */
const placeWord = c => (c?.leaseFrom ? 'HDB block' : 'nearby project');

const priceBasis = c => c?.basis === 'nearby'
  ? `${c.sample} comparable filed sales across ${c.blocks} ${placeWord(c)}${c.blocks === 1 ? '' : 's'} within ${Math.round(c.radiusKm * 1000)}m`
  : `the ${c?.sample || 'recent'} filed sales at this address in the last ${c?.months || 12} months`;

const priceRank = (p, c) => p >= 1
  ? `Above all ${priceBasis(c).replace(/^the /, '')}`
  : `Above ${pcOf(p)} of ${priceBasis(c)}`;

/**
 * Years remaining read downward, so this cannot use the generic `over` ladder
 * the other checks share — a shorter lease is worse, and every other check is
 * "bigger is worse". scoreCheck() calls `points` when a check defines one.
 */
export function leasePoints(years) {
  if (!Number.isFinite(years) || years > 999) return 0;   // freehold
  if (years <= 40) return 3;
  if (years <= 60) return 2;
  if (years <= 80) return 1;
  return 0;
}

const leaseSay = (years, c) => {
  if (!Number.isFinite(years) || years > 999 || c?.freehold)
    return 'Freehold, so there is no lease running down.';
  const y = Math.round(years);
  const rel = c?.relativity != null ? `, worth ${c.relativity}% of freehold on the State\u2019s own table` : '';
  const dec = c?.decay != null ? ` and shedding about ${c.decay.toFixed(2)} points of that a year at this stage` : '';
  if (y <= 40) return `${y} years left${rel}${dec}. The rate accelerates from here.`;
  if (y <= 60) return `${y} years left${rel}${dec}.`;
  if (y <= 80) return `${y} years left${rel}${dec}.`;
  return `${y} years left${rel}${dec} — early in the lease.`;
};

const liquiditySay = (rate, c) => {
  const where = c?.kind === 'HDB' ? 'HDB blocks' : c?.landed ? 'landed streets' : 'private projects';
  const r = `About ${rate < 1 ? rate.toFixed(1) : Math.round(rate)} sale${rate >= 1.5 ? 's' : ''} a year here`;
  if (c?.quieter === 'p10') return `${r} — the quietest tenth of ${where}, where the market median is ${c.median}. Slower to sell, and thin evidence of what it is worth.`;
  if (c?.quieter === 'p25') return `${r} — the quieter quarter of ${where}, against a median of ${c.median}.`;
  return `${r}, against a median of ${c?.median ?? '—'} across ${where}.`;
};

const pcOf = p => `${Math.round(p * 100)}%`;
const pct = r => `${(r * 100).toFixed(1)}%`;

/** Apply one check's bands to its measured value. Returns null if it did not run. */
/**
 * `context` is the measurement's own detail object, passed so a check can
 * state the limits of its own answer.
 *
 * The zoning check is why this exists. It returns the highest plot ratio
 * within 300m, and at Parc Clematis 163 of the 171 parcels in that radius
 * carry no fixed ratio at all — landed, or left open by the plan. "The highest
 * nearby is 2.1" is true and, on its own, misleading: it sounds like a ceiling
 * when most of the neighbourhood was never measured. A check that quietly
 * drops what it could not read is telling the reader the property is safer
 * than anyone knows.
 */
export function scoreCheck(key, value, context = null) {
  const check = CHECKS[key];
  if (!check) throw new Error(`Unknown check: ${key}`);
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const band = check.bands.find(b => value > b.over);
  const caveat = check.caveat ? check.caveat(value, context) : null;
  /* Every check but one is "a bigger number is worse", which the `over` ladder
   * expresses directly. Years of lease remaining runs the other way, so that
   * check supplies its own `points` and the ladder is left to do the wording. */
  const points = check.points ? check.points(value, context) : band.points;
  return {
    key,
    title: check.title,
    source: check.source,
    value,
    points,
    max: check.max,
    finding: band.say(value, context),
    ...(caveat ? { caveat } : {}),
  };
}

/**
 * Total the checks that ran.
 *
 * `max` is the sum of the maxima of those checks only. `ran` and `skipped` are
 * both returned so the page can say what it could not measure — a tool that
 * silently drops a check it could not run is telling the reader the property is
 * safer than it has any way of knowing.
 */
export function score(measurements = {}, contexts = {}) {
  const results = [];
  const skipped = [];
  for (const key of Object.keys(CHECKS)) {
    const r = scoreCheck(key, measurements[key], contexts[key] ?? null);
    if (r) results.push(r);
    else skipped.push({
      key,
      title: CHECKS[key].title,
      needs: contexts[key]?.unavailable || CHECKS[key].needs,
    });
  }

  const points = results.reduce((n, r) => n + r.points, 0);
  const max = results.reduce((n, r) => n + r.max, 0);
  const ratio = max > 0 ? points / max : null;
  const band = ratio === null ? null : BANDS.find(b => ratio <= b.upTo);
  // Price is the one check fed directly by the reader's asking price. Calling
  // a partial 0/7 "Little flagged" when that input was never assessed is false
  // reassurance, however accurately the smaller denominator is printed.
  const priceMissing = skipped.some(s => s.key === 'price');
  const incompletePrice = max > 0 && priceMissing;

  return {
    version: RUBRIC_VERSION,
    points,
    max,
    ratio,
    band: incompletePrice ? 'Incomplete — price not assessed' : band ? band.label : null,
    meaning: incompletePrice
      ? 'The other checks ran, but the asking price did not enter this result. This is not a low-risk finding.'
      : band ? band.meaning : null,
    /** Only ever set when every check ran. A ten-point score off six points of
     *  evidence would be a bigger lie than showing six. */
    outOfTen: max === totalPossible() ? points : null,
    checks: results,
    skipped,
    direction: 'Higher means more to check. This is not a rating.',
  };
}

export function totalPossible() {
  return Object.values(CHECKS).reduce((n, c) => n + c.max, 0);
}
