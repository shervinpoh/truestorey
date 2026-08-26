/**
 * Pull every amenity layer into data/amenities.json.
 *
 *   npm run probe:amenities              what each source actually returns
 *   npm run ingest:amenities             fetch the lot
 *   npm run ingest:amenities -- --only=rail
 *
 * RUN THE PROBE FIRST. The dataset ids in amenity-sources.mjs were written
 * without a connection to data.gov.sg and are the most likely thing here to
 * be wrong. The probe tells you which ones in one pass.
 *
 * Layers fail independently, and a failed layer keeps whatever it had on disk
 * — the SORA lesson. NParks being down for an afternoon must not blank out
 * the schools, and it must never blank out a layer into a plausible-looking
 * empty state. A layer is either fresh, or visibly stale, or absent.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { LAYERS, ORDER, pick } from './amenity-sources.mjs';
import { fetchTable, fetchGeo, resolveDownload } from './lib/datagov.mjs';
import { geocodePostal, geocodeProject, loadCache, saveCache, USABLE } from './lib/onemap.mjs';

const OUT = path.join(process.cwd(), 'data', 'amenities.json');
const SOURCES = path.join(process.cwd(), 'data', 'sources');

const argv = process.argv.slice(2);
const only = (argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;
const picked = only ? only.split(',').map(s => s.trim()).filter(Boolean) : null;
const wanted = picked ? ORDER.filter(k => picked.includes(k)) : ORDER;

/* -------------------------------------------------------------- helpers */

const readJson = async (p, fb) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fb; } };
const inSingapore = p => p.lat > 1.15 && p.lat < 1.50 && p.lon > 103.55 && p.lon < 104.15;

