/**
 * Singapore's actual shape, from URA's own published boundaries.
 *
 *   npm run ingest:boundaries      (needs a network connection)
 *
 * Until now /map drew the island out of 13,115 transaction dots and nothing
 * else. That is honest and it is dependency-free, but it is not a map of
 * Singapore — it is a scatter that happens to be island-shaped, with holes
 * wherever nobody has sold anything.
 *
 * This fetches the Master Plan 2019 Planning Area boundaries, simplifies them
 * to something a screen can actually resolve, and stores the result in the
 * repo. AFTER THIS RUNS THERE IS STILL NO BASEMAP: no tiles, no map library,
 * no third-party host at render time. The coastline is a few hundred kilobytes
 * of published open data sitting in data/, drawn by the same canvas pass that
 * draws the dots. That is the property worth protecting, and this keeps it.
 *
 * The boundaries are URA's, not mine. Rule 13 — never draw geometry the data
 * does not contain — is why this is an ingest rather than a coastline traced
 * from memory.
 *
 * Licence: Singapore Open Data Licence v1.0.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { attrsFromDescription, ringsOf, simplify, centroid } from '../lib/geojson.js';

const ROOT = process.cwd();
const API = 'https://api-open.data.gov.sg/v1/public/api/datasets';

/* Planning areas, not subzones. Subzones are finer than anything this map can
 * show and the 55 planning areas are the unit people navigate by — they are
 * also, near enough, the HDB towns the rest of the site is organised around. */
const DATASET = 'd_4765db0e87b9c86336792efe8a1f7a66';
const TOLERANCE = 0.00015;   // ~15m
/* Drop rings smaller than roughly 200 metres across — offshore rocks and
 * slivers left over from simplification. Measured by extent, not by point
 * count: a simplified rectangle is five points and is a perfectly good shape,
 * so counting vertices throws away real areas. */
const MIN_EXTENT = 0.002;

const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const bigEnough = ring => {
  if (ring.length < 4) return false;
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  return Math.max(...xs) - Math.min(...xs) >= MIN_EXTENT || Math.max(...ys) - Math.min(...ys) >= MIN_EXTENT;
};

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

/**
 * The name of one feature, tried three ways.
 *
 * This function exists because the first version of the ingest only looked in
 * one of the three and the run failed with every feature nameless. The order
 * matters: a flat property is unambiguous, the HTML table is a KML conversion
 * artefact, and Name is usually the placemark id "kml_1" rather than anything
 * a reader would recognise.
 */
export function nameOf(properties = {}) {
  const flat = properties.PLN_AREA_N || properties.SUBZONE_N || properties.REGION_N;
  if (flat) return String(flat).trim();
  const attrs = attrsFromDescription(properties.Description);
  const fromTable = attrs.PLN_AREA_N || attrs.SUBZONE_N || attrs.REGION_N;
  if (fromTable) return String(fromTable).trim();
  const name = properties.Name || properties.name;
  return name && !/^kml_/i.test(name) ? String(name).trim() : null;
}

export function buildAreas(geojson) {
  const areas = [];
  let dropped = 0;
  for (const feature of geojson.features || []) {
    const name = nameOf(feature.properties || {});
    if (!name) { dropped++; continue; }

    const rings = ringsOf(feature.geometry)
      // Coordinates arrive as [lon, lat, 0]; the altitude is always zero here.
      .map(ring => simplify(ring.map(c => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5]), TOLERANCE))
      .filter(bigEnough);
    if (!rings.length) { dropped++; continue; }

    const biggest = rings.slice().sort((a, b) => b.length - a.length)[0];
    const c = centroid(biggest);
    areas.push({ name, slug: slugify(name), rings, centroid: c ? [Math.round(c[1] * 1e5) / 1e5, Math.round(c[0] * 1e5) / 1e5] : null });
  }
  areas.sort((a, b) => a.name.localeCompare(b.name));
  return { areas, dropped };
}

async function main() {
  console.log(`Fetching planning area boundaries…`);
  const geojson = await download(DATASET);
  const before = JSON.stringify(geojson).length;

  // Keep the raw download. It is 2MB and gitignorable, and it means a parse
  // failure can be diagnosed from the file itself rather than by re-running
  // the fetch and guessing at what the publisher changed.
  const raw = path.join(ROOT, 'data', '.boundaries-raw.geojson');
  await fs.writeFile(raw, JSON.stringify(geojson));

  const { areas, dropped } = buildAreas(geojson);
  if (!areas.length) {
    // Say what was actually there. "The schema may have changed" is not a
    // diagnosis, and the first version of this failed with exactly that.
    const f = geojson.features?.[0];
    console.error(`\nNo usable areas. What the download actually contained:`);
    console.error(`  top-level keys : ${Object.keys(geojson).join(', ') || '(none)'}`);
    console.error(`  features       : ${geojson.features?.length ?? 'none'}`);
    if (f) {
      console.error(`  first feature  : geometry ${f.geometry?.type || 'missing'}, properties [${Object.keys(f.properties || {}).join(', ')}]`);
      const d = f.properties?.Description;
      if (d) console.error(`  Description    : ${String(d).replace(/\s+/g, ' ').slice(0, 300)}…`);
    }
    console.error(`  raw saved to   : ${path.relative(ROOT, raw)}\n`);
    throw new Error('No usable areas — see the diagnosis above.');
  }

  const out = {
    source: 'URA Master Plan 2019 Planning Area Boundary (No Sea), via data.gov.sg',
    dataset: DATASET,
    licence: 'Singapore Open Data Licence v1.0',
    accessedAt: new Date().toISOString(),
    tolerance: TOLERANCE,
    note: 'Simplified to roughly 15 metres. Boundaries are URA’s, drawn as published — nothing here is traced or inferred.',
    areas,
  };
  const file = path.join(ROOT, 'data', 'boundaries.json');
  await fs.writeFile(file, JSON.stringify(out));
  const kb = Math.round((await fs.stat(file)).size / 1024);
  const points = areas.reduce((n, a) => n + a.rings.reduce((m, r) => m + r.length, 0), 0);
  console.log(`data/boundaries.json — ${areas.length} planning areas, ${points.toLocaleString()} points, ${kb}KB`);
  console.log(`  simplified from ${Math.round(before / 1024)}KB of source geometry${dropped ? `, ${dropped} features dropped as unnamed or too small` : ''}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(`INGEST BOUNDARIES FAILED: ${e.message}`); process.exit(1); });
}
