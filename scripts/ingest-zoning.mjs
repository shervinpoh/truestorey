/**
 * What the Master Plan permits near a property.
 *
 *   npm run ingest:zoning      (needs a network connection)
 *
 * Feeds the `view` check in lib/blindspot/rubric.js, which until now scored
 * nothing and said so. The question it answers is narrow and entirely public:
 * of the land within 300m, what is the highest plot ratio the Master Plan
 * allows? A tall permission next door is the mechanism by which a view
 * disappears, and it is knowable years before anything is built.
 *
 * Licence: Singapore Open Data Licence v1.0.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO DECISIONS THIS SCRIPT MAKES, BOTH OF WHICH NARROW THE CLAIM
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. `undeveloped` IS NOT PRODUCED, AND THE CHECK NO LONGER CLAIMS IT.
 *
 *    NEXT.md asked for `{ lat, lon, plotRatio, landUse, undeveloped }` and
 *    flagged the last field as the hard part. Having read the layer: there is
 *    no field in it that says whether a parcel is built on. The properties are
 *    OBJECTID, LU_DESC, LU_TEXT, GPR, WHI_Q_MX, GPR_B_MN, INC_CRC, FMEL_UPD_D
 *    and two shape metrics. Zoning describes what is PERMITTED, never what is
 *    THERE.
 *
 *    RESERVE SITE looks like a candidate and is not one — it is a zoning
 *    category for land whose use is undecided, which says nothing about
 *    whether it currently holds a building. Treating it as "vacant" would be
 *    inventing a fact the source does not carry, which is rule 13 in
 *    everything but name.
 *
 *    So the check became "what the zoning permits nearby" rather than "what
 *    could be built on empty land" — NEXT.md's own stated fallback. It is a
 *    smaller claim and it is one the data actually supports. Determining
 *    vacancy would need a building footprint layer intersected against this
 *    one, which is a different and much larger piece of work.
 *
 * 2. A NON-NUMERIC PLOT RATIO IS RECORDED, NOT DISCARDED.
 *
 *    GPR is only a number about 30% of the time. Measured on the 2025 layer,
 *    113,394 features:
 *
 *        LND    59,055   landed housing — governed by storey height, not GPR
 *        EVA    12,891   subject to evaluation — no ratio is fixed
 *        null    7,946   no value published
 *        numeric ~33,500  1.4, 2.8, 3.0, 2.5 …
 *
 *    Dropping the other 70% silently would let the check answer "nothing
 *    within 300m is zoned above 1.4" for a site whose neighbour is an EVA
 *    parcel that could be approved at anything. That is absence of evidence
 *    reading as evidence of safety, which this codebase treats as the worst
 *    failure available. They are kept with plotRatio null and their reason
 *    recorded, so the check can say what it could not measure.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { ringsOf, centroid } from '../lib/geojson.js';

const ROOT = process.cwd();
const API = 'https://api-open.data.gov.sg/v1/public/api/datasets';

/*
 * Master Plan 2025 Land Use Layer. The 2019 layer (d_90d86daa…) carries the
 * identical property schema and 113,212 features; 2025 is the one in force.
 * Both were checked — this is not a guess at which dataset is right.
 */
const DATASET = 'd_a8c3546b26712e35021f3a681d0353ae';

/*
 * Only land uses that could put a building where one can be seen from a home.
 * ROAD, WATERBODY, PARK and OPEN SPACE are excluded because a high ratio on
 * them is not a thing that gets built — and including them would inflate the
 * "highest nearby" answer with parcels nobody can develop.
 */
const BUILDABLE = new Set([
  'RESIDENTIAL',
  'RESIDENTIAL WITH COMMERCIAL AT 1ST STOREY',
  'RESIDENTIAL / INSTITUTION',
  'COMMERCIAL & RESIDENTIAL',
  'COMMERCIAL',
  'COMMERCIAL / INSTITUTION',
  'BUSINESS 1',
  'BUSINESS 2',
  'BUSINESS PARK',
  'HOTEL',
  'WHITE',
  'RESERVE SITE',
  'CIVIC & COMMUNITY INSTITUTION',
  'EDUCATIONAL INSTITUTION',
  'PLACE OF WORSHIP',
  'HEALTH & MEDICAL CARE',
]);

/**
 * GPR as published, and why it is not a number when it is not.
 *
 * Returns { ratio, unmeasured } — exactly one of the two is set.
 */
export function plotRatioOf(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === '' || v === 'NULL') return { ratio: null, unmeasured: 'none published' };
  if (v === 'LND') return { ratio: null, unmeasured: 'landed — governed by storey height, not plot ratio' };
  if (v === 'EVA') return { ratio: null, unmeasured: 'subject to evaluation — no ratio is fixed' };
  // SDP appears on 320 parcels, 159 of them residential. It is a published URA
  // code rather than a parse failure, and like EVA it means no ratio is fixed
  // on the plan. Named here so it stops reading as a parser bug — but note the
  // check must treat it exactly as it treats EVA, because a parcel with no
  // fixed ratio is unmeasured, not low.
  if (v === 'SDP') return { ratio: null, unmeasured: 'subject to detailed planning — no ratio is fixed' };
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return { ratio: n, unmeasured: null };
  // Anything else is a value this parser has not seen. Record it verbatim
  // rather than coercing it to a number or throwing it away.
  return { ratio: null, unmeasured: `unrecognised value ${JSON.stringify(v)}` };
}

