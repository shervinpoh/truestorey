/**
 * HDB Resale Price Index from data.gov.sg. No API key required.
 *
 * This is the answer to "how's the market?", which is the first question
 * almost every visitor has. Quarterly, 1Q2009 = 100.
 *
 * Licence: Singapore Open Data Licence v1.0 — attribution with DATE OF ACCESS
 * required, so accessedAt is recorded and rendered beside every figure.
 */
import fs from 'node:fs/promises';

const RESOURCE_ID = 'd_14f63e595975691e7c24a27ae4c07c79';
const BASE = 'https://data.gov.sg/api/action/datastore_search';

export async function ingestIndex() {
  const accessedAt = new Date().toISOString();
  const url = `${BASE}?resource_id=${RESOURCE_ID}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gov.sg ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error('data.gov.sg returned success:false');

  const recs = json.result.records || [];
  if (!recs.length) throw new Error('Price index returned zero records — resource id may have changed');

  // Column names have shifted before; find them rather than assuming.
  const sample = recs[0];
  const qKey = Object.keys(sample).find(k => /quarter/i.test(k));
  const iKey = Object.keys(sample).find(k => /^index$/i.test(k)) || Object.keys(sample).find(k => /index/i.test(k));
  if (!qKey || !iKey) {
    throw new Error(`Unexpected columns: ${Object.keys(sample).join(', ')} — expected a quarter and an index field`);
  }

  const points = recs
    .map(r => ({ quarter: String(r[qKey]).trim(), index: Number(r[iKey]) }))
    .filter(p => /^\d{4}-Q[1-4]$/.test(p.quarter) && Number.isFinite(p.index))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  if (!points.length) throw new Error(`No parseable quarters. First raw row: ${JSON.stringify(sample)}`);

  const last = points.at(-1), prevQ = points.at(-2), prevY = points.at(-5);
  const out = {
    source: 'HDB Resale Price Index (data.gov.sg)',
    resourceId: RESOURCE_ID,
    licence: 'Singapore Open Data Licence v1.0',
    accessedAt,
    base: '1Q2009 = 100',
    latest: last,
    qoq: prevQ ? ((last.index - prevQ.index) / prevQ.index) * 100 : null,
    yoy: prevY ? ((last.index - prevY.index) / prevY.index) * 100 : null,
    points,
  };

  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/hdb-index.json', import.meta.url), JSON.stringify(out));
  console.log(`Wrote data/hdb-index.json — ${points.length} quarters, ${points[0].quarter} to ${last.quarter}, latest ${last.index}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestIndex().catch(e => { console.error('\nPRICE INDEX INGEST FAILED:', e.message); process.exit(1); });
}
