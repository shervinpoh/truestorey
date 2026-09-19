/**
 * Does the AVM hold up in a market that moved?
 *
 *   npm run backtest:rolling
 *   node scripts/backtest-rolling.mjs --from 2019-01 --per 150 --ablate floor
 *
 * ── WHY THE EXISTING BACKTEST IS NOT ENOUGH ────────────────────────────────
 * `scripts/backtest-avm.mjs` holds out the last six months and reports about
 * 3.15%. That number is true and it is a fact about ONE market — a flat one.
 * It says nothing about the 2018 cooling measures, the 2020 circuit breaker or
 * the 2021-22 run-up, and those are the conditions under which a valuation is
 * most likely to be wrong and most expensive to be wrong about.
 *
 * This walks the whole record instead, predicting each month using only what
 * had been filed before it.
 *
 * ── AS-OF BY CONSTRUCTION, NOT BY A FILTER ─────────────────────────────────
 * The market is built forward. Each month is PREDICTED first and only then
 * folded in, so a sale that has not been added cannot be seen. There is no
 * `month < asOf` comparison anywhere in the loop to get subtly wrong — which
 * is how the first backtest in this repo nearly shipped a leak, because
 * sameRecordPrice filters on a lower bound and has no upper one.
 *
 * ── THE ONE LEAK THAT REMAINS, AND HOW IT IS BOUNDED ───────────────────────
 * `data/storey.json` is fitted on today's sales, so a 2019 prediction uses a
 * floor curve built partly from 2024. It is structural rather than a price
 * level — what a floor is worth inside a block moves far more slowly than the
 * market — but it is information from the future and calling it anything else
 * would be dishonest.
 *
 * It is bounded rather than argued away: run with `--ablate floor` and the
 * leak is gone entirely. If the shape across regimes is the same both ways,
 * the leak is not driving the conclusion. That comparison is the point of the
 * flag and it should be run before any figure here is quoted.
 */
import fs from 'node:fs';
import { loadHistory, byMonth, MarketAsOf } from '../lib/consult/history.js';
import { estimate } from '../lib/consult/avm.js';
import { floorMid } from '../lib/blindspot/measure.js';
import { hdbHref } from '../lib/name.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const FROM = arg('from', '2019-01');
const PER = Number(arg('per', 120));      // sampled predictions per month
const WARM = Number(arg('warm', 24));     // months folded in before the first prediction
const ABLATE = String(arg('ablate', '')).split(',').filter(Boolean);
const off = k => ABLATE.includes(k);
const SEED = Number(arg('seed', 1));

/**
 * ── SEGMENTS ──────────────────────────────────────────────────────────────
 *   --by town,flatType,lease,price,confidence
 *
 * One national error figure hides where the tool should not be trusted, which
 * is exactly what Shervin needs to know before he opens his mouth in a living
 * room. `confidence` is the important one and it is a GATE rather than a
 * report — see the verdict at the end.
 */
const BY = String(arg('by', '')).split(',').filter(Boolean);

const LEASE_BANDS = [[0, 60, 'under 60y'], [60, 70, '60-70y'], [70, 80, '70-80y'],
                     [80, 90, '80-90y'], [90, 999, '90y+']];
const PRICE_BANDS = [[0, 400e3, 'under 400k'], [400e3, 600e3, '400-600k'],
                     [600e3, 800e3, '600-800k'], [800e3, 1e6, '800k-1m'], [1e6, 1e12, '1m+']];
const bandOf = (v, bands) => bands.find(([lo, hi]) => v >= lo && v < hi)?.[2] || 'unknown';

const SQFT_PER_SQM = 10.7639;
const srt = a => [...a].sort((x, y) => x - y);
const med = a => (a.length ? srt(a)[(a.length - 1) >> 1] : null);
const pct = (n, d) => (d ? 100 * n / d : 0);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hist = loadHistory();
if (!hist) {
  console.error('data/.hdb-history.json not found. Run:\n  npm run ingest:hdb:history');
  process.exit(1);
}
const grouped = byMonth(hist);
const c = grouped.columns;

/* The HDB index, so each fold is labelled by what the market did rather than
   by anybody's memory of it. */
let idx = null;
try {
  const d = JSON.parse(fs.readFileSync('data/hdb-index.json', 'utf8'));
  idx = new Map(d.points.map(p => [p.quarter, p.index]));
} catch { /* a fold with no label is still a fold */ }
const quarterOf = m => `${m.slice(0, 4)}-Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`;

console.log(`Rolling-origin backtest · ${hist.span.from} → ${hist.span.to} · `
  + `${hist.count.toLocaleString()} filed sales`);
if (ABLATE.length) console.log(`Ablating: ${ABLATE.join(', ')}`);

const market = new MarketAsOf({ columns: c });
const rnd = mulberry32(SEED);
const results = [];
let predicted = 0, notRun = 0, noRecord = 0;

