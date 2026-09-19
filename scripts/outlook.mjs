/**
 * Is this a good buy — with the scheduled part separated from the unknown part.
 *
 *   npm run outlook -- --q "ang mo kio ave 3" --first --sqft 1001 --floor 10 --years 5
 *   npm run outlook -- --href /hdb/bedok/649-jln-tenaga --sqft 1313 --floor 9 --years 7 --price 858313
 *   npm run outlook -- --href … --years 7 --since 2013-Q3     record cut at TDSR
 *
 * Prints no verdict. It prints a hurdle, how often the record cleared one that
 * size, what is already on the calendar against it, and what it cannot see.
 * The view is Shervin's to form; this is the evidence he forms it on.
 */
import { search, recordByHref } from '../lib/data/query.js';
import { outlook, FRICTION } from '../lib/consult/outlook.js';
import { wrap, rule, f, pc } from './term.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };

let rec = arg('href') ? recordByHref(arg('href')) : null;
if (!rec && arg('q')) {
  const hits = search(arg('q'), { limit: 5 });
  if (!hits.length) { console.error(`Nothing matched "${arg('q')}".`); process.exit(1); }
  if (hits.length > 1 && !arg('first')) {
    console.log(`"${arg('q')}" matched ${hits.length}. Pass --href, or --first:`);
    for (const h of hits) console.log(`  ${h.href}  ${h.label}`);
    process.exit(0);
  }
  rec = recordByHref(hits[0].href);
}
if (!rec) { console.error('Pass --href or --q.'); process.exit(1); }

const sqft = Number(arg('sqft'));
const years = Number(arg('years', 5));
if (!(sqft > 0)) { console.error('--sqft is required.'); process.exit(1); }

const r = outlook(rec, {
  areaSqft: sqft,
  floor: arg('floor') ? Number(arg('floor')) : null,
  years,
  price: arg('price') ? Number(arg('price')) : null,
  since: arg('since', null),
  profile: arg('profile', 'SC'),
  count: Number(arg('count', 1)),
});
if (!r.ok) { console.error(`\n${r.reason}\n`); process.exit(0); }

console.log(`\n\x1b[1m${rec.label}\x1b[0m`);
console.log(`${sqft} sqft${arg('floor') ? ` · floor ${arg('floor')}` : ''} · holding ${years} years`);
console.log(`Paying \x1b[1mS$${f(r.today.paying)}\x1b[0m (${r.today.basis}) · ${r.today.psf} psf`);
if (r.today.estimate) {
  const e = r.today.estimate;
  console.log(`\x1b[2mAVM ${e.psf} psf · band ${e.band.psfLow}–${e.band.psfHigh}` +
    (e.error ? ` · ${e.error.band}, typically ±${(100 * e.error.medianPct).toFixed(1)}%` : '') + '\x1b[0m');
}

rule('1 · WHAT IS ALREADY SCHEDULED');
const L = r.lease;
if (!L.ran) console.log(`  \x1b[33mLease   did not run — ${L.why}\x1b[0m`);
else if (L.freehold) console.log(`  Lease   ${L.note}`);
else {
  console.log(`  Lease   ${L.leftNow} years left today → \x1b[1m${L.leftThen}\x1b[0m in ${years} years`);
  console.log(`          SLA relativity ${L.relativityNow}% → ${L.relativityThen}% of freehold`);
  console.log(`          \x1b[1m${pc(L.dropPct)}\x1b[0m, scheduled, whatever the market does`);
  console.log(`          averaging ${L.avgPerYear.toFixed(2)} relativity points a year over the hold`);
  if (L.ladder?.length) {
    console.log(`\n          \x1b[2mand it accelerates — same lease, same table:\x1b[0m`);
    console.log(`          \x1b[2m${L.ladder.map(x => `${x.at}yr left ${x.perYear.toFixed(2)}/yr`).join('  ·  ')}\x1b[0m`);
  }
}
const F = r.friction;
console.log(`\n  Costs   buy   duty S$${f(F.buyDuty)} · legal S$${f(F.buyLegal)}`);
console.log(`          sell  ${(100 * F.agentRate).toFixed(1)}% + GST · legal S$${f(F.legal)}  = S$${f(F.sellCost)}`);
console.log(`          \x1b[1m${pc(F.totalPct)}\x1b[0m of the price, round trip`);

console.log(`\n  \x1b[1m── THE HURDLE ──\x1b[0m`);
console.log(`  \x1b[1m${pc(r.hurdle.totalPct)} over ${years} years\x1b[0m  (${(100 * r.hurdle.cagr).toFixed(2)}% a year compounding)`);
console.log(`  just to return the money that went in. ${pc(r.hurdle.parts.friction)} of that is costs,`);
console.log(`  ${pc(r.hurdle.parts.lease)} is the lease running down.`);
console.log(`  \x1b[2m${F.note}\x1b[0m`);

