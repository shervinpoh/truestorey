/**
 * Fit the three weights to the record instead of choosing them.
 *
 *   npm run tune:avm
 *
 * ── WHAT IS BEING TUNED, AND WHAT IS NOT ───────────────────────────────────
 * Three half-weight distances: metres, months, and share of floor area. That
 * is all. The COHORT RULES are not tuned and must not be — which sales count
 * as this home is a statement about comparability that has to be defensible in
 * words, and a rule fitted to a backtest is a rule nobody can explain to a
 * client. The weights are different: they were chosen by argument in
 * lib/consult/avm.js and the argument was never measured.
 *
 * ── WHY THIS IS EXACT AND NOT AN APPROXIMATION ─────────────────────────────
 * Cohort selection does not depend on the weights, so the cohorts are built
 * once by the backtest (--cohorts) and re-weighted here many times. That is
 * the same arithmetic in a different order, not a shortcut, and it turns a
 * two-minute run per grid point into a whole grid in seconds.
 *
 * ── SPLIT BY ADDRESS, AND REPORT THE HELD-OUT NUMBER ───────────────────────
 * Three parameters fitted on the same sales they are then scored against will
 * always look better than the defaults, and the improvement would be a fact
 * about those sales. Train and test are split on a hash of the href — every
 * sale at one block on one side — and THE TEST FIGURE IS THE RESULT. The
 * training figure is shown only so the gap between them is visible, because
 * that gap is what overfitting looks like.
 *
 * If the held-out improvement is not worth having, this says so and the
 * defaults stand. That is a real outcome, not a failure of the search.
 */
import fs from 'node:fs';
import { WEIGHTS } from '../lib/consult/avm.js';

const IN = 'data/.avm-trials.jsonl';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };

