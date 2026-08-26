/**
 * Collapses raw transactions into the aggregates the site queries.
 * Runs after both ingests.
 *
 * Emits three files, deliberately split so the homepage never pays for
 * the long tail of detail records:
 *
 *   data/index.json    town / district aggregates + heat grids  (small, always loaded)
 *   data/search.json   compact typeahead manifest               (small, always loaded)
 *   data/records.json  per-block and per-project detail         (large, loaded on first search)
 *
 * Granularity rule: private is addressable by PROJECT, HDB by BLOCK.
 * District and town aggregates exist only for the heat grid, never as an answer.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { slugify, hrefOf, shardOf } from '../lib/slug.js';

/** Slugs are public URLs. Two records must never claim the same one. */
function uniqueSlug(taken, base) {
  if (!taken.has(base)) { taken.add(base); return base; }
  for (let i = 2; ; i++) {
    const s = `${base}-${i}`;
    if (!taken.has(s)) { taken.add(s); return s; }
  }
}

const median = a => { if (!a.length) return 0; const s=[...a].sort((x,y)=>x-y); const m=s.length>>1;
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };

async function readJson(name) {
  try { return JSON.parse(await fs.readFile(new URL(`../data/${name}`, import.meta.url), 'utf8')); }
  catch { return null; }
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}

function summarise(rows) {
  const prices = rows.map(r => r.price), psfs = rows.map(r => r.psf);
  return {
    n: rows.length,
    medianPrice: Math.round(median(prices)),
    medianPsf: Math.round(median(psfs)),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    minPsf: Math.round(Math.min(...psfs)),
    maxPsf: Math.round(Math.max(...psfs)),
  };
}

/** URA gives contract date as MMYY. Widen to YYYY-MM. */
const uraMonth = cd => {
  if (!cd || cd.length !== 4) return null;
  return `20${cd.slice(2)}-${cd.slice(0,2)}`;
};

/** Monthly median series, oldest first, plus YoY off the 13-month lag. */
function seriesOf(rows, monthOf) {
  const byMonth = {};
  for (const [m, mRows] of groupBy(rows, monthOf)) {
    if (!m) continue;
    byMonth[m] = { median: Math.round(median(mRows.map(r => r.price))),
                   medianPsf: Math.round(median(mRows.map(r => r.psf))), n: mRows.length };
  }
  const months = Object.keys(byMonth).sort();
  const series = months.map(m => ({ month: m, ...byMonth[m] }));
  const last = series.at(-1)?.medianPsf, prior = series.at(-13)?.medianPsf;
  return { series, yoy: (prior && last) ? ((last - prior) / prior) * 100 : null };
}

const trimHdb = r => ({ month: r.month, price: r.price, psf: Math.round(r.psf),
  flatType: r.flatType, areaSqm: r.areaSqm, storey: r.storeyRange,
  model: r.model, remainingLease: r.remainingLease });

const SALE_TYPE = { '1': 'New sale', '2': 'Sub sale', '3': 'Resale' };
const trimPriv = r => ({ month: uraMonth(r.contractDate), price: r.price, psf: Math.round(r.psf),
  areaSqm: r.areaSqm, floor: r.floorRange, propertyType: r.propertyType,
  saleType: SALE_TYPE[r.typeOfSale] || r.typeOfSale, tenure: r.tenure });

