/**
 * One property, every step of the arithmetic.
 *
 *   npm run avm -- --q "ang mo kio ave 3" --sqft 1001 --floor 10
 *   npm run avm -- --href /condo/the-sail --sqft 700 --floor 30 --asking 2450
 *   npm run avm -- --href /hdb/bedok/649-jln-tenaga --sqft 1313 --floor 9 --price 858000
 *
 * ── WHY THIS EXISTS AND IS NOT A DEBUG SCRIPT ──────────────────────────────
 * The Blindspot rubric is a PUBLISHED FORMULA rendered beside its own result,
 * on the argument that a score nobody can check is an opinion wearing a
 * number's clothes. An estimate is the same claim with more at stake, and it
 * is worse off in one respect: Shervin says it out loud, in a living room, to
 * someone who may push back.
 *
 * So the tool prints the working. Every comparable, what it filed at, what
 * each of the three adjustments did to it, what it ended up weighing and why.
 * The number at the bottom is then not something to be trusted — it is
 * something to be read.
 *
 * `--asking` turns it from a valuation into the over/under question, which is
 * the thing the site is not allowed to answer and this is.
 */
import { search, recordByHref } from '../lib/data/query.js';
import { estimate, WEIGHTS } from '../lib/consult/avm.js';
import { wrap, rule, f } from './term.mjs';

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const pad = (s, n, right = false) => right ? String(s).padStart(n) : String(s).padEnd(n);

const href = arg('href');
const q = arg('q');
let rec = href ? recordByHref(href) : null;
if (!rec && q) {
  const hits = search(q, { limit: 5 });
  if (!hits.length) { console.error(`Nothing matched "${q}".`); process.exit(1); }
  if (hits.length > 1 && !arg('first')) {
    console.log(`"${q}" matched ${hits.length}. Pass --href, or --first to take the top one:`);
    for (const h of hits) console.log(`  ${h.href}  ${h.label}`);
    process.exit(0);
  }
  rec = recordByHref(hits[0].href);
}
if (!rec) { console.error('Pass --href or --q.'); process.exit(1); }

const sqft = Number(arg('sqft'));
const floor = arg('floor') ? Number(arg('floor')) : null;
/* --asking is a psf; --price is what the listing actually says. Both are
   supported explicitly rather than guessing from magnitude — a threshold that
   silently reinterprets an input is how a typo becomes a valuation. */
const askPrice = arg('price') ? Number(arg('price')) : null;
const asking = askPrice ? askPrice / Number(arg('sqft')) : (arg('asking') ? Number(arg('asking')) : null);
if (!(sqft > 0)) { console.error('--sqft is required: psf alone describes the address, not the home.'); process.exit(1); }

const r = estimate(rec, { areaSqft: sqft, floor });

console.log(`\n\x1b[1m${rec.label}\x1b[0m`);
console.log(`${sqft} sqft${floor ? ` · floor ${floor}` : ' · no floor given'} · ${rec.kind}`);

if (!r.ok) {
  rule('NOT RUN');
  console.log(r.reason);
  console.log('\nThis is the honest state, not a failure to work around. A wider');
  console.log('radius would answer a different question and present it as this one.');
  process.exit(0);
}

const e = r.evidence;

rule('1 · THE COHORT');
console.log('Which filed sales count as this home, and how the engine got there.');
console.log(`\n  type          ${e.flatType}  (${e.flatTypeBasis})`);
console.log(`  floor area    ${e.targetAreaSqm} sqm, matched ${e.areaFromSqm ?? '—'}–${e.areaToSqm ?? '—'} sqm`);
if (e.tenure) console.log(`  tenure        ${e.tenure}`);
console.log(`\n  rung                      n    window   radius`);
for (const g of e.rungs) {
  console.log(`  ${pad(g.basis === 'block' ? 'this address' : 'nearby addresses', 22)} ${pad(g.n, 4, true)}    ${pad(g.months + 'mo', 6)}   ${g.radiusKm ? g.radiusKm + 'km' : '—'}`);
}
console.log(`\n  \x1b[1munion: ${e.sample} comparables\x1b[0m — ${e.fromAddress} at this address, ${e.fromNearby} nearby`);
if (e.floorAdjusted) {
  console.log(`  floor curve   ${e.floorAdjusted.moved} of ${e.floorAdjusted.of} restated onto floor ${e.floorAdjusted.to}` +
    (e.floorAdjusted.capped ? `, ${e.floorAdjusted.capped} capped` : ''));
  console.log(`                basis \x1b[1m${e.floorAdjusted.basis}\x1b[0m · ${e.floorAdjusted.where}`
    + (e.floorAdjusted.basis === 'town bands'
      ? ` \x1b[33m(fallback — confounded by building age; no within-building curve here)\x1b[0m` : ''));
}

