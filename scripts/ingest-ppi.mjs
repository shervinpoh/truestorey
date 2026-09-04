/**
 * URA's Private Residential Property Price Index, from SingStat Table Builder.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The site has published HDB's resale price index since the beginning and
 * nothing for private, so anyone comparing a flat to a condo had to leave to
 * do it. It is also the series /cost needs to answer "what does it cost to be
 * wrong" for the three quarters of readers who are not buying an HDB flat.
 *
 * ── WHY SINGSTAT AND NOT data.gov.sg ───────────────────────────────────────
 * data.gov.sg does not carry it. Its dataset search ignores the query string
 * entirely — the same six unrelated datasets come back for every term — so
 * "not found there" was established by looking, not by one failed guess.
 * SingStat's Table Builder does carry it, as table M212261, and names URA as
 * the datasource in the response itself. That attribution is stored and
 * rendered rather than paraphrased.
 *
 * ── WHAT IT IS ─────────────────────────────────────────────────────────────
 * Quarterly, 1Q2009 = 100 — the SAME base quarter as HDB's index, which is
 * what makes the two comparable without rebasing either. Three series: all
 * residential, landed, non-landed. From 1Q2015 URA computes it by stratified
 * hedonic regression, which controls for size and age; before that it did not.
 * The footnote saying so is stored and shown, because a reader comparing a
 * 1996 quarter with a 2026 one is comparing two methods.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * It excludes executive condominiums. An EC reader gets the non-landed series
 * with that stated, because the closest published series named as such beats
 * a bespoke one built here out of caveats.
 */
import fs from 'node:fs/promises';

const TABLE = 'M212261';
const ENDPOINT = `https://tablebuilder.singstat.gov.sg/api/table/tabledata/${TABLE}`;

/** SingStat writes a quarter "1975 1Q"; every other file here says "1975-Q1". */
const normQuarter = k => {
  const mt = /^(\d{4})\s*([1-4])Q$/.exec(String(k).trim());
  return mt ? `${mt[1]}-Q${mt[2]}` : null;
};

/** Which row is which. Matched on rowText, not on position — a reordered
 *  table would otherwise relabel landed as non-landed in silence. */
const WANTED = [
  ['all', /^residential properties$/i],
  ['landed', /^landed$/i],
  ['nonLanded', /^non-?landed$/i],
];

export async function ingestPpi() {
  const accessedAt = new Date().toISOString();
  const res = await fetch(ENDPOINT, { headers: { 'User-Agent': 'truestorey/1.0 (+https://truestorey.vercel.app)' } });
  if (!res.ok) throw new Error(`SingStat ${res.status} for table ${TABLE}`);
  const json = await res.json();
  if (json.StatusCode !== 200) throw new Error(`SingStat StatusCode ${json.StatusCode}: ${json.Message || 'no message'}`);

  const d = json.Data;
  const rows = d?.row || [];
  if (!rows.length) throw new Error(`Table ${TABLE} returned no rows — the table id may have been retired`);

  const series = {};
  for (const [key, re] of WANTED) {
    const row = rows.find(r => re.test(String(r.rowText || '').trim()));
    if (!row) {
      throw new Error(`No row matching ${re} — got: ${rows.map(r => r.rowText).join(' | ')}`);
    }
    const points = (row.columns || [])
      .map(c => ({ quarter: normQuarter(c.key), index: Number(c.value) }))
      .filter(p => p.quarter && Number.isFinite(p.index) && p.index > 0)
      .sort((a, b) => a.quarter.localeCompare(b.quarter));
    if (points.length < 40) {
      throw new Error(`Series "${row.rowText}" parsed only ${points.length} quarters — expected the full history`);
    }
    series[key] = { label: row.rowText.trim(), points };
  }

  const main = series.all.points;
  const last = main.at(-1), prevQ = main.at(-2), prevY = main.at(-5);
  const out = {
    source: 'URA Private Residential Property Price Index (SingStat Table Builder)',
    // Named in SingStat's own response. Stored rather than asserted here.
    datasource: d.datasource || 'URBAN REDEVELOPMENT AUTHORITY',
    tableId: TABLE,
    href: `https://tablebuilder.singstat.gov.sg/table/TS/${TABLE}`,
    licence: 'SingStat Table Builder — reproduction permitted with attribution',
    base: '1Q2009 = 100',
    frequency: d.frequency || 'Quarterly',
    // The method changed in 1Q2015 and the footnote is the only place that
    // says so. A reader spanning that boundary is spanning two methods.
    footnote: (d.footnote || '').trim(),
    dataLastUpdated: d.dataLastUpdated || null,
    accessedAt,
    excludes: 'Executive condominiums are not in this index.',
    latest: last,
    qoq: prevQ ? ((last.index - prevQ.index) / prevQ.index) * 100 : null,
    yoy: prevY ? ((last.index - prevY.index) / prevY.index) * 100 : null,
    series,
  };

  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../data/ppi.json', import.meta.url), JSON.stringify(out));
  console.log(`Wrote data/ppi.json — ${Object.keys(series).length} series, `
    + `${main.length} quarters, ${main[0].quarter} to ${last.quarter}, latest ${last.index}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestPpi().catch(e => { console.error('\nPRIVATE PRICE INDEX INGEST FAILED:', e.message); process.exit(1); });
}
