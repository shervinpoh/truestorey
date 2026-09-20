/**
 * Stacks — the comparison only a unit number makes possible.
 *
 * ── WHY THIS IS THE WHOLE POINT OF A REALIS EXPORT ────────────────────────
 * Four things move a private price that no public dataset records: which way
 * the unit faces, whether it is a corner or sits on a corridor, what it looks
 * out at, and what it can hear. They are most of what is left in the AVM's
 * error, and the honest position has always been that a viewing is what
 * settles them.
 *
 * A STACK HOLDS ALL FOUR CONSTANT. Units sharing one sit directly above each
 * other: same orientation, same position on the floor plate, same outlook,
 * same exposure. So a stack's premium over its own project prices those four
 * jointly, and none of them ever has to be estimated separately. That is
 * unreachable from URA's public feed, which publishes a five-storey band and
 * no unit, and it is the single reason a licensed export earns its fee.
 *
 * The same structure gives the cleanest floor premium available anywhere:
 * two sales in ONE stack differ by height and by nothing else at all. The
 * within-building curve in build-storey.mjs holds the estate, lease and model
 * constant; this holds the unit itself constant.
 *
 * ── WHAT IT CANNOT SEE ────────────────────────────────────────────────────
 * A large development may reuse unit numbers across towers, in which case two
 * genuinely different stacks merge into one and their premium is an average
 * of two positions. Nothing in an export distinguishes them, so `towers` is
 * reported when a stack's sales span implausibly many floors and the caller
 * is told rather than the figure being quietly published.
 */
import fs from 'node:fs';
import path from 'node:path';
import { timebase } from './timebase.js';

export const VERSION = '2026-09-stacks-v1';

/** A stack needs this many filed sales before its premium means anything. */
export const MIN_SALES = 3;
/** And this many before a within-stack floor comparison is attempted. */
export const MIN_FLOORS = 2;

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };

