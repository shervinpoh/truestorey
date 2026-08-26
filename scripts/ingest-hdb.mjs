/**
 * HDB resale transactions from data.gov.sg. No API key required.
 * Licence: Singapore Open Data Licence v1.0 — commercial use permitted,
 * attribution with DATE OF ACCESS required. We record accessedAt for that.
 */
import fs from 'node:fs/promises';

const RESOURCE_ID = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const BASE = 'https://data.gov.sg/api/action/datastore_search';
const PAGE = 10_000;

async function fetchPage(offset) {
  const url = `${BASE}?resource_id=${RESOURCE_ID}&limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gov.sg ${res.status} at offset ${offset}`);
  const json = await res.json();
  if (!json.success) throw new Error('data.gov.sg returned success:false');
  return json.result;
}

export async function ingestHdb({ monthsBack = 36 } = {}) {
  const accessedAt = new Date().toISOString();
  const first = await fetchPage(0);
  const total = first.total;
  console.log(`HDB dataset: ${total.toLocaleString()} records`);

  let records = [...first.records];
  for (let off = PAGE; off < total; off += PAGE) {
    const p = await fetchPage(off);
    records.push(...p.records);
    process.stdout.write(`\r  fetched ${records.length.toLocaleString()} / ${total.toLocaleString()}`);
  }
  console.log('');

  // Keep only the recent window — older data bloats the bundle without helping.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  const rows = records
    .filter(r => r.month >= cutoffKey)
    .map(r => ({
      month: r.month,
      town: r.town,
      flatType: r.flat_type,
      block: r.block,
      street: r.street_name,
      storeyRange: r.storey_range,
      areaSqm: Number(r.floor_area_sqm),
      model: r.flat_model,
      leaseCommence: Number(r.lease_commence_date),
      remainingLease: r.remaining_lease,
      price: Number(r.resale_price),
      psf: Number(r.resale_price) / (Number(r.floor_area_sqm) * 10.7639),
    }));

  const out = {
    source: 'HDB Resale Flat Prices (data.gov.sg)',
    resourceId: RESOURCE_ID,
    licence: 'Singapore Open Data Licence v1.0',
    accessedAt,
    monthsBack,
    count: rows.length,
    rows,
  };

  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/hdb.json', import.meta.url), JSON.stringify(out));
  console.log(`Wrote data/hdb.json — ${rows.length.toLocaleString()} rows since ${cutoffKey}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestHdb().catch(e => { console.error('\nINGEST FAILED:', e.message); process.exit(1); });
}
