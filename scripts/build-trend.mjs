import fs from 'node:fs';
import path from 'node:path';
import { hdbHref } from '../lib/name.js';

/**
 * Median rate per square foot by year, split by unit size, for every address.
 *
 * ── WHY SIZE AND NOT JUST THE ADDRESS ──────────────────────────────────────
 * A project's headline movement is a median over whatever happened to sell,
 * so it moves when the MIX moves. A year heavy on one-bedrooms drags it down
 * with no home anywhere being worth less, and a year of penthouses lifts it
 * with the same nothing behind it. Anyone reading a project's year-on-year
 * figure as a fact about their own flat is reading a fact about the sales
 * calendar.
 *
 * Splitting the same filed sales by size fixes that, and where the two
 * disagree the disagreement is the finding.
 *
 * ── WHY THIS IS NOT THE REPEAT-SALES FEATURE ───────────────────────────────
 * It replaces it. Realised returns need the same home sold twice, which needs
 * a unit identifier that neither HDB nor URA publishes — deliberately, since
 * unit-level purchase prices are the REALIS-shaped data rule 1 forbids. The
 * closest available match is address plus area plus floor band and it is not
 * a unit: Blk 362C Sembawang Crescent filed fifteen 4-room 93 sqm sales on
 * storeys 7 to 9 inside seventeen months, two of them in the same month.
 * Pairing those would have produced a confident holding period out of fifteen
 * different families' homes. See NEXT.md.
 *
 * ── WHY IT READS THE RAW FILES ─────────────────────────────────────────────
 * comps.json holds the twenty most recent sales per address, which is right
 * for a comparables cohort and useless for a trend — a busy project's twenty
 * are all from one year. This reads the whole downloaded history.
 *
 * Bands are 10 sqm wide and named for what they contain. A year with fewer
 * than MIN sales is KEPT with its count rather than dropped: a reader can
 * discount a year of two sales and cannot discount one silently removed.
 */

const root = process.cwd();
const read = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };

const BAND = 10;                       // sqm
const bandOf = sqm => `${Math.floor(sqm / BAND) * BAND}`;
export const MIN_YEAR = 3;

const projects = read('projects.json');
const hrefFor = new Map();
for (const p of [...projects.condo, ...projects.landed])
  hrefFor.set(norm(String(p.label).replace(/^Landed\s*·\s*/i, '')), p.href);

/* HDB hrefs are BUILT from town/block/street with the same helper the record
 * pages use, not matched against a list. An earlier version looked them up in
 * urls.json by a `label` that file does not carry, matched nothing silently,
 * and produced a trend file with no HDB in it — 2,639 addresses where there
 * should have been twelve thousand. */

/** href -> band -> year -> [psf], plus an "all" band. */
const acc = new Map();
const add = (href, band, year, psf) => {
  if (!href) return;
  const r = acc.get(href) || acc.set(href, new Map()).get(href);
  for (const b of [band, 'all']) {
    const bb = r.get(b) || r.set(b, new Map()).get(b);
    (bb.get(year) || bb.set(year, []).get(year)).push(psf);
  }
};

for (const t of (read('private.json').rows || [])) {
  if (!t.project || !Number.isFinite(t.psf) || !Number.isFinite(t.areaSqm)) continue;
  const y = /^\d{4}$/.test(String(t.contractDate)) ? `20${String(t.contractDate).slice(2)}` : null;
  if (!y) continue;
  add(hrefFor.get(norm(t.project)), bandOf(t.areaSqm), y, t.psf);
}
for (const t of (read('hdb.json').rows || [])) {
  if (!t.block || !Number.isFinite(t.psf) || !Number.isFinite(t.areaSqm) || !t.month) continue;
  add(hdbHref(t.town, t.block, t.street), bandOf(t.areaSqm), String(t.month).slice(0, 4), t.psf);
}

const records = {};
let kept = 0;
for (const [href, bands] of acc) {
  const out = {};
  for (const [band, years] of bands) {
    const rows = [...years.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([year, ps]) => [year, Math.round(median(ps)), ps.length]);
    // Two years is the minimum that can show a direction at all.
    if (rows.length >= 2) out[band] = rows;
  }
  if (Object.keys(out).length) { records[href] = out; kept++; }
}

const out = {
  builtAt: new Date().toISOString(),
  source: 'HDB via data.gov.sg · URA Data Service',
  note: `Median psf by calendar year, in ${BAND} sqm size bands, from the full filed history. `
      + `Rows are [year, medianPsf, n]. A year with fewer than ${MIN_YEAR} sales is kept with its `
      + 'count rather than dropped, so a reader can see what is standing behind it. The "all" '
      + 'band is every size at that address, which is what a headline year-on-year figure '
      + 'measures and is why the two can disagree.',
  bandSqm: BAND,
  minYear: MIN_YEAR,
  counts: { records: kept },
  records,
};
fs.writeFileSync(path.join(root, 'data', 'trend.json'), JSON.stringify(out));
const mb = (fs.statSync(path.join(root, 'data', 'trend.json')).size / 1e6).toFixed(1);
console.log(`Wrote data/trend.json — ${kept.toLocaleString('en-SG')} addresses · ${BAND} sqm bands · ${mb}MB`);
