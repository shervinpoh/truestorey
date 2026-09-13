/**
 * What Blender needs to render the island, and nothing else.
 *
 *   npm run render:island       exports, then renders
 *   node scripts/render/export-island.mjs   exports only
 *
 * ── WHY AN EXPORT STEP RATHER THAN READING data/ FROM BLENDER ──────────────
 * Blender ships its own Python and cannot import this repo's ES modules, so a
 * script inside Blender that read map.json directly would have to reimplement
 * the quantile banding and carry a second copy of the ramp. That is the
 * failure this repo already records against proceeds.js, and it would be worse
 * here than usual: nothing would go red, the render would simply shade a price
 * differently from the page beside it and the site would stop being one atlas.
 *
 * So the banding happens HERE, with lib/ramp.js — the same function the
 * homepage island and the record-page locator use — and Blender receives
 * polygons that already know their band and their colour.
 *
 * ── WHAT IS AND IS NOT INVENTED ────────────────────────────────────────────
 * The outlines are URA's own Master Plan planning area boundaries, the same
 * file /map draws. The height of each is that town's filed median psf. Rule 13
 * is satisfied because nothing here is geometry the data does not contain: the
 * shape is published, the height is a figure this site publishes on the town's
 * own page, and the exaggeration is stated on the page rather than left for a
 * reader to infer a scale from.
 *
 * A town with no filed median is exported flat and marked, not dropped. An
 * unexplained hole reads as missing data; a flat plate that says "no filed
 * resale" is the truth.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { boundaries, town as townOf, getIndex } from '../../lib/data/query.js';
import { RAMP, quantileBreaks, bandOf } from '../../lib/ramp.js';
import { titleCase } from '../../lib/name.js';

const OUT = new URL('../../data/render/island.json', import.meta.url);
/* A SECOND, TINY FILE, AND IT IS NOT TIDINESS.
   island.json is 85KB of coordinates. The page that shows the render needs
   eleven scalars off it — the sources, the period, the two extremes — and
   this repo has now shipped an entire dataset to print a handful of numbers
   three times: /mop at 2.7MB, /market at 2.7MB, /yield at 884KB, each one
   because a component took one field off a structure and the whole structure
   went into the RSC payload behind it. Reading the big file and destructuring
   carefully works right up until someone passes the object instead, and
   nothing goes red when they do. A separate file cannot be passed by
   accident. */
const META = new URL('../../data/render/island-meta.json', import.meta.url);

const areas = boundaries()?.areas || [];
if (!areas.length) {
  console.error('\nNo planning-area boundaries. Run `npm run ingest:boundaries` first.\n');
  process.exit(1);
}

/* The median psf per planning area, from the town of the same slug. Two of the
   twenty-six HDB towns have no matching planning area — Central Area spans
   several and Kallang/Whampoa straddles two — which is the same join the
   island already documents. Those come through unpriced. */
const priced = [];
const shapes = areas.map(a => {
  const t = townOf(a.slug);
  const psf = Number.isFinite(t?.medianPsf) ? Math.round(t.medianPsf) : null;
  if (psf) priced.push(psf);
  return { name: a.name, slug: a.slug, rings: a.rings, psf, blocks: t?.blockCount ?? null };
});

const breaks = quantileBreaks(priced);
for (const s of shapes) {
  s.band = s.psf == null ? null : bandOf(s.psf, breaks);
  s.colour = s.band == null ? null : RAMP[s.band];
}

const i = getIndex();
const out = {
  builtAt: new Date().toISOString(),
  /* Rule 6 travels with the export. A render is a published figure the moment
     it is on a page, and a picture cannot carry its own source line — so the
     page that shows it gets these, and they come from here rather than being
     retyped beside the image. */
  source: boundaries().source || 'URA Master Plan Planning Area Boundary, via data.gov.sg',
  psfSource: i.hdb?.source || 'HDB Resale Flat Prices (data.gov.sg)',
  period: i.hdb?.period || null,
  accessedAt: i.hdb?.accessedAt || null,
  ramp: RAMP,
  breaks,
  lo: priced.length ? Math.min(...priced) : null,
  hi: priced.length ? Math.max(...priced) : null,
  pricedAreas: priced.length,
  totalAreas: shapes.length,
  shapes,
};

/* The extremes, named, because the caption states a finding rather than
   describing a picture. The ratio is the finding: the dearest town's median
   is 1.7 times the cheapest, which is why the relief is gentle and why the
   heights had to be zero-based. A range-mapped bar drew that same 1.7 as 25. */
const byPsf = shapes.filter(s => s.psf).sort((a, b) => b.psf - a.psf);
const top = byPsf[0], bottom = byPsf[byPsf.length - 1];

const meta = {
  builtAt: out.builtAt,
  source: out.source,
  psfSource: out.psfSource,
  period: out.period,
  accessedAt: out.accessedAt,
  lo: out.lo,
  hi: out.hi,
  pricedAreas: out.pricedAreas,
  totalAreas: out.totalAreas,
  ratio: out.lo ? out.hi / out.lo : null,
  highest: top ? { name: titleCase(top.name), psf: top.psf } : null,
  lowest: bottom ? { name: titleCase(bottom.name), psf: bottom.psf } : null,
};

mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
writeFileSync(META, JSON.stringify(meta, null, 2));
console.log(`\n${shapes.length} planning areas, ${priced.length} with a filed median.`);
console.log(`Bands at ${breaks.map(Math.round).join(' · ')} psf.`);
console.log(`Written to data/render/island.json and island-meta.json\n`);
