/**
 * Building footprints and heights, for Sunward — the sun on one window.
 *
 *   npm run ingest:buildings        an hour or more; OpenStreetMap is asked gently
 *   node scripts/ingest-buildings.mjs --from-cache   write what is fetched so far
 *
 * ── WHERE EACH PART COMES FROM ─────────────────────────────────────────────
 * Footprints: OpenStreetMap, © OpenStreetMap contributors, under the ODbL.
 * Heights, in order of trust:
 *   1. HDB's own storey count (max_floor_lvl, data/mop.json) for every HDB
 *      block, placed on the footprint that contains its geocoded point.
 *      Height = storeys × 2.8 m, HDB's usual floor to floor, stated wherever
 *      a result uses it.
 *   2. An OSM `height` tag, in metres.
 *   3. An OSM `building:levels` tag × 3.0 m.
 *   4. Nothing. The footprint is kept and drawn flat, and it never blocks
 *      the sun in a result — a height from memory is rule 13's failure.
 *
 * ── WHAT IS DROPPED, AND COUNTED ───────────────────────────────────────────
 * Footprints under 300 m² — landed houses, sheds, kiosks — would make this
 * file several hundred megabytes and rarely shade a flat's window. They are
 * not stored; they are COUNTED per 100 m square, so a result can say how many
 * unmeasured buildings stand near it rather than implying there are none.
 *
 * ── ASKING OPENSTREETMAP GENTLY ────────────────────────────────────────────
 * The first version asked for every building in 0.05° tiles and threw the
 * whole run away when one tile answered 504. Now: 0.025° tiles; full outlines
 * only for buildings whose perimeter passes 70 m (Overpass filters that on
 * its side), and just a centre point for the rest, which are only counted;
 * progress saved after every tile to the system temp directory, so a rerun
 * resumes; and a tile that still fails after five tries is recorded in
 * `missing` rather than ending the run. lib/massing.js gives no answer near a
 * missing tile instead of an answer with buildings left out.
 *
 * ── SIZE ───────────────────────────────────────────────────────────────────
 * Coordinates are integer steps of 1e-5 degrees (about 1.1 m), delta-encoded,
 * after a 0.8 m Douglas–Peucker. Read by lib/massing.js, including when a
 * long-tail page renders on demand — so next.config.mjs includes it for the
 * record routes and must not exclude it.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { simplify } from '../lib/geojson.js';

const OUT = new URL('../data/buildings.json', import.meta.url);
const read = async f => JSON.parse(await fs.readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const BBOX = [1.20, 103.60, 1.475, 104.05];
const STEP = 0.025;
const CACHE = path.join(os.tmpdir(), 'truestorey-buildings-cache.json');
const MIN_AREA = 300;
const HDB_FLOOR = 2.8, OSM_LEVEL = 3.0;
const SRC = { hdb: 1, height: 2, levels: 3, none: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function areaM2(g) {
  const k = Math.cos(g[0].lat * Math.PI / 180) * 111320;
  let a = 0;
  for (let i = 0; i < g.length - 1; i++) a += (g[i].lon * k) * (g[i + 1].lat * 110574) - (g[i + 1].lon * k) * (g[i].lat * 110574);
  return Math.abs(a) / 2;
}
const metresOf = v => { const m = /^\s*([\d.]+)\s*(m|metres|meters)?\s*$/i.exec(String(v || '')); return m ? Number(m[1]) : null; };

async function tile(s, w, n, e, attempt = 1) {
  const q = `[out:json][timeout:120];way["building"](if:length()>70)(${s},${w},${n},${e});out geom tags;`
    + `way["building"](if:length()<=70)(${s},${w},${n},${e});out center;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'User-Agent': 'truestorey/1.0 (+https://truestorey.vercel.app)', 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(180000),
  }).catch(err => ({ ok: false, status: 0, text: async () => String(err) }));
  const text = await res.text();
  if (!res.ok || !text.startsWith('{')) {
    if (attempt < 5) { await sleep(20000 * attempt); return tile(s, w, n, e, attempt + 1); }
    return { failed: `HTTP ${res.status} — ${text.replace(/\s+/g, ' ').slice(0, 120)}` };
  }
  return { elements: JSON.parse(text).elements || [] };
}

function pointIn(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function main() {
  /* Resume from the last run's progress when it is fresh. */
  let cache = { done: {}, kept: {}, small: {}, missing: [], at: Date.now() };
  try {
    const c = JSON.parse(await fs.readFile(CACHE, 'utf8'));
    if (Date.now() - c.at < 3 * 864e5) cache = c;
  } catch { /* no progress to resume */ }
  const kept = new Map(Object.entries(cache.kept));
  const small = cache.small;
  const missing = cache.missing.filter(m => !cache.done[m.join(',')]);
  const save = () => fs.writeFile(CACHE, JSON.stringify({ ...cache, kept: Object.fromEntries(kept), small, missing }));
  let seen = 0;
  const boxes = [];
  for (let s = BBOX[0]; s < BBOX[2]; s += STEP) for (let w = BBOX[1]; w < BBOX[3]; w += STEP) {
    const box = [s, w, s + STEP, w + STEP].map(v => Number(v.toFixed(3)));
    if (!cache.done[box.join(',')]) boxes.push(box);
  }
  /* One at a time. Two was tried on 26 Sep 2026 and drew 429s and then a
     temporary block from the public server; one with a pause is slower and
     finishes. OVERPASS_WORKERS=2 exists for a quiet hour, at your own risk. */
  const one = async box => {
    const key = box.join(',');
    const r = await tile(...box);
    if (r.failed) {
      missing.push(box);
      console.log(`\n  tile ${key} not read after five tries: ${r.failed}`);
      await save();
      return;
    }
    for (const x of r.elements) {
      seen++;
      if (x.center) {
        const key2 = `${Math.floor(x.center.lat * 900)}|${Math.floor(x.center.lon * 900)}`;   // ~0.0011° ≈ 120 m
        small[key2] = (small[key2] || 0) + 1;
        continue;
      }
      if (!x.geometry || x.geometry.length < 4 || kept.has(String(x.id))) continue;
      const a = areaM2(x.geometry);
      if (a < MIN_AREA) {
        const c = x.geometry[0];
        const key2 = `${Math.floor(c.lat * 900)}|${Math.floor(c.lon * 900)}`;
        small[key2] = (small[key2] || 0) + 1;
        continue;
      }
      const t = x.tags || {};
      const hTag = metresOf(t.height), lv = Number(t['building:levels']);
      const height = hTag ? { m: hTag, src: SRC.height } : lv > 0 ? { m: lv * OSM_LEVEL, src: SRC.levels } : { m: null, src: SRC.none };
      const ring = simplify(x.geometry.map(p => [p.lon, p.lat]), 0.000007).map(([lon, lat]) => [lat, lon]);
      kept.set(String(x.id), { ring, ...height, label: t.name || (t['addr:housenumber'] ? `${t['addr:housenumber']} ${t['addr:street'] || ''}`.trim() : null) });
    }
    cache.done[key] = true;
    await save();
    process.stdout.write(`\r  ${kept.size.toLocaleString('en-SG')} footprints kept · ${Object.keys(cache.done).length} tiles done · ${boxes.length} this run · tile ${key}   `);
    await sleep(4000);
  };
  /* --from-cache: write what has been fetched so far, every tile not yet
     read marked missing, so Sunward can go live where the model is whole
     while OpenStreetMap is unreachable. */
  const fromCache = process.argv.includes('--from-cache');
  if (fromCache) for (const box of boxes) missing.push(box);
  const queue = fromCache ? [] : [...boxes];
  const workers = Math.max(1, Math.min(2, Number(process.env.OVERPASS_WORKERS) || 1));
  await Promise.all(Array.from({ length: workers }, async () => { while (queue.length) await one(queue.shift()); }));
  console.log('');

  /* HDB's storey count onto the footprint its geocoded point falls in. */
  const mop = await read('mop.json');
  const geo = await read('geocache.json');
  const grid = new Map();
  for (const [id, b] of kept) {
    const [lat, lon] = b.ring[0];
    const k = `${Math.floor(lat * 500)}|${Math.floor(lon * 500)}`;
    (grid.get(k) || grid.set(k, []).get(k)).push(id);
  }
  let placed = 0, unplaced = 0;
  for (const [key, storeys] of Object.entries(mop.storeys || {})) {
    const [blk, street] = key.split('|');
    const hit = geo[`${blk} ${street}`]?.results?.find(r => String(r.blk) === String(blk)) || null;
    if (!hit) { unplaced++; continue; }
    const lat = Number(hit.lat), lon = Number(hit.lon);
    let found = null;
    for (let dy = -1; dy <= 1 && !found; dy++) for (let dx = -1; dx <= 1 && !found; dx++) {
      for (const id of grid.get(`${Math.floor(lat * 500) + dy}|${Math.floor(lon * 500) + dx}`) || []) {
        if (pointIn(lat, lon, kept.get(id).ring)) { found = id; break; }
      }
    }
    if (!found) { unplaced++; continue; }
    const b = kept.get(found);
    b.m = storeys * HDB_FLOOR; b.src = SRC.hdb; b.label = `Blk ${blk}`; b.storeys = storeys;
    placed++;
  }

  const q = v => Math.round(v * 1e5);
  const out = [];
  for (const b of kept.values()) {
    const flat = [];
    let [pl, po] = [q(b.ring[0][0]), q(b.ring[0][1])];
    flat.push(pl, po);
    for (const [lat, lon] of b.ring.slice(1)) { const [a, c] = [q(lat), q(lon)]; flat.push(a - pl, c - po); [pl, po] = [a, c]; }
    out.push([b.m === null ? null : Math.round(b.m * 10) / 10, b.src, b.label, b.storeys || null, flat]);
  }
  const counts = out.reduce((a, b) => (a[b[1]]++, a), [0, 0, 0, 0]);
  await fs.writeFile(OUT, JSON.stringify({
    source: 'OpenStreetMap building footprints, heights from HDB Property Information and OSM tags',
    licence: 'Footprints © OpenStreetMap contributors, ODbL 1.0. HDB storey counts: HDB Property Information (data.gov.sg), Singapore Open Data Licence.',
    accessedAt: new Date().toISOString(),
    floor: { hdb: HDB_FLOOR, osmLevel: OSM_LEVEL },
    sources: ['none', 'hdb storeys', 'osm height', 'osm levels'],
    minArea: MIN_AREA,
    small: { cell: 1 / 900, counts: small },
    /* Tiles OpenStreetMap would not answer for. lib/massing.js gives no
       result near one rather than a result with buildings left out. */
    missing: [...new Map(missing.filter(m => !cache.done[m.join(',')]).map(m => [m.join(','), m])).values()],
    b: out,
  }));
  console.log(`Wrote data/buildings.json — ${out.length.toLocaleString('en-SG')} footprints ≥ ${MIN_AREA} m²: `
    + `${counts[1]} HDB storey heights, ${counts[2]} OSM heights, ${counts[3]} OSM levels, ${counts[0]} no height; `
    + `${Object.values(small).reduce((a, b) => a + b, 0).toLocaleString('en-SG')} smaller buildings counted, not stored. `
    + `HDB blocks placed ${placed}, not placed ${unplaced}.`
    + (missing.some(m => !cache.done[m.join(',')]) ? ' Some tiles were not read — rerun to fill them.' : ''));
}

main().catch(e => { console.error(`\n${e.message}\ndata/buildings.json left as it was.`); process.exit(1); });