rule('2 · EACH COMPARABLE, AND WHAT WAS DONE TO IT');
console.log(`  ${pad('month', 8)}${pad('filed', 7, true)}${pad('→floor', 8, true)}${pad('×index', 8, true)}${pad('=adj', 7, true)}` +
            `${pad('dist', 7, true)}${pad('age', 5, true)}  ${pad('w.dist', 7, true)}${pad('w.time', 7, true)}${pad('w.area', 7, true)}${pad('weight', 8, true)}`);
const shown = [...r.comparables].sort((a, b) => b.weight - a.weight);
for (const c of shown) {
  console.log(`  ${pad(c.month, 8)}${pad(c.psfFiled ?? c.psfPreIndex, 7, true)}${pad(c.psfFiled ? c.psfPreIndex : '—', 8, true)}` +
    `${pad(c.indexFactor ? c.indexFactor.toFixed(3) : '—', 8, true)}${pad(c.psf, 7, true)}` +
    `${pad((c.distanceM || 0) + 'm', 7, true)}${pad(c.ageMonths + 'mo', 5, true)}  ` +
    `${pad(c.w.distance.toFixed(3), 7, true)}${pad(c.w.time.toFixed(3), 7, true)}${pad(c.w.area.toFixed(3), 7, true)}${pad(c.weight.toFixed(3), 8, true)}`);
}
const total = shown.reduce((s, c) => s + c.weight, 0);
console.log(`\n  weight = w.dist × w.time × w.area,  each = exp(−gap / half-weight)`);
console.log(`  half-weights: ${r.weights.distanceM}m · ${r.weights.months}mo · ${(r.weights.areaPct * 100).toFixed(0)}% of area`);
console.log(`  total weight ${total.toFixed(2)} across ${shown.length} sales — an effective sample, not a count.`);

rule('3 · THE WEIGHTED MEDIAN');
console.log('Sorted by adjusted psf. The estimate is the price at which cumulative');
console.log('weight crosses half — a price some home actually transacted at, never');
console.log('a point interpolated between two of them.\n');
const asc = [...r.comparables].sort((a, b) => a.psf - b.psf);
let acc = 0;
for (const c of asc) {
  acc += c.weight;
  const share = acc / total;
  const mark = c.psf === r.psf ? ' \x1b[1m← median\x1b[0m'
    : (c.psf === r.band.psfLow ? ' \x1b[2m← p25\x1b[0m' : (c.psf === r.band.psfHigh ? ' \x1b[2m← p75\x1b[0m' : ''));
  console.log(`  ${pad(c.psf, 6, true)} psf   +${pad(c.weight.toFixed(3), 6, true)}   cum ${pad((share * 100).toFixed(1) + '%', 7, true)}${mark}`);
}

rule('4 · THE ANSWER');
console.log(`  \x1b[1mpsf ${r.psf}\x1b[0m          S$${f(r.price)}`);
console.log(`  band ${r.band.psfLow}–${r.band.psfHigh}     S$${f(r.band.priceLow)} – S$${f(r.band.priceHigh)}`);
console.log(`  \x1b[2mfull spread ${r.spread.psfLow}–${r.spread.psfHigh} psf\x1b[0m`);
console.log(`\n  The band is the weighted interquartile range of what comparable homes`);
console.log(`  ACTUALLY TRANSACTED AT. It is not ±x% of the estimate, and it is not a`);
console.log(`  confidence interval — no distribution was fitted, so none is claimed.`);
console.log(`  The error of the estimate is a different quantity — it is below.`);

rule('5 · HOW WRONG THIS IS LIKELY TO BE');
if (!r.error) {
  console.log('  \x1b[33mUNMEASURED. No error table has been built.\x1b[0m');
  console.log('  Run: npm run build:avm-error');
  console.log('  Until then the error of this estimate is unknown, which is NOT');
  console.log('  the same as small.');
} else {
  const e2 = r.error;
  console.log(`  \x1b[1m${e2.band}\x1b[0m — half of lookups like this came in within \x1b[1m${(100 * e2.medianPct).toFixed(1)}%\x1b[0m,`);
  console.log(`  nine in ten within \x1b[1m${(100 * e2.p90Pct).toFixed(1)}%\x1b[0m. Measured over ${e2.trials} held-out sales.`);
  console.log(`\n  matched on   ${e2.bin || '— ' + e2.basis}`);
  console.log(`  cohort       band ${((r.band.psfHigh - r.band.psfLow) / r.psf * 100).toFixed(1)}% wide · effective n ${r.effectiveN} (from ${e2.trials ? e.sample : e.sample} sales)`);
  if (!e2.bin) console.log(`  \x1b[33m${e2.note}\x1b[0m`);
  console.log(`\n  \x1b[2mThis is not the band above. The band says where comparable homes`);
  console.log(`  transacted; this says how often an estimate built this way has missed.\x1b[0m`);
}

