/**
 * Build the price map.
 *
 *   npm run build:map
 *
 * Every block and project that has both a usable coordinate and a median psf,
 * flattened into one compact file the map page draws in a single canvas pass.
 *
 * This is the cheapest big feature in the repo: the 13,115 coordinates were
 * geocoded for the amenities join, and this reuses every one of them. The
 * competitor charges for the equivalent.
 *
 * Two decisions worth keeping:
 *
 *  · QUANTILE BREAKS, NOT EQUAL INTERVALS. Singapore psf is heavily
 *    right-skewed — a handful of Orchard projects would flatten the entire HDB
 *    heartland into one colour under a min-max ramp. Quantiles put an equal
 *    number of places in each band, so the map shows where things actually
 *    differ instead of showing that Ardmore Park is expensive.
 *
 *  · REGIONS ARE DERIVED, MEDIANS ARE NOT. A town's centroid is the median
 *    latitude and longitude of its own plotted blocks — there is no boundary
 *    file in the repo and I will not draw one from memory. The psf figure
 *    beside the label is the one already published on /hdb and /condo, read
 *    straight out of index.json, so the map and the tables can never disagree.
 *
 *  · ARRAYS, NOT OBJECTS. 13,115 records with named keys is about a megabyte
 *    of repeated key names. Positional arrays cut it to a third before gzip.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const USABLE = new Set(['exact', 'good', 'street']);
const NS = { hdb: 0, condo: 1, landed: 2 };

const read = async f => JSON.parse(await fs.readFile(path.join(ROOT, 'data', f), 'utf8'));

// Same shape the town routes already use: 'ANG MO KIO' -> 'ang-mo-kio'.
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function quantiles(values, n) {
  const s = values.slice().sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < n; i++) out.push(s[Math.floor((i / n) * s.length)]);
  return out;
}

async function main() {
  let geo;
  try { geo = await read('geo.json'); }
  catch { console.error('No data/geo.json. Run `npm run geocode` first.'); process.exit(1); }

  const points = [];
  const skipped = { noCoord: 0, weak: 0, noPsf: 0 };
  // Every record's median, whether or not it could be placed on the map. The
  // district figure has to be the same number /condo and /landed already show,
  // and those pages count records, not coordinates.
  const pool = new Map();

  for (const ns of Object.keys(NS)) {
    let files;
    try { files = await fs.readdir(path.join(ROOT, 'data', 'records', ns)); } catch { continue; }
    for (const f of files.filter(f => f.endsWith('.json'))) {
      const shard = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'records', ns, f), 'utf8'));
      for (const r of Object.values(shard)) {
        if (Number.isFinite(r.medianPsf)) {
          const key = ns === 'hdb' ? `hdb:${r.town}` : `${ns}:${r.district}`;
          const e = pool.get(key) || { psf: [], sales: 0, members: 0 };
          e.psf.push(r.medianPsf); e.sales += r.n || 0; e.members++;
          pool.set(key, e);
        }
        const g = geo.records[r.href];
        if (!g) { skipped.noCoord++; continue; }
        if (!USABLE.has(g.match)) { skipped.weak++; continue; }
        if (!Number.isFinite(r.medianPsf)) { skipped.noPsf++; continue; }
        // The 8th field is the region this place belongs to — town for HDB,
        // postal district for private. It is filled in below, once every
        // region is known and can be given a stable index.
        points.push([
          NS[ns],
          Math.round(g.lat * 1e5) / 1e5,
          Math.round(g.lon * 1e5) / 1e5,
          Math.round(r.medianPsf),
          r.href,
          r.label,
          r.n,
          ns === 'hdb' ? `hdb:${r.town}` : `${ns}:${r.district}`,
        ]);
      }
    }
  }

  if (!points.length) { console.error('Nothing plottable.'); process.exit(1); }

  const lats = points.map(p => p[1]), lons = points.map(p => p[2]);
  const i = await read('index.json').catch(() => ({}));

  // Breaks are computed PER NAMESPACE. An HDB block and a Sentosa bungalow do
  // not belong on one scale — sharing one would paint every flat in the
  // country the same colour, which is the opposite of a map.
  const breaks = {};
  for (const [name, code] of Object.entries(NS)) {
    const v = points.filter(p => p[0] === code).map(p => p[3]);
    if (v.length) breaks[code] = quantiles(v, 6).map(Math.round);
  }

  // ── Regions ────────────────────────────────────────────────────────────
  // Somewhere to orient from. The map draws the island out of the data, which
  // is honest and completely unlabelled — you cannot answer "where is Bishan"
  // from a field of dots. These are the anchors that fix that.
  //
  // The centroid is the MEDIAN lat and lon of the region's own plotted places,
  // not the mean: Bedok reaches down to the coast and Bukit Timah is a long
  // tail of streets, and a mean gets dragged off the built-up middle by both.
  // The median lands where the housing actually is, which is where a label
  // belongs.
  const median = v => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const regions = {};
  for (const [name, code] of Object.entries(NS)) {
    const groups = new Map();
    for (const p of points) {
      if (p[0] !== code) continue;
      const g = groups.get(p[7]) || [];
      g.push(p); groups.set(p[7], g);
    }
    const list = [];
    for (const [key, g] of groups) {
      const raw = key.slice(key.indexOf(':') + 1);
      if (!raw || raw === 'undefined' || raw === 'null') continue;
      // The figure is whichever one the matching index page already publishes,
      // never a second one invented here — a town and its own page disagreeing
      // by a dollar is the kind of thing that costs a reader's trust for good.
      //
      //   HDB      the town median from index.json: a true median of every
      //            filed sale in the town, exactly what /hdb shades its tiles by.
      //   Private  the median of the projects' or streets' own medians, which
      //            is what /condo and /landed compute for their district tiles.
      //            index.json's district figure covers all private housing at
      //            once, so it would put landed money on the condo layer.
      const p0 = pool.get(key) || { psf: [], sales: 0, members: 0 };
      const own = name === 'hdb' ? i.hdb?.towns?.[raw] : null;
      const psf = own ? own.medianPsf : median(p0.psf);
      list.push([
        key,
        name === 'hdb' ? raw : `D${raw}`,
        name === 'hdb' ? `/hdb/${slug(raw)}` : null,   // districts have no page of their own
        Math.round(median(g.map(p => p[1])) * 1e5) / 1e5,
        Math.round(median(g.map(p => p[2])) * 1e5) / 1e5,
        Number.isFinite(psf) ? Math.round(psf) : null,
        own ? own.n : p0.sales,
        p0.members,
        g.length,
      ]);
    }
    list.sort((a, b) => a[1].localeCompare(b[1]));
    regions[code] = list;
  }

  // Swap each point's region key for an index into its own type's list, so the
  // map can dim everything outside a selection without a string compare per
  // point per frame.
  const at = {};
  for (const [code, list] of Object.entries(regions)) {
    at[code] = new Map(list.map((r, n) => [r[0], n]));
  }
  for (const p of points) {
    const n = at[p[0]]?.get(p[7]);
    p[7] = Number.isInteger(n) ? n : -1;
  }
  for (const list of Object.values(regions)) for (const r of list) r.shift();  // key was scaffolding

  // ── Rail ───────────────────────────────────────────────────────────────
  // Reference geometry, so a dot has something to sit next to. STATIONS, NOT
  // LINES: the LTA exit dataset carries a name and a coordinate and nothing
  // that says which line a station is on. Joining them into lines would mean
  // me supplying the order from memory, and a wrong rail line drawn over real
  // transactions is exactly the kind of confident-and-wrong this site exists
  // to not be. One mark per station, and the station is the mean of its exits.
  // Singapore's actual shape, if it has been ingested. Optional on purpose:
  // the map worked before it existed and must keep working without it, so a
  // clone with no boundaries.json still renders rather than erroring.
  let land = null;
  try {
    const b = await read('boundaries.json');
    land = {
      source: b.source, accessedAt: b.accessedAt, licence: b.licence,
      areas: b.areas.map(a => [a.name, a.slug, a.centroid, a.rings]),
    };
  } catch { /* not ingested yet */ }

  let rail = [], railSource = null, railAccessed = null;
  try {
    const am = await read('amenities.json');
    railSource = am.layers?.rail?.attribution || am.layers?.rail?.source || null;
    railAccessed = am.layers?.rail?.accessedAt || am.builtAt || null;
    // Grouped by the station NAME, not by the dataset's full string, so the
    // three places where an MRT and an LRT station share a name and a concourse
    // — Bukit Panjang, Choa Chu Kang, Punggol — end up as the one place a
    // passenger would call them, not as two marks 100m apart.
    const byName = new Map();
    for (const p of am.layers?.rail?.points || []) {
      if (!p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      const name = p.name.replace(/\s+(MRT|LRT)\s+STATION$/i, '').trim();
      const g = byName.get(name) || [];
      g.push(p); byName.set(name, g);
    }
    rail = [...byName].map(([name, exits]) => [
      name,
      Math.round((exits.reduce((a, e) => a + e.lat, 0) / exits.length) * 1e5) / 1e5,
      Math.round((exits.reduce((a, e) => a + e.lon, 0) / exits.length) * 1e5) / 1e5,
      // Heavy rail wins a shared name: an interchange should read as an
      // interchange, and the mark is the same place either way.
      exits.every(e => /LRT/i.test(e.name)) ? 1 : 0,
    ]).sort((a, b) => a[0].localeCompare(b[0]));
  } catch { /* amenities are optional; the map is still a map without them */ }

  const out = {
    builtAt: new Date().toISOString(),
    bbox: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)],
    breaks,
    counts: Object.fromEntries(Object.entries(NS).map(([n, c]) => [n, points.filter(p => p[0] === c).length])),
    regions,
    rail,
    land,
    source: {
      hdb: i.hdb?.source, private: i.private?.source,
      period: i.hdb?.period, accessedAt: i.hdb?.accessedAt,
      geo: geo.source, geoAccessed: geo.accessedAt,
      rail: railSource, railAccessed: railAccessed,
    },
    points,
  };

  await fs.writeFile(path.join(ROOT, 'data', 'map.json'), JSON.stringify(out));
  const kb = Math.round((await fs.stat(path.join(ROOT, 'data', 'map.json'))).size / 1024);

  console.log(`data/map.json — ${points.length.toLocaleString('en-SG')} points, ${kb}KB`);
  for (const [n, c] of Object.entries(out.counts)) console.log(`  ${n.padEnd(7)} ${c.toLocaleString('en-SG')}`);
  console.log(`  regions: ${Object.entries(regions).map(([c, l]) => `${l.length} ${Object.keys(NS).find(k => NS[k] === Number(c))}`).join(', ')}`);
  console.log(`  rail:    ${rail.length} stations`);
  console.log(`  land:    ${land ? `${land.areas.length} planning areas` : 'not ingested — run `npm run ingest:boundaries`'}`);
  console.log(`  skipped: ${skipped.weak} weak coordinate, ${skipped.noCoord} unplaced, ${skipped.noPsf} without a psf`);
  for (const [code, b] of Object.entries(breaks)) {
    const name = Object.keys(NS).find(k => NS[k] === Number(code));
    console.log(`  ${name.padEnd(7)} breaks $${b.join(' · $')}`);
  }
}

main().catch(e => { console.error(`BUILD MAP FAILED: ${e.message}`); process.exit(1); });
