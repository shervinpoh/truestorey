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

const OUT = new URL('../../data/render/island.json', import.meta.url);

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

mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`\n${shapes.length} planning areas, ${priced.length} with a filed median.`);
console.log(`Bands at ${breaks.map(Math.round).join(' · ')} psf.`);
console.log(`Written to data/render/island.json\n`);