for (const month of grouped.months) {
  const rows = grouped.map.get(month);

  /* Warm-up: fold in without predicting. A cohort needs history behind it and
     the first months of the record have none. */
  if (month < FROM || market.added.length < WARM) {
    market.add(rows); market.added.push(month);
    continue;
  }

  /* Sample, deterministically. Every sale would be ~2,000 predictions a month
     and the extra precision is not worth the hours. */
  const pick = [];
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (const r of pool.slice(0, PER)) pick.push(r);

  for (const r of pick) {
    /* hdbHref, not a second slugger. The market index was keyed with it, so a
       local copy that drifted by one character would silently find nothing and
       report it as "no prior sale at that address". */
    const rec = market.record(hdbHref(r[c.town], r[c.block], r[c.street]));
    if (!rec) { noRecord++; continue; }

    const out = estimate(rec, {
      areaSqft: r[c.areaSqm] * SQFT_PER_SQM,
      floor: off('floor') ? null : floorMid(r[c.storeyRange]),
      asOf: new Date(`${month}-15T00:00:00Z`),
      index: market.index(),
      useIndex: !off('index'),
      unionRungs: !off('union'),
    });
    if (!out.ok) { notRun++; continue; }
    const actualPsf = r[c.price] / (r[c.areaSqm] * SQFT_PER_SQM);
    predicted++;
    /* Lease remaining AS AT THE SALE, not as at today — the whole file is
       about not letting the present leak into the past. */
    const yearsLeft = r[c.leaseCommence] + 99 - Number(month.slice(0, 4));
    results.push({
      month,
      ape: Math.abs(out.psf - actualPsf) / actualPsf,
      spe: (out.psf - actualPsf) / actualPsf,
      town: r[c.town],
      flatType: r[c.flatType],
      lease: bandOf(yearsLeft, LEASE_BANDS),
      price: bandOf(r[c.price], PRICE_BANDS),
      /* What the error table PREDICTED for this lookup, so the prediction can
         be graded against the outcome. */
      band: out.error?.band || null,
      predMedian: out.error?.medianPct ?? null,
      predP90: out.error?.p90Pct ?? null,
    });
  }

  market.add(rows); market.added.push(month);
  process.stdout.write(`\r  ${month}  predicted ${predicted.toLocaleString()}`);
}
console.log('\n');

/* ── FOLDS ────────────────────────────────────────────────────────────────
 * Half-years. Short enough that a regime does not average away inside one,
 * long enough to carry a few hundred predictions. */
const foldOf = m => `${m.slice(0, 4)} H${Number(m.slice(5, 7)) <= 6 ? 1 : 2}`;
const folds = new Map();
for (const r of results) {
  if (!folds.has(foldOf(r.month))) folds.set(foldOf(r.month), []);
  folds.get(foldOf(r.month)).push(r);
}

const marketMove = (fold) => {
  if (!idx) return '';
  const [y, h] = fold.split(' H');
  const from = `${y}-Q${h === '1' ? 1 : 3}`, to = `${y}-Q${h === '1' ? 2 : 4}`;
  const a = idx.get(from), b = idx.get(to);
  return (a && b) ? `${b > a ? '+' : ''}${(100 * (b / a - 1)).toFixed(1)}%` : '';
};

console.log('  fold        n      MdAPE   w/in5   w/in10   bias    HDB index');
console.log('  ' + '─'.repeat(64));
for (const [fold, rs] of [...folds].sort()) {
  const a = rs.map(x => x.ape);
  console.log(`  ${fold.padEnd(10)} ${String(rs.length).padStart(5)}   `
    + `${(100 * med(a)).toFixed(2)}%   `
    + `${pct(a.filter(v => v <= 0.05).length, a.length).toFixed(0).padStart(3)}%    `
    + `${pct(a.filter(v => v <= 0.10).length, a.length).toFixed(0).padStart(3)}%   `
    + `${(100 * med(rs.map(x => x.spe)) >= 0 ? '+' : '')}${(100 * med(rs.map(x => x.spe))).toFixed(1)}%   `
    + `${marketMove(fold).padStart(6)}`);
}

const all = results.map(r => r.ape);
console.log('  ' + '─'.repeat(64));
console.log(`  ${'ALL'.padEnd(10)} ${String(results.length).padStart(5)}   `
  + `${(100 * med(all)).toFixed(2)}%   `
  + `${pct(all.filter(v => v <= 0.05).length, all.length).toFixed(0).padStart(3)}%    `
  + `${pct(all.filter(v => v <= 0.10).length, all.length).toFixed(0).padStart(3)}%`);

const byFold = [...folds].map(([f, rs]) => ({ f, m: med(rs.map(x => x.ape)) })).sort((a, b) => a.m - b.m);
console.log(`\n  best fold   ${byFold[0].f}  ${(100 * byFold[0].m).toFixed(2)}%`);
console.log(`  worst fold  ${byFold.at(-1).f}  ${(100 * byFold.at(-1).m).toFixed(2)}%`);
console.log(`  spread      ${(100 * (byFold.at(-1).m - byFold[0].m)).toFixed(2)}pp across ${folds.size} half-years`);

