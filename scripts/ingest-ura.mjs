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

/**
 * A project entry whose transactions are an exact whole-number multiple of
 * themselves, collapsed back to one copy.
 *
 * ── WHAT THIS IS FIXING ────────────────────────────────────────────────────
 * KEW DRIVE arrived as three project entries in batch 3: KEW VALE with 36
 * transactions and 36 distinct, KEW GROVE with 4 and 4, and LANDED HOUSING
 * DEVELOPMENT with 33 transactions and 11 distinct. Exactly three copies of
 * everything. On the page that became the same terrace listed three times, and
 * a 1,335.6 sqm detached at S$16,300,000 three times in one month.
 *
 * ── WHY THE RULE IS "EVERY ROW, THE SAME NUMBER OF TIMES" ───────────────────
 * Identical sales are real. A launch sells identical units at one price in one
 * month and URA files each separately; deleting those would understate volume
 * and drag every median on the site. So the test cannot be "this row appears
 * twice".
 *
 * What separates them is whether the repetition is uniform. Measured over all
 * 3,857 project entries in one download:
 *
 *   LANDED HOUSING DEVELOPMENT   67.2% x1 · 22.7% EXACTLY x2 · 10.0% EXACTLY x3
 *                                 0.1% non-integer
 *   named projects               90.8% x1 ·  9.1% non-integer
 *                                 0.1% exact multiple
 *
 * An entry where SOME transactions repeat — a non-integer ratio — is a real
 * launch. An entry where EVERY transaction repeats the same number of times is
 * the feed handing back N copies of one list, and the two populations barely
 * overlap.
 *
 * ── WHY THREE ───────────────────────────────────────────────────────────────
 * With one or two distinct sales an exact ratio can happen by chance: two
 * identical apartments, filed twice, is x2 and is real. At three or more
 * distinct sales all repeating the same number of times, coincidence stops
 * being plausible. 43 small landed entries are left alone by this floor and
 * still show their repeats — components/RecordView.jsx groups those for
 * display and says it cannot tell the two cases apart, which is the honest
 * answer where the evidence runs out.
 *
 * Nothing here touches HDB, which is clean at 0.08%.
 */
export const MIN_DISTINCT_TO_COLLAPSE = 3;

export function dedupeEntry(p) {
  const tx = p?.transaction || [];
  if (tx.length < 2) return tx;
  const sig = t => [t.contractDate, t.price, t.area, t.propertyType, t.typeOfSale,
                    t.floorRange, t.tenure, t.district, t.noOfUnits].join('|');
  const first = new Map();
  for (const t of tx) if (!first.has(sig(t))) first.set(sig(t), t);
  const distinct = first.size;
  if (distinct < MIN_DISTINCT_TO_COLLAPSE) return tx;
  const ratio = tx.length / distinct;
  if (ratio <= 1 || Math.abs(ratio - Math.round(ratio)) > 1e-9) return tx;
  return [...first.values()];
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
  const raw = {};
  for (const batch of [1, 2, 3, 4]) {
    const result = await fetchBatch(accessKey, token, batch);
    raw[batch] = result;
    projects.push(...result);
    console.log(`  batch ${batch}: ${result.length} projects`);
  }

  /* The raw download, kept. This ingest had no such file, and diagnosing a
     duplication that turned out to be in the SOURCE meant re-fetching the live
     API to find out — which is the exact situation the note in CLAUDE.md about
     saving raw downloads was written for. .gitignored, and in
     outputFileTracingExcludes: @vercel/nft reads the disk, not the index. */
  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/.ura-raw.json', import.meta.url), JSON.stringify(raw));

  const rows = [];
  for (const p of projects) {
    for (const t of (dedupeEntry(p) || [])) {
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
  await fs.writeFile(new URL('../data/private.json', import.meta.url), JSON.stringify(out));
  const before = projects.reduce((a, p) => a + (p.transaction || []).length, 0);
  console.log(`Wrote data/private.json — ${rows.length.toLocaleString()} transactions`);
  /* Said out loud every run. A collapse that stops happening is as much a
     signal as one that starts: it would mean the feed changed shape. */
  console.log(`  collapsed ${(before - rows.length).toLocaleString()} rows from entries that `
    + 'returned every transaction the same whole number of times');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestUra().catch(e => { console.error('INGEST FAILED:', e.message); process.exit(1); });
}
