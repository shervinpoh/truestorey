/**
 * PRIVATE residential transactions from the URA Data Service.
 * Requires a FREE AccessKey: https://eservice.ura.gov.sg/maps/api/reg.html
 * Auth is two-step — the AccessKey mints a token that expires DAILY.
 *
 * ⚠ REALIS data must NEVER be used here. CEA PG 02-11 s6 states REALIS is for
 * personal research only, not commercial or marketing use. This API is the
 * public Data Service, which is covered by the Singapore Open Data Licence.
 */
import fs from 'node:fs/promises';

const TOKEN_URL = 'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1';
const DATA_URL  = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1';

async function getToken(accessKey) {
  const res = await fetch(TOKEN_URL, { headers: { AccessKey: accessKey } });
  const json = await res.json();
  if (!json.Result) throw new Error(`URA token failed: ${json.Message || res.status}`);
  return json.Result;
}

/** Transaction data is split across 4 batches. All four are needed for full coverage. */
async function fetchBatch(accessKey, token, batch) {
  const res = await fetch(`${DATA_URL}?service=PMI_Resi_Transaction&batch=${batch}`, {
    headers: { AccessKey: accessKey, Token: token, 'User-Agent': 'Mozilla/5.0' },
  });
  const json = await res.json();
  if (json.Status !== 'Success') throw new Error(`URA batch ${batch}: ${json.Message}`);
  return json.Result || [];
}

export async function ingestUra({ accessKey = process.env.URA_ACCESS_KEY } = {}) {
  if (!accessKey) throw new Error('Set URA_ACCESS_KEY in .env.local — register free at eservice.ura.gov.sg/maps/api/reg.html');
  const accessedAt = new Date().toISOString();
  const token = await getToken(accessKey);

  const projects = [];
  for (const batch of [1, 2, 3, 4]) {
    const result = await fetchBatch(accessKey, token, batch);
    projects.push(...result);
    console.log(`  batch ${batch}: ${result.length} projects`);
  }

  const rows = [];
  for (const p of projects) {
    for (const t of (p.transaction || [])) {
      const area = Number(t.area);
      const price = Number(t.price);
      rows.push({
        project: p.project,
        street: p.street,
        marketSegment: p.marketSegment,   // CCR / RCR / OCR
        district: t.district,
        propertyType: t.propertyType,     // Condominium / Apartment / Executive Condominium / Terrace ...
        tenure: t.tenure,
        typeOfSale: t.typeOfSale,         // 1 New Sale, 2 Sub Sale, 3 Resale
        contractDate: t.contractDate,     // MMYY
        floorRange: t.floorRange || null,
        areaSqm: area,
        price,
        psf: price / (area * 10.7639),
        noOfUnits: Number(t.noOfUnits || 1),
      });
    }
  }

  const out = {
    source: 'URA Data Service — PMI_Resi_Transaction',
    licence: 'Singapore Open Data Licence v1.0',
    accessedAt,
    count: rows.length,
    rows,
  };
  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/private.json', import.meta.url), JSON.stringify(out));
  console.log(`Wrote data/private.json — ${rows.length.toLocaleString()} transactions`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestUra().catch(e => { console.error('INGEST FAILED:', e.message); process.exit(1); });
}