async function main() {
  const hdb = await readJson('hdb.json');
  const priv = await readJson('private.json');
  const index = { builtAt: new Date().toISOString(), attribution: [] };
  const records = {};
  const search = [];
  const takenHdb = {};                                   // one namespace per town
  const takenPriv = { condo: new Set(), landed: new Set() };

  if (hdb) {
    const accessed = hdb.accessedAt.slice(0,10);
    index.attribution.push(`Contains information from ${hdb.source} accessed on ${accessed} from data.gov.sg, made available under the Singapore Open Data Licence v1.0`);
    const months = [...new Set(hdb.rows.map(r => r.month))].sort();
    index.hdb = { towns: {}, months, period: { from: months[0], to: months.at(-1) },
                  source: hdb.source, accessedAt: accessed };

    for (const [town, tRows] of groupBy(hdb.rows, r => r.town)) {
      const byType = {};
      for (const [ft, fRows] of groupBy(tRows, r => r.flatType)) {
        byType[ft] = { ...summarise(fRows), ...seriesOf(fRows, r => r.month) };
      }
      index.hdb.towns[town] = { ...summarise(tRows), byType };
    }

    // Block layer — the addressable unit for HDB.
    for (const [key, bRows] of groupBy(hdb.rows, r => `${r.block}|${r.street}`)) {
      const [block, street] = key.split('|');
      const latest = bRows.reduce((a, b) => (a.month > b.month ? a : b));
      const byType = {};
      for (const [ft, fRows] of groupBy(bRows, r => r.flatType)) byType[ft] = summarise(fRows);
      const id = `H:${key}`;
      const townSlug = slugify(latest.town);
      const slug = uniqueSlug(takenHdb[townSlug] ||= new Set(), slugify(`${block} ${street}`));
      const href = `/hdb/${townSlug}/${slug}`;
      records[id] = {
        id, kind: 'HDB', slug, href, townSlug, shard: `hdb/${townSlug}`,
        block, street, town: latest.town,
        label: `Blk ${block} ${street}`,
        leaseCommence: latest.leaseCommence, remainingLease: latest.remainingLease,
        flatTypes: Object.keys(byType).sort(),
        ...summarise(bRows), byType, ...seriesOf(bRows, r => r.month),
        recent: bRows.sort((a,b) => b.month.localeCompare(a.month)).slice(0, 20).map(trimHdb),
        source: hdb.source, accessedAt: accessed,
        period: { from: months[0], to: months.at(-1) },
      };
      search.push({ id, t: 'H', n: `Blk ${block} ${street}`, s: latest.town, c: bRows.length, h: href });
    }
  } else console.warn('No data/hdb.json — run: npm run ingest:hdb');

  if (priv) {
    const accessed = priv.accessedAt.slice(0,10);
    index.attribution.push(`Contains information from ${priv.source} accessed on ${accessed}, made available under the Singapore Open Data Licence v1.0`);
    const pMonths = [...new Set(priv.rows.map(r => uraMonth(r.contractDate)).filter(Boolean))].sort();
    index.private = { districts: {}, months: pMonths, period: { from: pMonths[0], to: pMonths.at(-1) },
                      source: priv.source, accessedAt: accessed };

    for (const [d, rows] of groupBy(priv.rows, r => r.district)) {
      const byType = {};
      for (const [pt, pRows] of groupBy(rows, r => r.propertyType)) byType[pt] = summarise(pRows);
      index.private.districts[d] = { ...summarise(rows), byType };
    }

    // Project layer — the addressable unit for private.
    // URA buckets all landed under "LANDED HOUSING DEVELOPMENT"; that is not a
    // project name, so landed is addressed by street instead.
    const LANDED = 'LANDED HOUSING DEVELOPMENT';
    const projKey = r => (r.project === LANDED ? `street|${r.street}` : `proj|${r.project}`);

    for (const [key, rows] of groupBy(priv.rows, projKey)) {
      const isStreet = key.startsWith('street|');
      const name = key.slice(key.indexOf('|') + 1);
      const first = rows[0];
      const byType = {};
      for (const [pt, pRows] of groupBy(rows, r => r.propertyType)) byType[pt] = summarise(pRows);
      const id = `P:${key}`;
      const tenures = [...new Set(rows.map(r => r.tenure))];
      const ns = isStreet ? 'landed' : 'condo';
      const slug = uniqueSlug(takenPriv[ns], slugify(name));
      const href = `/${ns}/${slug}`;
      records[id] = {
        id, kind: 'PRIVATE', slug, href, ns, shard: shardOf[ns](slug),
        project: isStreet ? null : name, street: isStreet ? name : first.street,
        label: isStreet ? `Landed · ${name}` : name,
        landed: isStreet,
        district: first.district, segment: first.marketSegment,
        tenure: tenures.length === 1 ? tenures[0] : tenures,
        propertyTypes: Object.keys(byType).sort(),
        ...summarise(rows), byType,
        ...seriesOf(rows, r => uraMonth(r.contractDate)),
        recent: rows
          .map(trimPriv)
          .sort((a,b) => (b.month || '').localeCompare(a.month || ''))
          .slice(0, 20),
        source: priv.source, accessedAt: accessed,
        period: { from: pMonths[0], to: pMonths.at(-1) },
      };
      search.push({ id, t: 'P', n: records[id].label, s: `D${first.district} · ${first.marketSegment}`, c: rows.length, h: href });
    }
  } else console.warn('No data/private.json — run: npm run ingest:ura (needs URA_ACCESS_KEY)');

  // Busiest first, so a bare prefix surfaces the projects people actually mean.
  search.sort((a, b) => b.c - a.c);

  /* ---- shard the record store -------------------------------------------
     One 32MB file meant every cold start parsed the whole country to render
     one block. Sharding by a key derivable from the URL means a page reads
     ~300KB and needs no lookup table to find it. Records are keyed by slug,
     because the slug is what arrives in the request.                        */
  const shards = new Map();
  for (const r of Object.values(records)) {
    if (!shards.has(r.shard)) shards.set(r.shard, {});
    shards.get(r.shard)[r.slug] = r;
  }

  const dataDir = new URL('../data/', import.meta.url);
  for (const [name, obj] of shards) {
    const file = new URL(`records/${name}.json`, dataDir);
    await fs.mkdir(path.dirname(file.pathname), { recursive: true });
    await fs.writeFile(file, JSON.stringify(obj));
  }

  /* Town index pages — without these the block pages are orphans no crawler
     can reach. Deliberately light: enough to list and link, nothing more.   */
  const towns = {};
  for (const r of Object.values(records)) {
    if (r.kind !== 'HDB') continue;
    (towns[r.townSlug] ||= { name: r.town, slug: r.townSlug, href: hrefOf.town(r.town), blocks: [] })
      .blocks.push({ slug: r.slug, href: r.href, block: r.block, street: r.street,
                     n: r.n, medianPsf: r.medianPsf, flatTypes: r.flatTypes });
  }
  for (const t of Object.values(towns)) {
    t.blocks.sort((a, b) => a.street.localeCompare(b.street) || a.block.localeCompare(b.block, 'en', { numeric: true }));
    const agg = index.hdb?.towns?.[t.name];
    if (agg) Object.assign(t, { n: agg.n, medianPrice: agg.medianPrice, medianPsf: agg.medianPsf, byType: agg.byType });
  }

  /* Light lists for the condo / landed index pages — links only, no comparables. */
  const projects = { condo: [], landed: [] };
  for (const r of Object.values(records)) {
    if (r.kind !== 'PRIVATE') continue;
    projects[r.ns].push({ slug: r.slug, href: r.href, label: r.label,
                          district: r.district, segment: r.segment, n: r.n, medianPsf: r.medianPsf });
  }
  for (const k of Object.keys(projects)) projects[k].sort((a, b) => a.label.localeCompare(b.label));

  /* Flat url list for the sitemap. */
  const urls = Object.values(records)
    .map(r => ({ href: r.href, n: r.n }))
    .concat(Object.values(towns).map(t => ({ href: t.href, n: t.n })))
    .sort((a, b) => b.n - a.n);

  const out = async (name, obj) => {
    const url = new URL(`../data/${name}`, import.meta.url);
    await fs.writeFile(url, JSON.stringify(obj));
    const bytes = (await fs.stat(url)).size;
    console.log(`Wrote data/${name} — ${(bytes/1024).toFixed(0)} KB`);
  };
  await out('index.json', index);
  await out('search.json', { builtAt: index.builtAt, count: search.length, entries: search });
  await out('towns.json', towns);
  await out('projects.json', projects);
  await out('urls.json', { builtAt: index.builtAt, urls });

  // Superseded by data/records/. Emptied rather than deleted so a stale 32MB
  // file cannot be picked up by anything still pointing at it.
  await out('records.json', {});

  const shardBytes = await Promise.all([...shards.keys()].map(async n =>
    (await fs.stat(new URL(`records/${n}.json`, dataDir))).size));
  const total = shardBytes.reduce((a, b) => a + b, 0);
  console.log(`Wrote data/records/ — ${shards.size} shards, ${(total/1024/1024).toFixed(1)} MB total, ` +
              `largest ${(Math.max(...shardBytes)/1024).toFixed(0)} KB, median ${(shardBytes.sort((a,b)=>a-b)[shardBytes.length>>1]/1024).toFixed(0)} KB`);
  console.log(`Searchable: ${search.filter(s=>s.t==='H').length} HDB blocks · ${search.filter(s=>s.t==='P').length} private projects/streets · ${Object.keys(towns).length} towns`);
}
main().catch(e => { console.error('BUILD INDEX FAILED:', e.message); process.exit(1); });
