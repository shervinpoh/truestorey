/**
 * HDB Property Information → the MOP tracker.
 *
 * WHY THIS IS BUILT ON EVIDENCE, NOT A FORMULA
 * --------------------------------------------
 * The Minimum Occupation Period runs five years from KEY COLLECTION, which this
 * dataset does not carry. It carries "Year Completed". Completion and key
 * collection are not the same date, and MOP also differs for resale-flat
 * buyers, SERS replacement flats and some schemes.
 *
 * So this script never publishes "the MOP date". It publishes two things:
 *   1. earliestMop = yearCompleted + 5 — labelled as the EARLIEST POSSIBLE year
 *   2. firstResaleSeen — the first month a resale was actually filed at that
 *      block, taken from data/hdb.json. That is an observed fact.
 *
 * A block past its fifth year with no resale ever filed is the genuinely
 * interesting case: supply that has not yet reached the market. That is the
 * signal an owner or a buyer actually wants, and it is defensible because it is
 * an absence of evidence rather than an invented date.
 *
 * Licence: Singapore Open Data Licence v1.0.
 */
import fs from 'node:fs/promises';

const RESOURCE_ID = 'd_17f5382f26140b1fdae0ba2ef6239d2f';
const BASE = 'https://data.gov.sg/api/action/datastore_search';
const PAGE = 5000;

/** HDB building-contract town codes. Unknown codes pass through unchanged. */
const TOWN = {
  AMK:'ANG MO KIO', BB:'BUKIT BATOK', BD:'BEDOK', BH:'BISHAN', BM:'BUKIT MERAH',
  BP:'BUKIT PANJANG', BT:'BUKIT TIMAH', CCK:'CHOA CHU KANG', CL:'CLEMENTI',
  CT:'CENTRAL AREA', GL:'GEYLANG', HG:'HOUGANG', JE:'JURONG EAST', JW:'JURONG WEST',
  KWN:'KALLANG/WHAMPOA', MP:'MARINE PARADE', PG:'PUNGGOL', PRC:'PASIR RIS',
  QT:'QUEENSTOWN', SB:'SEMBAWANG', SGN:'SERANGOON', SK:'SENGKANG', TAP:'TAMPINES',
  TG:'TENGAH', TP:'TOA PAYOH', WL:'WOODLANDS', YS:'YISHUN',
};

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pick = (o, ...names) => {
  for (const n of names) {
    const k = Object.keys(o).find(k2 => k2.toLowerCase().replace(/[^a-z0-9]/g,'') === n.toLowerCase().replace(/[^a-z0-9]/g,''));
    if (k) return o[k];
  }
  return undefined;
};

async function fetchPage(offset) {
  const res = await fetch(`${BASE}?resource_id=${RESOURCE_ID}&limit=${PAGE}&offset=${offset}`);
  if (!res.ok) throw new Error(`data.gov.sg ${res.status} at offset ${offset}`);
  const json = await res.json();
  if (!json.success) throw new Error('data.gov.sg returned success:false');
  return json.result;
}