if (r.indexed.ran !== false) {
  console.log(`\n  restated to ${r.indexed.asOfQuarter} (${r.indexed.lagMonths}mo behind today) · ${r.indexed.series.label}`);
  console.log(`  index moved comparables ×${r.indexed.min.toFixed(3)} to ×${r.indexed.max.toFixed(3)}, median ×${r.indexed.median.toFixed(3)}`);
} else {
  console.log(`\n  \x1b[33m${r.indexed.note}\x1b[0m`);
}

if (asking) {
  const { residual } = await import('../lib/consult/residual.js');
  const res = residual(rec, { asking: asking * sqft, areaSqft: sqft, floor });

  rule('6 · AGAINST THE ASKING PRICE');
  if (!res.ok) {
    console.log(`  ${res.reason}`);
  } else {
    const g = res.gap;
    const inBand = res.asking.psf >= r.band.psfLow && res.asking.psf <= r.band.psfHigh;
    console.log(`  asking   ${res.asking.psf} psf   S$${f(res.asking.price)}`);
    console.log(`  estimate ${res.estimate.psf} psf → \x1b[1m${g.pct > 0 ? '+' : ''}${(100 * g.pct).toFixed(1)}%\x1b[0m`
      + `  (S$${f(Math.abs(g.dollars))} ${g.pct > 0 ? 'above' : 'below'})`);
    console.log(`  ${inBand ? 'INSIDE' : '\x1b[1mOUTSIDE\x1b[0m'} the transacted band (${r.band.psfLow}–${r.band.psfHigh})`);

    console.log(`\n  \x1b[1mTEST 1\x1b[0m · does the gap survive this method's own error?`);
    if (!res.test1.ran) {
      console.log(`    \x1b[33mUNMEASURED.\x1b[0m ${res.test1.why}`);
    } else if (!res.test1.survives) {
      console.log(`    \x1b[2mNo. Inside the ${(100 * res.test1.typicalMiss).toFixed(1)}% that half of lookups like this`);
      console.log(`    miss by anyway. Everything below is noise.\x1b[0m`);
    } else {
      console.log(`    \x1b[1mYes.\x1b[0m Beyond the typical ${(100 * res.test1.typicalMiss).toFixed(1)}% miss`
        + (res.test1.exceedsP90
          ? `, and beyond the ${(100 * res.test1.tailMiss).toFixed(1)}% that nine in ten come under.`
          : `, inside the ${(100 * res.test1.tailMiss).toFixed(1)}% that one in ten misses by.`));
      console.log(`    \x1b[2mmeasured over ${res.test1.trials} held-out sales${res.test1.bin ? ` · ${res.test1.bin}` : ''}\x1b[0m`);
    }

    console.log(`\n  \x1b[1mTEST 2\x1b[0m · does a risk the data can see explain the direction?`);
    const t2 = res.test2;
    if (t2.flagged.length) {
      console.log(`    ${t2.flagged.length} of ${t2.coverage.ran} checks flagged something:`);
      for (const fl of t2.flagged) {
        console.log(`      \x1b[1m${fl.key.padEnd(10)}\x1b[0m ${fl.points}/${fl.max}  ${fl.finding}`);
      }
    } else {
      console.log(`    \x1b[1mNothing flagged.\x1b[0m All ${t2.coverage.ran} checks came back clear.`);
    }
    if (t2.clear.length) console.log(`    \x1b[2mclear: ${t2.clear.map(c => c.key).join(', ')}\x1b[0m`);
    if (t2.coverage.couldNotRun.length) {
      console.log(`    \x1b[33mcould not run: ${t2.coverage.couldNotRun.map(c => c.key).join(', ')}\x1b[0m`);
    }
    if (t2.rubricScore) {
      /* The rubric's own total INCLUDES its price check, which Test 2 excludes
         to avoid the circularity. Printed side by side without saying so, the
         two numbers look inconsistent — and a reader would be right. */
      console.log(`    \x1b[2mBlindspot ${t2.rubricScore.points}/${t2.rubricScore.max} — ${t2.rubricScore.band}`
        + ` (that total also counts the price check, which Test 2 leaves out)\x1b[0m`);
    }

    console.log(`\n  \x1b[1mTEST 3\x1b[0m · what is left`);
    console.log(`    \x1b[1m${res.verdict.code}\x1b[0m`);
    for (const line of wrap(res.verdict.says, 68)) console.log(`    ${line}`);
    if (res.verdict.qualifier) {
      console.log('');
      for (const line of wrap(res.verdict.qualifier, 68)) console.log(`    \x1b[33m${line}\x1b[0m`);
    }
    console.log('');
    for (const line of wrap(res.whatIsLeft, 68)) console.log(`    \x1b[2m${line}\x1b[0m`);
  }
}
console.log();