if (!fs.existsSync(IN)) {
  console.error(`${IN} not found. Run:\n  node scripts/backtest-avm.mjs --n 12000 --dump ${IN} --cohorts`);
  process.exit(1);
}
const rows = fs.readFileSync(IN, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  .filter(r => Array.isArray(r.c) && r.c.length && Number.isFinite(r.actual));
if (!rows.length) {
  console.error(`${IN} carries no cohorts. Re-run the backtest with --cohorts.`);
  process.exit(1);
}

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
/* ── THE SPLIT IS A PARAMETER, SO THE RESULT CAN BE TESTED AGAINST IT ─────
 * One split gives one answer and no way to tell a real optimum from the
 * particular blocks that landed in the training half. --split rotates which
 * addresses go where; an optimum that moves when it rotates was never an
 * optimum. */
const SPLIT = Number(arg('split', 0));
const side = r => (hash(r.href) + SPLIT * 37) % 100;
const train = rows.filter(r => side(r) < 60);
const test  = rows.filter(r => side(r) >= 60);

const srt = a => [...a].sort((x, y) => x - y);
const med = a => (a.length ? srt(a)[(a.length - 1) >> 1] : null);

/**
 * The estimate for one trial under one set of weights.
 * `c` rows are [psf, distanceM, ageMonths, gapArea], already sorted by psf —
 * the sort order does not depend on the weights, which is why it is not redone.
 */
function predict(c, w) {
  let total = 0;
  const wt = new Array(c.length);
  for (let i = 0; i < c.length; i++) {
    const [, d, age, ga] = c[i];
    const t = age < 0 ? 0.5 : Math.exp(-age / w.months);
    wt[i] = Math.exp(-d / w.distanceM) * t * Math.exp(-ga / w.areaPct);
    total += wt[i];
  }
  if (!(total > 0)) return null;
  let acc = 0;
  for (let i = 0; i < c.length; i++) {
    acc += wt[i];
    if (acc >= total * 0.5) return c[i][0];
  }
  return c.at(-1)[0];
}

const score = (set, w) => {
  const apes = [];
  for (const r of set) {
    const p = predict(r.c, w);
    if (p !== null) apes.push(Math.abs(p - r.actual) / r.actual);
  }
  return { mdape: med(apes), n: apes.length, within5: apes.filter(v => v <= 0.05).length / apes.length };
};

/**
 * ── THE GRID HAS TO CONTAIN ITS OWN ANSWER ────────────────────────────────
 * The first grid started at 150m and 4% and the search picked both, which is
 * not a minimum — it is a wall. A result sitting on a boundary means the best
 * setting is somewhere outside the values offered, and adopting it would be
 * adopting the edge of an arbitrary list.
 *
 * So both dimensions now run an order of magnitude lower. The TOP ends are
 * kept wide enough to mean "this weight does nothing" — 1400m is most of the
 * widest search radius, 96 months outlives every cohort window, and an area
 * half-weight of 1.0 is larger than the ±10% band the cohort already enforces.
 * An answer at the top of a dimension says that dimension does not earn its
 * place; an answer at the bottom says the grid is still too narrow, and the
 * summary below checks for both.
 */
const GRID = {
  distanceM: [40, 70, 110, 150, 250, 400, 700, 1400],
  months:    [6, 12, 18, 30, 48, 96],
  areaPct:   [0.01, 0.02, 0.04, 0.08, 0.12, 0.25, 1.0],
};

console.log(`${rows.length} trials with cohorts · ${train.length} train / ${test.length} test, split by address (split ${SPLIT})`);
console.log(`grid ${GRID.distanceM.length}×${GRID.months.length}×${GRID.areaPct.length} = ${GRID.distanceM.length * GRID.months.length * GRID.areaPct.length} combinations\n`);

/* --score "110,18,0.04" evaluates ONE weight set instead of searching. The
   set finally adopted is not always the per-split winner — a dimension that
   bounces between splits should keep its explainable default rather than take
   whichever value this split happened to prefer — so the combination that
   actually ships has to be scored on its own. */
const SCORE = arg('score', null);
if (SCORE) {
  const [d, m, a] = SCORE.split(',').map(Number);
  const w = { distanceM: d, months: m, areaPct: a };
  const bt = score(test, WEIGHTS), ct = score(test, w);
  console.log(`  split ${String(arg('split', 0)).padEnd(2)}  default ${(100 * bt.mdape).toFixed(3)}%  →  `
    + `${d}m·${m}mo·${(100 * a).toFixed(0)}% ${(100 * ct.mdape).toFixed(3)}%   `
    + `gain ${((100 * (bt.mdape - ct.mdape))).toFixed(3)}pp   `
    + `within5 ${(100 * bt.within5).toFixed(1)}% → ${(100 * ct.within5).toFixed(1)}%`);
  process.exit(0);
}

let best = null;
const all = [];
for (const distanceM of GRID.distanceM)
  for (const months of GRID.months)
    for (const areaPct of GRID.areaPct) {
      const w = { distanceM, months, areaPct };
      const s = score(train, w);
      all.push({ w, mdape: s.mdape });
      if (!best || s.mdape < best.mdape) best = { w, mdape: s.mdape };
    }

const baseTrain = score(train, WEIGHTS);
const baseTest = score(test, WEIGHTS);
const bestTest = score(test, best.w);

const pc = v => `${(100 * v).toFixed(3)}%`;
console.log('                        half-weights            train      TEST');
console.log(`  current defaults      ${WEIGHTS.distanceM}m · ${WEIGHTS.months}mo · ${(100 * WEIGHTS.areaPct).toFixed(0)}%`.padEnd(46)
  + `${pc(baseTrain.mdape)}   ${pc(baseTest.mdape)}`);
console.log(`  best on train         ${best.w.distanceM}m · ${best.w.months}mo · ${(100 * best.w.areaPct).toFixed(0)}%`.padEnd(46)
  + `${pc(best.mdape)}   ${pc(bestTest.mdape)}`);

const gain = baseTest.mdape - bestTest.mdape;
const overfit = (baseTrain.mdape - best.mdape) - gain;
console.log(`\n  held-out gain         ${gain >= 0 ? '−' : '+'}${Math.abs(100 * gain).toFixed(3)}pp`);
console.log(`  of the training gain, ${(100 * overfit).toFixed(3)}pp did not survive the split`);

/* ── SENSITIVITY ─────────────────────────────────────────────────────────
 * How much each dimension moves the answer at all. A parameter whose best and
 * worst settings differ by a hundredth of a point is not a parameter worth
 * having, whatever value the search picked for it. */
console.log('\n  what each dimension is worth, holding the other two at the best found:');
for (const k of Object.keys(GRID)) {
  const line = GRID[k].map(v => ({ v, m: score(train, { ...best.w, [k]: v }).mdape }));
  const lo = Math.min(...line.map(x => x.m)), hi = Math.max(...line.map(x => x.m));
  console.log(`    ${k.padEnd(10)} ${line.map(x => (k === 'areaPct' ? (100 * x.v).toFixed(0) + '%' : x.v) + ':' + (100 * x.m).toFixed(2)).join('  ')}`);
  console.log(`    ${''.padEnd(10)} spread ${(100 * (hi - lo)).toFixed(3)}pp`);
}

/* A result on a boundary is not a result. */
const edges = Object.keys(GRID).filter(k => best.w[k] === GRID[k][0] || best.w[k] === GRID[k].at(-1));
const lowEdges = edges.filter(k => best.w[k] === GRID[k][0]);

console.log('\n' + '─'.repeat(72));
if (lowEdges.length) {
  console.log(`GRID TOO NARROW. The search picked the SMALLEST value offered for `
    + `${lowEdges.join(' and ')},`);
  console.log('so the best setting is somewhere below the list and this is a boundary,');
  console.log('not a minimum. Widen the grid downward and run again before adopting it.');
  process.exit(0);
}
if (gain <= 0) {
  console.log('KEEP THE DEFAULTS. The search found nothing that survived the split —');
  console.log('the training improvement was a fact about those sales, not about the method.');
} else if (gain < 0.002) {
  console.log(`KEEP THE DEFAULTS. ${(100 * gain).toFixed(3)}pp held out is inside the noise of which`);
  console.log('addresses landed in which half, and three hand-chosen numbers that can be');
  console.log('explained to a client are worth more than three fitted ones that cannot.');
} else {
  console.log(`ADOPT: distanceM ${best.w.distanceM}, months ${best.w.months}, areaPct ${best.w.areaPct}`);
  console.log(`Held-out median error ${pc(baseTest.mdape)} → ${pc(bestTest.mdape)}.`);
  console.log('Update WEIGHTS in lib/consult/avm.js, then REBUILD THE ERROR TABLE —');
  console.log('it describes the estimator that produced it: npm run build:avm-error');
}
