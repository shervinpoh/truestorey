/**
 * What a property has going FOR it — a published formula, not an opinion.
 *
 * ── THE POLARITY IS THE OPPOSITE OF BLINDSPOT'S, AND THAT MATTERS ──────────
 * `lib/blindspot/rubric.js` scores RISK: higher means more to check, and 8
 * does not mean good. This scores the other direction: higher means more going
 * for it. Two scores with opposite polarity in one codebase is a genuine trap
 * — somebody will read "9/14" here as a warning — so every surface that prints
 * this has to say which way it runs, and `POLARITY` below exists to be
 * rendered rather than remembered.
 *
 * ── WHY A SCORE AT ALL, GIVEN /refused SAYS NO TO ONE ──────────────────────
 * The refusals page turns down "a project scorecard — one grade for whether a
 * development is good", and the reason it gives is the whole argument: *a
 * score assembled by a language model is an opinion wearing a number's
 * clothes*. Blindspot publishes a score anyway, and the difference is that its
 * formula is printed beside the result, a model never assigns a point, and the
 * same inputs always give the same answer.
 *
 * Same contract here. Every band below is a published threshold over a sourced
 * figure. No model is involved at any point.
 *
 * ── A FACTOR THAT CANNOT RUN SCORES NOTHING AND SAYS SO ───────────────────
 * The denominator is the sum of the maxima of the factors that ACTUALLY RAN,
 * never a fixed fourteen. A property with no coordinate cannot be scored on
 * rail or schools, and calling that 0/14 would read as "nothing nearby" when
 * the truth is "we could not look". 6 out of a possible 8 is an honest 6 of 8.
 */
import fs from 'node:fs';
import path from 'node:path';
import { nearby } from '../data/query.js';
import { leaseRemaining, liquidityFinding, supplyWithin, comps } from '../blindspot/measure.js';

export const VERSION = '2026-09-score-v1';
export const POLARITY = 'Higher means MORE going for it. This is the opposite of the Blindspot '
  + 'risk score, where higher means more to check.';

const band = (v, ladder) => ladder.find(([t]) => v >= t) || ladder.at(-1);

/**
 * Six factors. Each returns points, or declares that it did not run.
 *
 * Distances are STRAIGHT-LINE throughout — rule 10. What sits between two
 * points, a canal or an expressway or a fence, is in no dataset held here, and
 * every finding says "straight-line" for that reason rather than implying a
 * walk.
 */
export const FACTORS = {
  /** Longer lease is worth more, and the thresholds come off SLA's own curve
   *  where the annual decay steps up, not from roundness. */
  lease: { max: 3, title: 'Lease remaining' },
  /** Straight-line to the nearest MRT exit. Never a walking time. */
  rail: { max: 3, title: 'Distance to MRT' },
  /** 1km of a primary school is BALLOT PRIORITY, never a place — rule 11. */
  primary: { max: 2, title: 'Primary schools within 1km' },
  /** How often anything here sells: how easily it can be exited. */
  liquidity: { max: 2, title: 'How often this address sells' },
  /** LOW competing supply is the positive here — the inverse of the risk. */
  supply: { max: 2, title: 'Competing supply nearby' },
  /** Hawker, park and childcare each within 500m straight-line. */
  daily: { max: 2, title: 'Daily amenities' },
};

/**
 * Competing supply for a private address, from URA's development pipeline.
 *
 * Scored against the spread of every district rather than against a fixed
 * number of units, because 1,200 units is a lot in District 01 and unremarkable
 * in District 19, and this repo holds no district stock count to divide by.
 * The same reasoning as the liquidity factor: compare a thing to the market's
 * own distribution, not to a threshold somebody picked.
 */