/** data.gov.sg hands out a signed URL rather than the file. */
async function download(dataset) {
  const poll = await fetch(`${API}/${dataset}/poll-download`);
  const json = await poll.json();
  const url = json?.data?.url;
  if (!url) throw new Error(`No download URL for ${dataset}: ${json?.errorMsg || JSON.stringify(json).slice(0, 200)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.json();
}

async function main() {
  const raw = path.join(ROOT, 'data', '.zoning-raw.geojson');
  const file = path.join(ROOT, 'data', 'zoning.json');

  console.log('Master Plan 2025 land use — downloading…');
  const geojson = await download(DATASET);

  // Save the raw download before parsing anything. The map ingest failed once
  // on a markup difference and reported "the source schema may have changed",
  // which is not a diagnosis. This is what makes the next failure readable.
  await fs.writeFile(raw, JSON.stringify(geojson));
  console.log(`  raw saved       : ${path.relative(ROOT, raw)}`);

  const features = geojson?.features;
  if (!Array.isArray(features) || !features.length) {
    console.error('\n  No features in the download.');
    console.error(`  Top-level keys received: ${Object.keys(geojson || {}).join(', ') || '(none)'}`);
    console.error(`  Raw kept at: ${path.relative(ROOT, raw)}\n`);
    process.exit(1);
  }

  const parcels = [];
  const skipped = { notBuildable: 0, noGeometry: 0 };
  const unmeasuredBy = {};
  const seenLandUse = {};

  for (const f of features) {
    const p = f.properties || {};
    const use = String(p.LU_DESC || '').trim().toUpperCase();
    seenLandUse[use] = (seenLandUse[use] || 0) + 1;

    if (!BUILDABLE.has(use)) { skipped.notBuildable++; continue; }

    const rings = ringsOf(f.geometry);
    if (!rings.length) { skipped.noGeometry++; continue; }
    // Largest ring by point count is the parcel itself; the rest are holes.
    const ring = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
    const c = centroid(ring);
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) { skipped.noGeometry++; continue; }

    const { ratio, unmeasured } = plotRatioOf(p.GPR);
    if (unmeasured) unmeasuredBy[unmeasured] = (unmeasuredBy[unmeasured] || 0) + 1;

    parcels.push({
      lat: Math.round(c[1] * 1e6) / 1e6,
      lon: Math.round(c[0] * 1e6) / 1e6,
      plotRatio: ratio,
      landUse: use,
      ...(unmeasured ? { unmeasured } : {}),
    });
  }

  const withRatio = parcels.filter(p => p.plotRatio != null).length;

  const out = {
    source: 'URA Master Plan 2025 Land Use Layer via data.gov.sg',
    datasetId: DATASET,
    licence: 'Singapore Open Data Licence v1.0',
    accessedAt: new Date().toISOString(),
    // What this file does NOT say, recorded next to what it does. The check
    // reads this and must not claim more than it.
    note: 'Zoning describes what is permitted, not what is built. This layer '
        + 'carries no indication of whether a parcel is occupied, so nothing '
        + 'here may be read as vacant land.',
    counts: {
      featuresIn: features.length,
      parcels: parcels.length,
      withPlotRatio: withRatio,
      withoutPlotRatio: parcels.length - withRatio,
      skipped,
      unmeasuredBy,
    },
    parcels,
  };

  await fs.writeFile(file, JSON.stringify(out));
  const mb = ((await fs.stat(file)).size / 1048576).toFixed(1);

  console.log(`  features in     : ${features.length.toLocaleString('en-SG')}`);
  console.log(`  parcels kept    : ${parcels.length.toLocaleString('en-SG')}  (buildable land uses only)`);
  console.log(`  with plot ratio : ${withRatio.toLocaleString('en-SG')}`);
  console.log(`  without         : ${(parcels.length - withRatio).toLocaleString('en-SG')}`);
  for (const [why, n] of Object.entries(unmeasuredBy).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(7)}  ${why}`);
  }
  console.log(`  skipped         : ${skipped.notBuildable.toLocaleString('en-SG')} not buildable, ${skipped.noGeometry} no usable geometry`);
  console.log(`  written         : ${path.relative(ROOT, file)}  (${mb} MB)`);
  console.log('\n  Refresh interval: when URA publishes a new Master Plan. It is a '
            + 'statutory review roughly every five years, not a monthly feed.\n');
}

main().catch(e => {
  console.error(`\n  ingest:zoning failed — ${e.message}\n`);
  process.exit(1);
});
