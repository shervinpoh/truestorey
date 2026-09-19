/**
 * Does psf vary with floor area, and by how much?
 *
 *   npm run measure:size
 *
 * ── WHY THIS IS A SCRIPT AND NOT A REMEMBERED COEFFICIENT ──────────────────
 * `SIZE_ELASTICITY` in lib/consult/avm.js adjusts every comparable, so it had
 * better be a measurement. This is where it comes from, and re-running it is
 * how anyone checks the number rather than taking it on trust — the same
 * contract as every figure on the site.
 *
 * ── THE CONTROL ────────────────────────────────────────────────────────────
 * The fit is WITHIN one building and one flat type. That holds location,
 * vintage, lease and tenure constant by construction, which is the cleanest
 * control available and the one the storey curve spent a year not having: its
 * upper bands were reading building age as height. A second pass adds the
 * storey band to the key, so the result can be checked for the same confound
 * in the other direction.
 *
 * A group needs six sales and at least 8% of area spread. Without real
 * variation there is nothing to measure and a slope fitted to a flat line is
 * noise divided by noise.
 *
 * ── WHAT IT MEASURES, IN WORDS ─────────────────────────────────────────────
 * The slope of log psf on log area. −0.40 means a flat 10% larger sells for
 * about 4% less per square foot — equivalently, total price rises with area
 * but SUB-PROPORTIONALLY, because buyers price the flat and not the foot.
 */
import fs from 'node:fs';

const comps = JSON.parse(fs.readFileSync('data/comps.json', 'utf8'));
const MIN_SALES = 6, MIN_SPREAD = 0.08, FROM = '2024-09';

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
const qt = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

function slope(rows) {
  const xs = rows.map(r => Math.log(r.sqm)), ys = rows.map(r => Math.log(r.psf));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den > 0 ? num / den : null;
}

for (const [label, key] of [['block × type', (t) => t], ['block × type × storey', (t, fl) => `${t}|${fl}`]]) {
  const out = { HDB: [], PRIVATE: [] };
  for (const r of Object.values(comps.records)) {
    const g = {};
    for (const [m, psf, sqm, t, fl] of (r.sales || [])) {
      if (!Number.isFinite(psf) || !Number.isFinite(sqm) || sqm <= 0 || m < FROM) continue;
      (g[key(t, fl)] ||= []).push({ psf, sqm });
    }
    for (const rows of Object.values(g)) {
      if (rows.length < MIN_SALES) continue;
      const a = rows.map(x => x.sqm);
      if (Math.max(...a) / Math.min(...a) - 1 < MIN_SPREAD) continue;
      const s = slope(rows);
      if (s !== null) out[r.kind === 'HDB' ? 'HDB' : 'PRIVATE'].push(s);
    }
  }
  console.log(`\n${label}   (≥${MIN_SALES} sales, ≥${100 * MIN_SPREAD}% area spread, since ${FROM})`);
  for (const k of ['HDB', 'PRIVATE']) {
    const s = out[k];
    if (!s.length) { console.log(`  ${k}: nothing qualified`); continue; }
    console.log(`  ${k.padEnd(8)} n=${String(s.length).padStart(5)}  median ${med(s).toFixed(3)}`
      + `  p25 ${qt(s, 0.25).toFixed(3)}  p75 ${qt(s, 0.75).toFixed(3)}`
      + `  negative ${(100 * s.filter(v => v < 0).length / s.length).toFixed(0)}%`);
    console.log(`  ${''.padEnd(8)} across the cohort's own ±10% band that is ±${(100 * Math.abs(med(s)) * 0.1).toFixed(2)}% of psf`);
  }
}
console.log(`\nA median that straddles zero at p25/p75 is a dimension that did not measure.`);
console.log(`It scores nothing and the adjustment does not run — which is a different`);
console.log(`claim from an elasticity of zero arrived at by not looking.\n`);