function privateSupply(rec, now) {
  let pipe;
  try { pipe = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'pipeline.json'), 'utf8')); }
  catch { return { ran: false, why: 'No development pipeline held — npm run ingest:pipeline.' }; }
  const d = String(rec.district || '').padStart(2, '0');
  if (!d || d === '00') return { ran: false, why: 'No district on this record, so the pipeline cannot be read for it.' };

  const byDistrict = {};
  for (const p of (pipe.list || [])) {
    const k = String(p.district).padStart(2, '0');
    byDistrict[k] = (byDistrict[k] || 0) + (p.totalUnits || 0);
  }
  const mine = byDistrict[d] || 0;
  const all = Object.values(byDistrict).sort((a, b) => a - b);
  if (all.length < 5) return { ran: false, why: `Only ${all.length} districts carry pipeline units — too few to rank this one against.` };
  const at = p => all[Math.min(all.length - 1, Math.floor(p * all.length))];
  const p25 = at(0.25), p75 = at(0.75);

  /* Low competing supply is the positive here — the inverse of the risk. */
  const points = mine <= p25 ? 2 : mine <= p75 ? 1 : 0;
  const projects = (pipe.list || []).filter(p => String(p.district).padStart(2, '0') === d).length;
  return {
    ran: true, points, value: mine,
    finding: mine
      ? `${mine.toLocaleString()} units across ${projects} project(s) in the URA pipeline for D${d} — `
        + `${points === 2 ? 'among the quieter districts' : points === 1 ? 'about the middle' : 'among the busiest'}, `
        + `against a spread of ${p25.toLocaleString()} to ${p75.toLocaleString()} across the ${all.length} districts with any. `
        + 'Most of that pipeline carries no expected TOP year, so this is what is coming and not when.'
      : `Nothing in the URA pipeline for D${d}. Not the same as nothing being built — the pipeline covers `
        + 'projects URA has counted, and most of it carries no completion date.',
  };
}