/**
 * REALIS writes dates as "Mar-26". Also handles "03/26" and an ISO month.
 * Returns "YYYY-MM", which sorts lexically, or null — never a guess.
 */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function monthOf(d) {
  const s = String(d || '').trim();
  let m = s.match(/^([A-Za-z]{3})[-\s/]?(\d{2,4})$/);
  if (m) {
    const mm = MONTHS[m[1].toLowerCase()];
    if (!mm) return null;
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${String(mm).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const mm = Number(m[1]);
    if (mm < 1 || mm > 12) return null;
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${String(mm).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  /* A month out of range means the string is not what it looked like. It
     restates a price by an arbitrary amount of index and still reads as a
     plausible figure, so it fails rather than passing through. */
  return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
}

export function loadRealis(root = process.cwd()) {
  const p = path.join(root, 'data', '.realis.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * @param project the URA project name, as it appears in the export
 */
export function stackProfile(project, { root = process.cwd(), now = new Date() } = {}) {
  const store = loadRealis(root);
  if (!store) return { ok: false, reason: 'No REALIS export has been imported. Add one on the Data page.' };

  /* REALIS files a project name in its own casing and spacing; the site's
     record label comes from URA's feed. Match on a normalised form rather
     than making the caller know which spelling this export used. */
  const key = norm(project);
  const rows = (store.rows || []).filter(r => norm(r.project) === key && r.stack);
  if (!rows.length) {
    const held = new Set((store.rows || []).map(r => r.project)).size;
    return { ok: false, reason: `No unit-numbered sales for "${project}". The export holds ${held} project(s); either it does not cover this one, or it came without a Unit No column.` };
  }

  /* Restated into one quarter, so a stack that happened to sell in 2021 is not
     compared against one that sold last month. The same index the AVM uses. */
  const tb = timebase('PRIVATE', rows[0]?.propertyType || 'Condominium', { asOf: now });
  const adjust = (psf, date) => {
    const m = monthOf(date);
    const moved = tb && m ? tb.adjust(psf, m) : null;
    return moved ? moved.psf : psf;
  };

  const all = rows.map(r => ({ ...r, month: monthOf(r.date), psfAdj: adjust(r.psf, r.date) }));
  const projectMedian = med(all.map(r => r.psfAdj));

  const byStack = new Map();
  for (const r of all) {
    if (!byStack.has(r.stack)) byStack.set(r.stack, []);
    byStack.get(r.stack).push(r);
  }

  /**
   * The cleanest floor premium there is: within one stack, two sales differ
   * by height and by nothing else. Pooled across stacks as a percentage per
   * floor so a project with few sales per stack can still say something.
   *
   * This is computed BEFORE the stack medians because it has to be netted
   * out of them. A stack whose sales happened to land on high floors reads
   * as a premium position when it is only a tall sample, and that error goes
   * the wrong way most often in exactly the towers worth analysing.
   */
  const perFloor = [];
  for (const [, rs] of byStack) {
    const withFloor = rs.filter(r => Number.isFinite(r.floor));
    if (withFloor.length < MIN_FLOORS) continue;
    const lo = withFloor.reduce((a, b) => (a.floor <= b.floor ? a : b));
    const hi = withFloor.reduce((a, b) => (a.floor >= b.floor ? a : b));
    if (hi.floor === lo.floor || !(lo.psfAdj > 0)) continue;
    perFloor.push((hi.psfAdj / lo.psfAdj - 1) / (hi.floor - lo.floor));
  }
  const perFloorPct = perFloor.length >= 3 ? med(perFloor) : null;
  const floorPremium = perFloorPct !== null
    ? { ran: true, perFloorPct, pairs: perFloor.length,
        says: `Within a single stack — same facing, same corner or corridor position, same outlook — a floor is `
            + `worth about ${(100 * perFloorPct).toFixed(2)}% here, measured across ${perFloor.length} stacks. `
            + 'Nothing else differs between the two sales in each pair.' }
    : { ran: false, why: `Only ${perFloor.length} stack(s) have sales on two different floors. Three is the floor for a per-floor figure.` };

  /* Every sale restated to one reference floor as well as one quarter, so a
     stack's premium is its POSITION and not the height of its sample. Where
     the per-floor figure could not be measured this is a no-op and the
     result says the premium still carries height. */
  const withFloors = all.map(r => r.floor).filter(Number.isFinite);
  const refFloor = withFloors.length ? med(withFloors) : null;
  const levelled = r => {
    if (perFloorPct === null || refFloor === null || !Number.isFinite(r.floor)) return r.psfAdj;
    const f = 1 + perFloorPct * (r.floor - refFloor);
    return f > 0.2 ? r.psfAdj / f : r.psfAdj;
  };
  for (const r of all) r.psfLevel = levelled(r);
  const projectLevelMedian = med(all.map(r => r.psfLevel));

  const stacks = [];
  let thin = 0;
  for (const [stack, rs] of byStack) {
    if (rs.length < MIN_SALES) { thin++; continue; }
    const floors = rs.map(r => r.floor).filter(Number.isFinite);
    const m = med(rs.map(r => r.psfLevel));
    stacks.push({
      stack, n: rs.length,
      floorLow: floors.length ? Math.min(...floors) : null,
      floorHigh: floors.length ? Math.max(...floors) : null,
      medianPsf: Math.round(med(rs.map(r => r.psfAdj))),
      levelledPsf: Math.round(m),
      medianAreaSqm: Math.round(med(rs.map(r => r.areaSqm))),
      premium: projectLevelMedian ? m / projectLevelMedian - 1 : null,
      /* A stack whose sales span more floors than a tower plausibly has is
         probably two stacks in two towers sharing a number. */
      possiblyTwoTowers: floors.length > 1 && (Math.max(...floors) - Math.min(...floors)) > 60,
      sales: rs.sort((a, b) => (b.month || '').localeCompare(a.month || ''))
        .map(r => ({ unit: r.unit, floor: r.floor, month: r.month, areaSqm: r.areaSqm,
                     psf: Math.round(r.psf), psfAdj: Math.round(r.psfAdj), psfLevel: Math.round(r.psfLevel) })),
    });
  }
  stacks.sort((a, b) => b.premium - a.premium);

  const best = stacks[0], worst = stacks.at(-1);
  return {
    ok: true, version: VERSION, project,
    transactions: all.length, stacksSeen: byStack.size, stacksScored: stacks.length, thin,
    projectMedianPsf: Math.round(projectMedian),
    projectLevelledPsf: Math.round(projectLevelMedian),
    restatedTo: tb?.targetQuarter || null,
    levelledToFloor: perFloorPct !== null ? refFloor : null,
    heightNetted: perFloorPct !== null,
    stacks, floorPremium,
    says: stacks.length >= 2 && best && worst
      ? `Stack ${best.stack} trades ${(100 * Math.abs(best.premium)).toFixed(1)}% ${best.premium > 0 ? 'above' : 'below'} the project and `
        + `stack ${worst.stack} ${(100 * Math.abs(worst.premium)).toFixed(1)}% ${worst.premium > 0 ? 'above' : 'below'} it — `
        + `a spread of ${(100 * (best.premium - worst.premium)).toFixed(1)} points between two positions in the same building. `
        + 'That spread is facing, corner, outlook and noise priced together, without any of them being named.'
      : `${stacks.length} stack(s) cleared ${MIN_SALES} sales. A premium from fewer than that is one sale's opinion.`,
  };
}

/**
 * One stack's premium, for a valuation that knows its unit number.
 *
 * ── WHY THIS IS REPORTED BESIDE AN ESTIMATE AND NOT FOLDED INTO IT ────────
 * The AVM's 2.99% median error is a backtested figure: every component in it
 * was switched off and measured, over rolling origins, on data truncated to
 * the as-of date. A REALIS export carries no such history here — it is a
 * snapshot, imported once, with no way to ask what it would have said in
 * 2022. So this adjustment cannot be backtested yet, and an untested term
 * folded into a tested estimate silently degrades a number whose accuracy is
 * the entire claim.
 *
 * It is therefore published as its own line, with its own evidence and its
 * own sample size, for a human to apply or ignore. When an export arrives
 * with enough history to truncate, this becomes a candidate for the ladder
 * and gets measured like everything else.
 */
export function stackAdjust(project, stack, opts = {}) {
  if (!stack) return { ran: false, why: 'No unit number given, so no stack to price.' };
  const p = stackProfile(project, opts);
  if (!p.ok) return { ran: false, why: p.reason };

  const key = String(stack).trim().toUpperCase();
  const hit = p.stacks.find(s => String(s.stack).toUpperCase() === key);
  if (!hit) {
    const thin = p.thin ? ` ${p.thin} stack(s) in this project were seen but had fewer than ${MIN_SALES} sales.` : '';
    return { ran: false, why: `Stack ${key} has no scored sales in the export.${thin} A premium from fewer than ${MIN_SALES} sales is one sale's opinion.` };
  }
  return {
    ran: true, version: VERSION,
    stack: hit.stack, n: hit.n, premium: hit.premium,
    levelledPsf: hit.levelledPsf, projectLevelledPsf: p.projectLevelledPsf,
    heightNetted: p.heightNetted, restatedTo: p.restatedTo,
    possiblyTwoTowers: hit.possiblyTwoTowers,
    sales: hit.sales,
    says: `Stack ${hit.stack} has filed ${hit.n} sales and trades ${(100 * Math.abs(hit.premium)).toFixed(1)}% `
        + `${hit.premium >= 0 ? 'above' : 'below'} this project once every sale is restated to ${p.restatedTo}`
        + (p.heightNetted ? ` and levelled to floor ${p.levelledToFloor}` : '')
        + `. That is its facing, its corner or corridor position, its outlook and its noise, priced together.`
        + (p.heightNetted ? '' : ' Height could not be netted out here, so some of it is the floors this stack happened to sell on.')
        + (hit.possiblyTwoTowers ? ' These sales span more floors than one tower plausibly has — the number may be shared by two stacks in two towers.' : ''),
    /** Deliberately NOT applied to the estimate. See the header above. */
    applyTo: psf => Math.round(psf * (1 + hit.premium)),
  };
}
