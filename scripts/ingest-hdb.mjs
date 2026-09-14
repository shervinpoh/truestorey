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

  /* ── HDB'S OWN NOTES TRAVEL WITH HDB'S OWN FIGURES ──────────────────────
     data.gov.sg publishes three caveats with this dataset and none of them
     were kept. They are not currently shown to anyone and probably should not
     be: measured against the data, none of the three changes a decision, which
     is the bar /methodology sets for a caveat earning a place beside a figure.

     They are captured anyway because capture is free and the question "what
     does HDB say about this data" should be answerable from the repo rather
     than from somebody's memory of a web page.

     ONE OF THEM LOOKED IMPORTANT AND IS NOT, which is worth recording so the
     next person does not spend the afternoon I did. "The approximate floor
     area includes any recess area purchased, space adding item under HDB's
     upgrading programmes, roof terrace, etc." reads like a warning that psf is
     not comparable between flats, because a padded denominator would push psf
     down. Tested within flat type, model AND lease decade, larger-area flats
     come out with HIGHER psf, not lower — +2.1%, -4.3%, +17.0% and +35.4%
     across the four decades — and they carry a price premium too. The extra
     area behaves like real living space, not padding. The first cut of that
     test showed a 141 psf gap that looked damning and was entirely a lease-era
     confound.

     Fetched rather than typed. A caveat copied by hand goes stale the day the
     publisher edits it, and the site would then be quoting a regulator saying
     something it no longer says. */
  let sourceNotes = null;
  try {
    const meta = await fetch(
      `https://api-production.data.gov.sg/v2/public/api/datasets/${RESOURCE_ID}/metadata`,
    ).then(r => r.json());
    sourceNotes = meta?.data?.description || null;
  } catch {
    /* Degrade, never break. A missing caveat is a file that says less, not an
       ingest that fails and leaves the site on month-old prices. */
  }
  if (!sourceNotes) {
    /* Keep what was there rather than blanking it, which is what an earlier
       version of this claimed to do in a comment while writing null. */
    try {
      const prev = JSON.parse(
        await fs.readFile(new URL('../data/hdb.json', import.meta.url), 'utf8'));
      sourceNotes = prev.sourceNotes ?? null;
      console.warn('  ! could not read HDB’s dataset notes; kept the previous ones');
    } catch {
      console.warn('  ! could not read HDB’s dataset notes, and there were none to keep');
    }
  }

  const out = {
    source: 'HDB Resale Flat Prices (data.gov.sg)',
    resourceId: RESOURCE_ID,
    licence: 'Singapore Open Data Licence v1.0',
    sourceNotes,
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
