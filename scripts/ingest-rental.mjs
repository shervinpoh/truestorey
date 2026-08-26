/**
 * PRIVATE residential RENTAL contracts from the URA Data Service.
 *
 *   npm run ingest:rental        (needs .env.local — same AccessKey as sales)
 *
 * The one genuine data gap on the site, and a small one: the key is already
 * held, and the endpoint sits alongside the transaction one that has been in
 * use since the first week. TRM charges PRO for the yields this produces.
 *
 * ⚠ REALIS must NEVER be used here. CEA PG 02-11 s6 — REALIS is licensed for
 * personal research, not commercial or marketing use. This is the public Data
 * Service under the Singapore Open Data Licence, which is a different thing.
 *
 * The API returns MONTHLY rent in dollars and an area RANGE in square metres
 * rather than an exact area — "70 to 80" and so on. That matters more than it
 * looks: a rent psf computed off the midpoint of a range is an estimate, and
 * the honest thing is to carry the range through so the page can say so. The
 * band is stored, not silently collapsed.
 */
import fs from 'node:fs/promises';

const TOKEN_URL = 'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1';
const DATA_URL  = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1';
const SQM_TO_SQFT = 10.7639;

async function getToken(accessKey) {
  const res = await fetch(TOKEN_URL, { headers: { AccessKey: accessKey } });
  const json = await res.json();
  if (!json.Result) throw new Error(`URA token failed: ${json.Message || res.status}`);
  return json.Result;
}

/** Rental contracts come in three refPeriod batches, one per recent quarter set. */
async function fetchBatch(accessKey, token, batch) {
  const res = await fetch(`${DATA_URL}?service=PMI_Resi_Rental&refPeriod=${batch}`, {
    headers: { AccessKey: accessKey, Token: token, 'User-Agent': 'Mozilla/5.0' },
  });
  const json = await res.json();
  if (json.Status !== 'Success') throw new Error(`URA rental ${batch}: ${json.Message}`);
  return json.Result || [];
}

/** "70 to 80" -> { from: 70, to: 80 }. Never averaged here. */
function areaBand(s) {
  const m = /(\d+)\s*(?:to|-)\s*(\d+)/i.exec(String(s ?? ''));
  if (m) return { from: Number(m[1]), to: Number(m[2]) };
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? { from: n, to: n } : null;
}

export async function ingestRental({ accessKey = process.env.URA_ACCESS_KEY, periods = ['25q4', '26q1', '26q2'] } = {}) {
  if (!accessKey) throw new Error('Set URA_ACCESS_KEY in .env.local — the same key the sales ingest uses.');
  const accessedAt = new Date().toISOString();
  const token = await getToken(accessKey);

  const projects = [];
  for (const p of periods) {
    try {
      const result = await fetchBatch(accessKey, token, p);
      projects.push(...result);
      console.log(`  ${p}: ${result.length} projects`);
    } catch (e) {
      // One bad quarter must not lose the other two. The page renders the
      // period it actually has rather than pretending to a full year.
      console.error(`  ${p}: ${e.message}`);
    }
  }
  if (!projects.length) throw new Error('No rental data returned for any period.');

  const rows = [];
  for (const p of projects) {
    for (const r of (p.rental || [])) {
      const band = areaBand(r.areaSqm ?? r.area);
      const rent = Number(r.rent);
      if (!Number.isFinite(rent) || rent <= 0) continue;
      rows.push({
        project: p.project,
        street: p.street,
        district: p.district ?? r.district,
        propertyType: r.propertyType,
        noOfBedRoom: r.noOfBedRoom === '0' ? null : Number(r.noOfBedRoom) || null,
        leaseDate: r.leaseDate,            // MMYY
        areaFrom: band?.from ?? null,
        areaTo: band?.to ?? null,
        rent,
        // psf per month, as a RANGE — the wide end and the narrow end of the
        // area band. A single number here would be an invention.
        psfHigh: band?.from ? rent / (band.from * SQM_TO_SQFT) : null,
        psfLow: band?.to ? rent / (band.to * SQM_TO_SQFT) : null,
      });
    }
  }

  const out = {
    source: 'URA Data Service — PMI_Resi_Rental',
    licence: 'Singapore Open Data Licence v1.0',
    note: 'Areas are published as ranges, not exact figures. Rent psf is carried as a range for that reason and is never collapsed to one number.',
    accessedAt,
    periods,
    count: rows.length,
    rows,
  };
  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/rental.json', import.meta.url), JSON.stringify(out));
  console.log(`Wrote data/rental.json — ${rows.length.toLocaleString()} rental contracts`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestRental().catch(e => { console.error('INGEST RENTAL FAILED:', e.message); process.exit(1); });
}