export async function ingestMop() {
  const accessedAt = new Date().toISOString();
  const thisYear = new Date().getFullYear();

  const first = await fetchPage(0);
  const total = first.total;
  let recs = [...first.records];
  for (let off = PAGE; off < total; off += PAGE) {
    recs.push(...(await fetchPage(off)).records);
    process.stdout.write(`\r  fetched ${recs.length.toLocaleString()} / ${total.toLocaleString()}`);
  }
  console.log('');
  if (!recs.length) throw new Error('HDB Property Information returned zero records');

  // What resales have actually been filed? Keyed block|street, same as the site.
  let seen = new Map();
  try {
    const hdb = JSON.parse(await fs.readFile(new URL('../data/hdb.json', import.meta.url), 'utf8'));
    for (const r of hdb.rows) {
      const k = `${r.block}|${r.street}`;
      const cur = seen.get(k);
      if (!cur || r.month < cur.firstMonth) seen.set(k, { firstMonth: r.month, n: (cur?.n || 0) + 1 });
      else seen.set(k, { firstMonth: cur.firstMonth, n: cur.n + 1 });
    }
    console.log(`  cross-referenced ${seen.size.toLocaleString()} blocks with filed resales`);
  } catch {
    console.warn('  ⚠ data/hdb.json not found — run npm run ingest:hdb first for the evidence layer');
  }

  const blocks = [];
  for (const r of recs) {
    if (String(pick(r, 'residential') || '').toUpperCase() !== 'Y') continue;
    const yearCompleted = num(pick(r, 'year_completed', 'yearcompleted'));
    if (!yearCompleted) continue;

    const block  = String(pick(r, 'blk_no', 'blkno') || '').trim();
    const street = String(pick(r, 'street') || '').trim().toUpperCase();
    const code   = String(pick(r, 'bldg_contract_town', 'bldgcontracttown') || '').trim().toUpperCase();
    if (!block || !street) continue;

    const ev = seen.get(`${block}|${street}`);
    blocks.push({
      block, street,
      town: TOWN[code] || code,
      townCode: code,
      yearCompleted,
      earliestMop: yearCompleted + 5,          // EARLIEST POSSIBLE, not the MOP date
      units: num(pick(r, 'total_dwelling_units', 'totaldwellingunits')),
      firstResaleSeen: ev?.firstMonth || null, // observed fact, or null
      resalesSeen: ev?.n || 0,
    });
  }

  // Group by town, then by the year the block reaches its fifth year.
  const towns = {};
  for (const b of blocks) {
    const t = (towns[b.town] ||= { town: b.town, blocks: 0, units: 0, byYear: {} });
    t.blocks++; t.units += b.units;
    const y = t.byYear[b.earliestMop] ||= { year: b.earliestMop, blocks: 0, units: 0, withResale: 0, list: [] };
    y.blocks++; y.units += b.units;
    if (b.resalesSeen) y.withResale++;
    y.list.push(b);
  }
  for (const t of Object.values(towns)) {
    for (const y of Object.values(t.byYear)) {
      y.list.sort((a, b) => b.units - a.units || a.block.localeCompare(b.block, 'en', { numeric: true }));
    }
  }

  // The headline: blocks at or past their fifth year with no filed resale yet.
  const upcoming = blocks
    .filter(b => b.earliestMop >= thisYear && b.earliestMop <= thisYear + 4)
    .sort((a, b) => a.earliestMop - b.earliestMop || b.units - a.units);

  const unlockedNoResale = blocks.filter(b => b.earliestMop <= thisYear && b.resalesSeen === 0);

  const out = {
    source: 'HDB Property Information (data.gov.sg)',
    resourceId: RESOURCE_ID,
    licence: 'Singapore Open Data Licence v1.0',
    accessedAt,
    generatedForYear: thisYear,
    caveat: 'MOP runs five years from key collection, which this dataset does not carry. '
          + 'Years shown are the earliest possible, derived from year of completion. '
          + 'Where a resale has actually been filed at a block, that month is shown instead.',
    totals: {
      residentialBlocks: blocks.length,
      units: blocks.reduce((a, b) => a + b.units, 0),
      upcomingBlocks: upcoming.length,
      upcomingUnits: upcoming.reduce((a, b) => a + b.units, 0),
      pastFifthYearNoResaleFiled: unlockedNoResale.length,
    },
    upcomingByYear: Object.values(
      upcoming.reduce((acc, b) => {
        const y = acc[b.earliestMop] ||= { year: b.earliestMop, blocks: 0, units: 0, towns: {} };
        y.blocks++; y.units += b.units;
        y.towns[b.town] = (y.towns[b.town] || 0) + b.units;
        return acc;
      }, {})
    ).sort((a, b) => a.year - b.year),
    towns,
  };

  await fs.writeFile(new URL('../data/mop.json', import.meta.url), JSON.stringify(out));
  const kb = ((await fs.stat(new URL('../data/mop.json', import.meta.url))).size / 1024).toFixed(0);
  console.log(`Wrote data/mop.json — ${kb} KB · ${blocks.length.toLocaleString()} residential blocks · `
            + `${out.totals.upcomingBlocks.toLocaleString()} reaching year five ${thisYear}–${thisYear+4} `
            + `(${out.totals.upcomingUnits.toLocaleString()} units)`);
  const unknown = [...new Set(blocks.filter(b => !TOWN[b.townCode]).map(b => b.townCode))];
  if (unknown.length) console.warn(`  ⚠ unmapped town codes (shown raw): ${unknown.join(', ')}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestMop().catch(e => { console.error('\nMOP INGEST FAILED:', e.message); process.exit(1); });
}