rule('2 · HOW OFTEN THE RECORD CLEARED A HURDLE THAT SIZE');
const R = r.record;
if (!R.ran) {
  console.log(`  \x1b[33mDid not run.\x1b[0m ${R.why}`);
  if (R.longestReadable) console.log(`\n  The longest this index supports is \x1b[1m${R.longestReadable} years\x1b[0m — rerun with --years ${R.longestReadable}.`);
} else {
  console.log(`  Every ${years}-year stretch in the ${R.index.label},`);
  console.log(`  ${R.from} to ${R.to} — ${R.n} of them, ${R.independent} non-overlapping.\n`);
  /* Percentiles, not extremes. A maximum over overlapping windows is one
     observation; these are not. */
  for (const [k, v] of [['p10', R.percentiles.p10], ['p25', R.percentiles.p25],
                        ['median', R.percentiles.median], ['p75', R.percentiles.p75],
                        ['p90', R.percentiles.p90]]) {
    console.log(`    ${k.padEnd(8)} ${pc(v).padStart(8)}${k === 'median' ? '  \x1b[2m← the middle of the record\x1b[0m' : ''}`);
  }
  console.log(`\n  ${R.negative} of ${R.n} finished below where they started.`);
  const b = R.belowHurdle;
  console.log(`  \x1b[1m${b.count} of ${b.of}\x1b[0m finished at or below the ${pc(r.hurdle.totalPct)} hurdle —`);
  console.log(`  they would not have returned the money that went in.`);
  console.log(`\n  \x1b[2mA count of what happened, not a probability. Overlapping windows are not`);
  console.log(`  independent trials and nothing here pretends they are. An index is a market;`);
  console.log(`  this is one home.\x1b[0m`);

  if (R.regime?.preModern) {
    console.log(`\n  \x1b[33m⚠ ${R.regime.preModern} of ${R.regime.of} windows start before ${R.regime.cutoff}\x1b[0m — before ABSD (2011),`);
    console.log(`    the current SSD regime (2010) and TDSR (2013), off an index a fraction of`);
    console.log(`    today's. They sit almost entirely in the upper tail, so \x1b[1mevery figure above`);
    console.log(`    the median is lifted by a market that no longer exists.\x1b[0m`);
  }
  console.log(`\n  \x1b[2mextremes, for the record and not as a forecast:`);
  console.log(`    worst ${pc(R.extremes.worst.change)}  ${R.extremes.worst.from} → ${R.extremes.worst.to}`);
  console.log(`    best  ${pc(R.extremes.best.change)}  ${R.extremes.best.from} → ${R.extremes.best.to}`);
  console.log(`  Each is ONE overlapping window out of ${R.n}, and the least stable number here.\x1b[0m`);

  if (R.since) {
    console.log(`\n  \x1b[1mSAME QUESTION, RECORD CUT AT ${R.since.since}\x1b[0m`);
    if (!R.since.ran) {
      for (const line of wrap(R.since.why, 70)) console.log(`    \x1b[33m${line}\x1b[0m`);
    } else {
      console.log(`    ${R.since.n} windows, ${R.since.independent} non-overlapping, ${R.since.from} to ${R.since.to}`);
      console.log(`    p10 ${pc(R.since.percentiles.p10)} · median ${pc(R.since.percentiles.median)} · p90 ${pc(R.since.percentiles.p90)}`);
      console.log(`    ${R.since.belowHurdle.count} of ${R.since.belowHurdle.of} finished at or below the ${pc(r.hurdle.totalPct)} hurdle.`);
    }
  }
}

rule('3 · SUPPLY ALREADY ON THE CALENDAR');
const S = r.supply;
if (!S.ran) console.log(`  \x1b[33m${S.why}\x1b[0m`);
else {
  const m = S.mop;
  if (m) {
    console.log(`  ${m.upcomingBlocks} blocks within ${S.km}km reach MOP inside ${m.years} years`);
    console.log(`  = ${f(m.upcomingUnits)} units becoming eligible to sell, against ${f(m.totalUnits)} nearby (${(100 * m.ratio).toFixed(1)}%)`);
  }
  if (S.gls?.sites?.length) console.log(`  ${S.gls.sites.length} GLS site(s) within 1km · ${S.gls.programme}`);
  else if (S.gls) console.log(`  No GLS site within 1km (${S.gls.programme})`);
  console.log(`\n  \x1b[2m${S.note}\x1b[0m`);
}

rule('4 · WHAT THIS CANNOT SEE');
for (const u of r.unknown) console.log(`  · ${u}`);
console.log();