/* ── SEGMENT REPORTS ──────────────────────────────────────────────────── */
const MIN_SEG = 40;
const segReport = (label, keyFn) => {
  const g = new Map();
  for (const r of results) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  }
  const rows = [...g].map(([k, rs]) => ({ k, n: rs.length, m: med(rs.map(x => x.ape)),
                                          w10: pct(rs.filter(x => x.ape <= 0.10).length, rs.length),
                                          bias: med(rs.map(x => x.spe)) }))
    .filter(r => r.n >= MIN_SEG)
    .sort((a, b) => b.m - a.m);
  if (!rows.length) return console.log(`\n  ${label}: no segment reached ${MIN_SEG} predictions.`);
  console.log(`\n  ${label}  (segments under ${MIN_SEG} predictions are withheld, not merged)`);
  console.log(`    ${'segment'.padEnd(22)}     n    MdAPE   w/in10    bias`);
  for (const r of rows) {
    console.log(`    ${String(r.k).padEnd(22)} ${String(r.n).padStart(5)}   `
      + `${(100 * r.m).toFixed(2)}%    ${r.w10.toFixed(0).padStart(3)}%   `
      + `${r.bias >= 0 ? '+' : ''}${(100 * r.bias).toFixed(1)}%`);
  }
  const withheld = [...g].filter(([, rs]) => rs.length < MIN_SEG).length;
  if (withheld) console.log(`    ${withheld} segment(s) withheld for thin samples.`);
};

if (BY.includes('town')) segReport('BY TOWN', r => r.town);
if (BY.includes('flatType')) segReport('BY FLAT TYPE', r => r.flatType);
if (BY.includes('lease')) segReport('BY LEASE REMAINING AT SALE', r => r.lease);
if (BY.includes('price')) segReport('BY PRICE BAND', r => r.price);

/**
 * ── THE CONFIDENCE GATE ───────────────────────────────────────────────────
 * A confidence label that does not predict accuracy is decoration, and worse
 * than none — it puts a number on a hunch and invites the reader to trust the
 * tight ones. So this is a PASS/FAIL, not a table:
 *
 *   1. ORDERING. tight must actually beat workable, which must beat wide.
 *   2. COVERAGE. Each band's predicted p90 must contain about nine in ten of
 *      its own outcomes.
 *
 * Graded here against 2019-2026, while data/avm-error.json was built on the
 * last months only — so this is out-of-sample in time as well as in address.
 */
if (BY.includes('confidence')) {
  const ORDER = ['tight', 'workable', 'wide'];
  const g = new Map();
  for (const r of results) { if (!r.band) continue; (g.get(r.band) || g.set(r.band, []).get(r.band)).push(r); }
  const rows = ORDER.filter(b => g.has(b)).map(b => {
    const rs = g.get(b);
    return { b, n: rs.length, m: med(rs.map(x => x.ape)),
             underP90: pct(rs.filter(x => x.predP90 != null && x.ape <= x.predP90).length, rs.length),
             underMed: pct(rs.filter(x => x.predMedian != null && x.ape <= x.predMedian).length, rs.length) };
  });
  console.log(`\n  CONFIDENCE CALIBRATION  (table built on recent months, graded on ${results.length.toLocaleString()} predictions 2019-2026)`);
  console.log(`    ${'band'.padEnd(12)}     n    actual MdAPE    under predicted p90    under predicted median`);
  for (const r of rows) {
    console.log(`    ${r.b.padEnd(12)} ${String(r.n).padStart(5)}        ${(100 * r.m).toFixed(2)}%`
      + `                  ${r.underP90.toFixed(1)}%                    ${r.underMed.toFixed(1)}%`);
  }
  const ordered = rows.every((r, i) => i === 0 || rows[i - 1].m <= r.m);
  const covered = rows.every(r => r.underP90 >= 85 && r.underP90 <= 95);
  console.log(`\n    ordering  ${ordered ? 'PASS' : 'FAIL'} — a tighter band must actually be more accurate`);
  console.log(`    coverage  ${covered ? 'PASS' : 'FAIL'} — each band's p90 should contain 85-95% of its own outcomes`);
  if (!ordered || !covered) {
    console.log(`\n    RECALIBRATE before this label is shown to anyone. A confidence word`);
    console.log(`    that does not predict accuracy is worse than no word at all.`);
  }
}

const cov = market.coverage();
console.log(`\n  coverage: ${predicted.toLocaleString()} predicted · ${notRun.toLocaleString()} scored nothing `
  + `· ${noRecord.toLocaleString()} had no prior sale at that address`);
console.log(`  addresses: ${cov.addresses.toLocaleString()} seen, ${cov.withoutCoordinate.toLocaleString()} without a coordinate `
  + `(subjects only, never comparables)`);