/** Trim a layer to what a page actually needs. Nothing decorative survives. */
function tidy(points, spec) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (!inSingapore(p)) continue;                 // a stray (0,0) would sit off Africa
    const name = (p.name || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    if (spec.exclude && spec.exclude.test(name)) continue;
    const key = `${name}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
    if (seen.has(key)) continue;                   // layers repeat a site per entrance
    seen.add(key);
    const row = { name, lat: p.lat, lon: p.lon };
    for (const k of Object.keys(spec.extra || {})) if (p[k]) row[k] = p[k];
    out.push(row);
  }
  return out;
}

/* --------------------------------------------------------------- layers */

async function fetchLayer(key, spec) {
  if (spec.mode === 'geo') {
    const ids = [{ label: spec.label, id: spec.id }, ...(spec.alt || [])];
    let last;
    for (const cand of ids) {
      try {
        const feats = await fetchGeo(cand.id);
        const points = feats.map(f => ({
          name: pick(f, spec.name), lat: f.lat, lon: f.lon,
          ...Object.fromEntries(Object.entries(spec.extra || {}).map(([k, cols]) => [k, pick(f, cols)])),
        }));
        return { points, via: `${cand.label} (${cand.id})` };
      } catch (e) { last = `${cand.id}: ${e.message}`; }
    }
    throw new Error(last);
  }

  if (spec.mode === 'table') {
    const rows = await fetchTable(spec.id);
    if (!rows.length) throw new Error('dataset returned no rows');
    const cols = Object.keys(rows[0]);
    if (!pick(rows[0], spec.name)) {
      throw new Error(`no name column among [${cols.join(', ')}] — expected one of ${spec.name.join('/')}`);
    }
    const points = [];
    let unplaced = 0;
    for (const row of rows) {
      const name = pick(row, spec.name);
      const postal = pick(row, spec.postal);
      if (!name) continue;
      const g = await geocodePostal(postal, name);
      if (!g || g.error || !USABLE.has(g.match)) { unplaced++; continue; }
      points.push({
        name, lat: g.lat, lon: g.lon,
        ...Object.fromEntries(Object.entries(spec.extra || {}).map(([k, c]) => [k, pick(row, c)])),
      });
    }
    await saveCache({ force: true });
    return { points, via: `${spec.id} (${rows.length} rows, ${unplaced} could not be placed)` };
  }

  if (spec.mode === 'curated') {
    const list = await readJson(path.join(SOURCES, spec.curated), null);
    if (!Array.isArray(list)) throw new Error(`data/sources/${spec.curated} is missing — optional layer, nothing is broken`);
    if (!list.length) throw new Error(`data/sources/${spec.curated} is empty — optional layer, add entries when you want it`);
    return { points: await placeCurated(list), via: `data/sources/${spec.curated} (${list.length} entries)` };
  }

  throw new Error(`unknown mode "${spec.mode}"`);
}

/**
 * Curated entries may carry their own coordinates or just a name. A name is
 * usually the better input: OneMap is a more reliable source of a coordinate
 * than anything typed by hand.
 */
async function placeCurated(list) {
  const out = [];
  for (const e of list) {
    if (!e?.name) continue;
    if (Number.isFinite(e.lat) && Number.isFinite(e.lon)) { out.push({ ...e }); continue; }
    const g = await geocodeProject(e.name, e.street || null);
    if (!g || g.error || !USABLE.has(g.match)) continue;
    out.push({ ...e, lat: g.lat, lon: g.lon });
  }
  await saveCache({ force: true });
  return out;
}

/* ------------------------------------------------------------------ run */

async function main() {
  await loadCache();
  const prev = await readJson(OUT, { layers: {} });
  const next = { builtAt: new Date().toISOString(), layers: { ...(prev.layers || {}) } };
  const ok = [], kept = [], absent = [];

  for (const key of wanted) {
    const spec = LAYERS[key];
    process.stdout.write(`${key.padEnd(10)} `);
    try {
      const { points, via } = await fetchLayer(key, spec);
      let rows = tidy(points, spec);

      // Extra curated entries folded into a fetched layer — the only route to
      // a station that does not exist yet.
      if (spec.mode !== 'curated' && spec.curated) {
        const extra = await readJson(path.join(SOURCES, spec.curated), null);
        if (Array.isArray(extra) && extra.length) {
          const add = tidy(await placeCurated(extra), spec);
          const have = new Set(rows.map(r => r.name.toUpperCase()));
          const fresh = add.filter(r => !have.has(r.name.toUpperCase()));
          rows = rows.concat(fresh);
          if (fresh.length) process.stdout.write(`(+${fresh.length} curated) `);
        }
      }

      if (!rows.length) throw new Error('nothing usable after cleaning');
      next.layers[key] = {
        label: spec.label, count: rows.length, within: spec.within,
        source: via, attribution: spec.attribution,
        accessedAt: new Date().toISOString().slice(0, 10),
        points: rows,
      };
      ok.push(`${key} ${rows.length}`);
      console.log(`✓ ${rows.length}`);
    } catch (e) {
      const had = prev.layers?.[key];
      if (had) { kept.push(key); console.log(`✗ ${e.message}\n           kept ${had.count} from ${had.accessedAt}`); }
      else { absent.push(key); console.log(`✗ ${e.message}\n           layer absent — pages will simply not show it`); }
    }
  }

  await fs.writeFile(OUT + '.tmp', JSON.stringify(next));
  await fs.rename(OUT + '.tmp', OUT);
  await saveCache({ force: true });

  console.log(`\ndata/amenities.json — ${Object.keys(next.layers).length} layers`);
  if (kept.length) console.log(`  stale (source failed, old data kept): ${kept.join(', ')}`);
  if (absent.length) console.log(`  missing: ${absent.join(', ')} — fix the id in scripts/amenity-sources.mjs, then re-probe`);
  console.log('\nNext: npm run build:nearby');
}

/* ---------------------------------------------------------------- probe */

async function probe() {
  console.log('Probing amenity sources. Nothing is written.\n');
  for (const key of wanted) {
    const spec = LAYERS[key];
    console.log(`— ${key} · ${spec.label} · mode=${spec.mode}`);
    if (spec.mode === 'curated') {
      const list = await readJson(path.join(SOURCES, spec.curated), null);
      console.log(Array.isArray(list) ? `  data/sources/${spec.curated}: ${list.length} entries\n` : `  data/sources/${spec.curated}: not present (optional)\n`);
      continue;
    }
    for (const cand of [{ label: 'primary', id: spec.id }, ...(spec.alt || [])]) {
      console.log(`  ${cand.label}: ${cand.id}`);
      try {
        if (spec.mode === 'geo') {
          const url = await resolveDownload(cand.id, { tries: 4 });
          console.log(`    poll-download ok → ${url.slice(0, 90)}…`);
          const feats = await fetchGeo(cand.id);
          console.log(`    ${feats.length} features · attribute keys: ${Object.keys(feats[0] || {}).slice(0, 14).join(', ')}`);
          console.log(`    name column "${spec.name.find(n => pick(feats[0] || {}, [n])) || 'NONE OF ' + spec.name.join('/')}" → ${pick(feats[0] || {}, spec.name) || '—'}`);
        } else {
          const rows = await fetchTable(cand.id, { max: 5 });
          console.log(`    ${rows.length}+ rows · columns: ${Object.keys(rows[0] || {}).join(', ')}`);
          console.log(`    name → ${pick(rows[0] || {}, spec.name) || 'NOT FOUND'} · postal → ${pick(rows[0] || {}, spec.postal) || 'NOT FOUND'}`);
        }
      } catch (e) {
        console.log(`    failed: ${e.message}`);
        if (e.rateLimited) console.log('    (that is a throttle, not a bad id — re-run the probe in a few minutes)');
      }
    }
    console.log('');
  }
  console.log('Anything that failed is an id to fix in scripts/amenity-sources.mjs.');
  console.log('Anything that says "rate limited" is not an id problem — just run it again.');
}

(argv.includes('--probe') ? probe() : main()).catch(async e => {
  await saveCache({ force: true }).catch(() => {});
  console.error(`\nAMENITIES INGEST FAILED: ${e.message}`);
  process.exit(1);
});
