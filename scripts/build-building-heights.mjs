/**
 * Condominium towers with no published height, given the one URA implies.
 *
 *   npm run build:heights          (runs after ingest:buildings)
 *
 * ── THE SOURCE, AND WHY IT IS A MINIMUM ────────────────────────────────────
 * URA files every private sale with a floor band: "36-40". A sale in that
 * band proves the tower reaches at least the 36th floor — not the 40th, and
 * not how far above. So a footprint with no OSM or HDB height, nearest to a
 * project's geocoded point, is given (lowest floor of the project's highest
 * band sold) × 3.0 m, and marked source 4: a LOWER BOUND. It can make Sunward
 * say a window is lit that a taller tower in fact shades — never the reverse —
 * and the page says which heights are minimums.
 *
 * A footprint is assigned only to the project whose point is nearest to it,
 * within 70 m, so one project's height never lands on a neighbour's tower.
 * Footprints that already have a height are not touched.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { privateKey, isHouse } from '../lib/private-key.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = async f => JSON.parse(await fs.readFile(path.join(ROOT, 'data', f), 'utf8'));
const LEVEL = 3.0, WITHIN = 70;

async function main() {
  const b = await read('buildings.json');
  const priv = await read('private.json');
  const geo = (await read('geo.json')).records || {};

  /* The highest band's LOWER floor, per project. */
  const top = new Map();
  for (const r of priv.rows) {
    if (isHouse(r)) continue;
    const m = /^(\d+)-(\d+)$/.exec(r.floorRange || '');
    if (!m) continue;
    const k = `P:${privateKey(r)}`;
    top.set(k, Math.max(top.get(k) || 0, Number(m[1])));
  }
  /* Record id → href, from the condo shards. */
  const points = [];
  const dir = path.join(ROOT, 'data', 'records', 'condo');
  for (const f of await fs.readdir(dir)) {
    const shard = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
    for (const rec of Object.values(shard)) {
      const g = geo[rec.href], floors = top.get(rec.id);
      if (g && floors >= 2) points.push({ lat: g.lat, lon: g.lon, floors, label: rec.label });
    }
  }
  const grid = new Map(), CELL = 0.001;
  for (const p of points) {
    const k = `${Math.floor(p.lat / CELL)}|${Math.floor(p.lon / CELL)}`;
    (grid.get(k) || grid.set(k, []).get(k)).push(p);
  }

  let given = 0;
  const kx = 111320 * Math.cos(1.35 * Math.PI / 180), ky = 110574;
  for (const row of b.b) {
    if (row[0] !== null) continue;
    const flat = row[4];
    let lat = flat[0], lon = flat[1], sLat = lat, sLon = lon, n = 1;
    for (let i = 2; i < flat.length; i += 2) { lat += flat[i]; lon += flat[i + 1]; sLat += lat; sLon += lon; n++; }
    const cLat = sLat / n / 1e5, cLon = sLon / n / 1e5;
    let best = null, bd = WITHIN;
    const ci = Math.floor(cLat / CELL), cj = Math.floor(cLon / CELL);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
      for (const p of grid.get(`${ci + a}|${cj + c}`) || []) {
        const d = Math.hypot((p.lon - cLon) * kx, (p.lat - cLat) * ky);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (!best) continue;
    row[0] = Math.round(best.floors * LEVEL * 10) / 10;
    row[1] = 4;
    row[2] = row[2] || best.label;
    row[3] = best.floors;
    given++;
  }
  b.sources = ['none', 'hdb storeys', 'osm height', 'osm levels', 'ura highest floor band sold (a minimum)'];
  b.floor = { ...b.floor, uraLevel: LEVEL };
  await fs.writeFile(path.join(ROOT, 'data', 'buildings.json'), JSON.stringify(b));
  console.log(`build:heights — ${given.toLocaleString('en-SG')} condominium footprints given URA's floor-band minimum `
    + `(${points.length.toLocaleString('en-SG')} projects with a point and a floor band).`);
}

main().catch(e => { console.error(e); process.exit(1); });