export function score(rec, { now = new Date() } = {}) {
  if (!rec) return { ok: false, reason: 'No record.' };
  const n = nearby(rec);
  const self = comps().records?.[rec.href];
  const out = {};

  /* ── lease ─────────────────────────────────────────────────────────── */
  const years = leaseRemaining(rec, now);
  /**
   * ── FREEHOLD SCORES FULL, AND STILL RUNS ────────────────────────────────
   * leaseRemaining returns Infinity for freehold, this asked Number.isFinite,
   * and the best possible lease state fell through to "could not measure" —
   * so 1919, a freehold condo, was scored out of 9 instead of 14 and was
   * penalised by omission. Private carries almost all the freehold stock, so
   * the bug fell entirely on private.
   *
   * The Blindspot rubric already had the lesson and this inherited the shape
   * without it: freehold scores ZERO there and STILL RUNS, because a check
   * that vanishes leaves a reader unable to tell "nothing to worry about"
   * from "we did not look". Same principle, opposite polarity — on a score of
   * what a home has going for it, no lease running down is the top of the
   * scale rather than the bottom.
   */
  const freehold = years === Infinity || (Number.isFinite(years) && years > 99);
  out.lease = freehold
    ? { ran: true, points: FACTORS.lease.max, value: null, freehold: true,
        finding: 'Freehold, or a 999-year lease that behaves like one. There is no lease running down '
               + 'and no relativity to apply — the best state this factor has.' }
    : Number.isFinite(years)
    ? (() => {
        const [, points, say] = band(years, [
          [90, 3, 'barely begun'], [75, 2, 'long'], [60, 1, 'past the gentle part'], [-1, 0, 'short'],
        ]);
        return { ran: true, points, value: Math.round(years),
                 finding: `${Math.round(years)} years left — ${say}. SLA's relativity table is what the `
                        + 'State applies to a lease extension; it is not a valuation.' };
      })()
    : { ran: false, why: 'No remaining lease could be read from this record.' };

  /* ── rail ──────────────────────────────────────────────────────────── */
  const m = n?.rail?.[0]?.m;
  out.rail = Number.isFinite(m)
    ? (() => {
        const [, points, say] = band(-m, [
          [-400, 3, 'very close'], [-700, 2, 'close'], [-1000, 1, 'within a kilometre'], [-1e9, 0, 'beyond a kilometre'],
        ]);
        return { ran: true, points, value: m,
                 finding: `${n.rail[0].name} is ${m}m away in a straight line — ${say}. `
                        + 'Straight-line, not a walk: what sits between is in no dataset held here.' };
      })()
    : { ran: false, why: 'No rail layer for this address — it has no usable coordinate, or the amenity build has not run.' };

  /* ── primary schools ───────────────────────────────────────────────── */
  const within1 = n?.primary?.within1;
  out.primary = Array.isArray(within1)
    ? (() => {
        const [, points] = band(within1.length, [[2, 2], [1, 1], [0, 0]]);
        return { ran: true, points, value: within1.length,
                 finding: within1.length
                   ? `${within1.length} primary school${within1.length > 1 ? 's' : ''} within 1km straight-line: `
                     + within1.slice(0, 3).map(s => `${s.name} (${s.m}m)`).join(', ')
                     + '. The 1km band is BALLOT PRIORITY in P1 registration and never a place.'
                   : 'No primary school within 1km straight-line.' };
      })()
    : { ran: false, why: 'No school layer for this address.' };

  /* ── liquidity ─────────────────────────────────────────────────────── */
  const liq = liquidityFinding(rec);
  out.liquidity = liq && Number.isFinite(liq.rate)
    ? (() => {
        const points = liq.rate >= liq.median ? 2 : liq.rate >= liq.p25 ? 1 : 0;
        return { ran: true, points, value: liq.rate,
                 finding: `About ${liq.rate.toFixed(1)} sales a year here, against a market median of `
                        + `${liq.median} across ${liq.of.toLocaleString()} addresses. `
                        + (points === 2 ? 'Busier than most — easier to exit.'
                          : points === 1 ? 'Around the middle.'
                          : 'Quieter than three quarters of the market — slower to sell, and a buyer has more room.') };
      })()
    : { ran: false, why: 'Not enough filed sales here to measure how often it trades.' };

  /* ── supply ────────────────────────────────────────────────────────── */
  /**
   * ── PRIVATE HAD NO SUPPLY FACTOR AT ALL ─────────────────────────────────
   * This counted HDB flats reaching their fifth year, which is a fact about
   * the HDB market, so every private lookup scored "did not run" and lost two
   * points of denominator. The measurement was right to be skipped and wrong
   * to leave nothing in its place: competing supply is the same question for
   * a condo, asked of a different register.
   *
   * data/pipeline.json is that register — URA's development pipeline, by
   * district. There is no ratio to be had, because district housing STOCK is
   * not held here and inventing a denominator would be worse than having
   * none. So it is scored the way liquidity is: against the distribution of
   * every other district, which is a comparison the data can actually make.
   */
  if (rec.kind !== 'HDB') {
    out.supply = privateSupply(rec, now);
  } else {
  const sup = (self && Number.isFinite(self.lat))
    ? supplyWithin(self.lat, self.lon, { km: 1, years: 5, town: rec.town, from: now }) : null;
  out.supply = sup && Number.isFinite(sup.ratio)
    ? (() => {
        const [, points, say] = band(-sup.ratio, [
          [-0.05, 2, 'little competing supply'], [-0.10, 1, 'a normal amount'], [-1, 0, 'a lot'],
        ]);
        return { ran: true, points, value: sup.ratio,
                 finding: `${(100 * sup.ratio).toFixed(1)}% of flats within 1km reach MOP in the next five years `
                        + `(${sup.upcomingBlocks} blocks, ${sup.upcomingUnits.toLocaleString()} units) — ${say}. `
                        + 'Becoming eligible to sell is not the same as listing.' };
      })()
    : { ran: false, why: 'No coordinate, so nearby blocks cannot be counted.' };
  }

  /* ── daily amenities ───────────────────────────────────────────────── */
  const near500 = k => (Array.isArray(n?.[k]) ? n[k].some(x => Number.isFinite(x.m) && x.m <= 500) : null);
  const have = ['hawker', 'parks', 'childcare'].map(k => [k, near500(k)]);
  out.daily = have.every(([, v]) => v !== null)
    ? (() => {
        const hits = have.filter(([, v]) => v).map(([k]) => k);
        const [, points] = band(hits.length, [[3, 2], [2, 1], [0, 0]]);
        return { ran: true, points, value: hits.length,
                 finding: hits.length
                   ? `Within 500m straight-line: ${hits.join(', ')}.`
                   : 'No hawker centre, park or childcare within 500m straight-line.' };
      })()
    : { ran: false, why: 'No amenity layers for this address.' };

  /* ── the total, over what actually ran ─────────────────────────────── */
  const ran = Object.entries(out).filter(([, v]) => v.ran);
  const points = ran.reduce((s, [, v]) => s + v.points, 0);
  const max = ran.reduce((s, [k]) => s + FACTORS[k].max, 0);
  const skipped = Object.entries(out).filter(([, v]) => !v.ran).map(([k, v]) => ({ key: k, title: FACTORS[k].title, why: v.why }));

  return {
    ok: true, version: VERSION, polarity: POLARITY,
    points, max, ratio: max ? points / max : null,
    factors: Object.entries(out).map(([k, v]) => ({ key: k, title: FACTORS[k].title, max: FACTORS[k].max, ...v })),
    skipped,
    /** Printed wherever the score is, because a denominator that moves is only
     *  honest if the reader can see it moved. */
    basis: skipped.length
      ? `${points} of a possible ${max} — ${skipped.length} factor${skipped.length > 1 ? 's' : ''} could not run and scored nothing.`
      : `${points} of a possible ${max} — every factor ran.`,
  };
}
