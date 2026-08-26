/**
 * Join the amenity layers onto every geocoded record.
 *
 *   npm run build:nearby
 *
 * Writes data/near/<shard>.json, mirroring data/records/<shard>.json exactly,
 * so a page resolves its amenities the same way it resolves the record: one
 * small file, derived from the URL, no lookup table. A block page reads about
 * 40KB rather than the whole island.
 *
 * This runs entirely offline against data/geo.json and data/amenities.json.
 * It is fast, so re-run it freely — after a fresh geocode, after adding a mall
 * to the curated file, after a new HDB quarter lands.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { nearFor, isPrimary, KEEP } from '../lib/nearby.js';
import { ORDER, LAYERS } from './amenity-sources.mjs';
import { USABLE } from './lib/onemap.mjs';

const ROOT = process.cwd();
const RECORDS = path.join(ROOT, 'data', 'records');
const NEAR = path.join(ROOT, 'data', 'near');

const readJson = async (p, fb) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fb; } };

/**
 * Drop each amenity's own coordinate on the way out. The page renders a name
 * and a distance and never plots anything, so across 13,000 records those
 * floats are several megabytes of payload nobody reads. The join is offline
 * and takes seconds, so if a map ever wants them, re-run without this.
 */
function strip(near) {
  if (!near) return null;
  const out = { at: near.at };
  const clean = ({ lat, lon, ...rest }) => rest;
  for (const [k, v] of Object.entries(near)) {
    if (k === 'at') continue;
    if (k === 'primary') out.primary = { within1: v.within1.map(clean), within2: v.within2.map(clean) };
    else if (Array.isArray(v)) out[k] = v.map(clean);
  }
  return out;
}

async function main() {
  const geo = await readJson(path.join(ROOT, 'data', 'geo.json'), null);
  const am = await readJson(path.join(ROOT, 'data', 'amenities.json'), null);

  if (!geo?.records || !Object.keys(geo.records).length) {
    console.error('No data/geo.json yet. Run `npm run geocode` first — it is the gate for all of this.');
    process.exit(1);
  }
  if (!am?.layers || !Object.keys(am.layers).length) {
    console.error('No data/amenities.json yet. Run `npm run ingest:amenities` first.');
    process.exit(1);
  }

  // Primary schools carry the band rule; secondary and JC do not, so they are
  // listed but never banded. MOE's level column is the only thing that decides
  // this — we do not infer it from a school's name.
  // `dedupe` is a property of the SOURCE, not of the fetched file, so graft it
  // on here rather than baking it into data/amenities.json — that way changing
  // it is a one-line edit plus a re-run of this script, with no re-fetch.
  const layers = Object.fromEntries(Object.entries(am.layers)
    .map(([k, v]) => [k, { ...v, dedupe: LAYERS[k]?.dedupe || null }]));

  const schools = am.layers.schools?.points || [];
  const primaries = schools.filter(isPrimary);

  let written = 0, placed = 0, skipped = 0;
  const layerHits = {};

  for (const ns of ['hdb', 'condo', 'landed']) {
    let files;
    try { files = await fs.readdir(path.join(RECORDS, ns)); } catch { continue; }

    for (const file of files.filter(f => f.endsWith('.json'))) {
      const shard = JSON.parse(await fs.readFile(path.join(RECORDS, ns, file), 'utf8'));
      const out = {};

      for (const [key, rec] of Object.entries(shard)) {
        const g = geo.records[rec.href];
        if (!g || !USABLE.has(g.match)) { skipped++; continue; }
        placed++;

        const near = strip(nearFor(g, layers, { order: ORDER, keep: KEEP }));
        if (!near) continue;
        for (const k of Object.keys(near)) if (k !== 'at') layerHits[k] = (layerHits[k] || 0) + 1;
        out[key] = near;
      }

      if (Object.keys(out).length) {
        const dest = path.join(NEAR, ns, file);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(out));
        written++;
      }
    }
  }

  // The manifest is what the page reads to know whether the feature exists at
  // all, and what to print under each figure. Sources travel with the data.
  const manifest = {
    builtAt: new Date().toISOString(),
    geo: { source: geo.source, attribution: geo.attribution, accessedAt: geo.accessedAt },
    records: { placed, skipped },
    layers: Object.fromEntries(Object.entries(am.layers).map(([k, v]) => [k, {
      label: v.label, count: v.count, within: v.within,
      attribution: v.attribution, accessedAt: v.accessedAt,
    }])),
    primarySchools: primaries.length,
  };
  await fs.writeFile(path.join(NEAR, 'manifest.json'), JSON.stringify(manifest));

  console.log(`data/near — ${written} shards · ${placed} records placed · ${skipped} skipped (no usable coordinate)`);
  console.log(`  primary schools banded: ${primaries.length} of ${schools.length} schools`);
  for (const [k, n] of Object.entries(layerHits).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} on ${n} records`);
  }
  if (skipped) console.log(`\n  ${skipped} records show no amenities. \`npm run geocode -- --retry-weak\` may recover some.`);
}

main().catch(e => { console.error(`BUILD NEARBY FAILED: ${e.message}`); process.exit(1); });
