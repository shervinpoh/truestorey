/**
 * SORA and domestic interest rates from MAS. No key required.
 *
 * MAS eservices goes down for maintenance regularly, so this script is built to
 * survive that rather than to assume a clean run:
 *
 *  · it tries several known endpoints and takes the first that answers
 *  · it recognises the MAS maintenance page and says so, instead of blaming
 *    the resource id
 *  · on failure it LEAVES the existing data/sora.json in place. Losing good
 *    data because the source was briefly down would be the worse outcome.
 *  · it never invents or carries forward a rate as if it were fresh — the file
 *    records accessedAt, and the page marks the figure stale past 7 days
 *
 * Run `node scripts/ingest-sora.mjs --probe` to see exactly what each endpoint
 * returns without writing anything.
 *
 * ── 26 SEP 2026: THE API THIS WAS BUILT ON STOPPED ANSWERING ───────────────
 * Every call to eservices.mas.gov.sg/api/… has returned MAS's "work in
 * progress" failover page since before this repo ever held a SORA figure —
 * data/sora.json was never once written, so every daily refresh since 9 Sep
 * ended red on this source and /market showed no rate. MAS's own statistics
 * page for the same series still works: an ASP.NET form whose Download
 * button returns the daily table as CSV. That is the primary source now
 * (fromStatistics below); the API stays as a fallback in case MAS brings it
 * back. Same agency, same series — not a second-hand copy.
 */
import fs from 'node:fs/promises';

const OUT = new URL('../data/sora.json', import.meta.url);
const DAYS = 400;

/** Tried in order; first one that returns usable JSON wins. */
const ENDPOINTS = [
  { label: 'MAS eservices · domestic interest rates',
    url: `https://eservices.mas.gov.sg/api/action/datastore/search.json?resource_id=9a0bf149-308c-4bd2-832d-76c8e6cb47ed&limit=${DAYS}&sort=end_of_day%20desc` },
  { label: 'MAS eservices · domestic interest rates (unsorted)',
    url: `https://eservices.mas.gov.sg/api/action/datastore/search.json?resource_id=9a0bf149-308c-4bd2-832d-76c8e6cb47ed&limit=${DAYS}` },
  /*
   * api.mas.gov.sg was the third endpoint here and is gone — the host has NO
   * DNS RECORD, so it never resolved and never could. Its only effect was a
   * "fetch failed" line in every failure report, which reads as a network
   * problem at this end rather than a host that does not exist, and sent the
   * reader looking in the wrong place during an actual MAS outage.
   *
   * Both remaining endpoints are on eservices.mas.gov.sg, so they fail
   * together when MAS is down. That is honest: there is no second source for
   * SORA, and pretending otherwise with a dead URL was worse than admitting
   * it. If MAS publishes a real alternative, add it here.
   */
];

const isMaintenance = t => /maintenance\.mas\.gov\.sg|under\s+maintenance|scheduled\s+maintenance/i.test(t);

async function tryOne(ep, { quiet = false } = {}) {
  const res = await fetch(ep.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (isMaintenance(text)) return { ok: false, why: 'MAS is under maintenance', status: res.status };
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}`, body: text.slice(0, 200) };
  let json;
  try { json = JSON.parse(text); }
  catch { return { ok: false, why: 'not JSON', body: text.slice(0, 200) }; }
  const recs = json?.result?.records;
  if (!Array.isArray(recs) || !recs.length) {
    return { ok: false, why: 'no records', keys: Object.keys(json || {}).join(', ') };
  }
  if (!quiet) console.log(`  ✓ ${ep.label} — ${recs.length} records`);
  return { ok: true, records: recs };
}

function shape(recs) {
  const keys = Object.keys(recs[0]);
  const dateKey = keys.find(k => /end_of_day|^date$|period/i.test(k));
  const soraKey = keys.find(k => /^sora$/i.test(k)) || keys.find(k => /sora/i.test(k));
  if (!dateKey || !soraKey) {
    throw new Error(`Could not find a date and a SORA column.\n  Columns: ${keys.join(', ')}\n  Sample: ${JSON.stringify(recs[0]).slice(0, 300)}`);
  }
  const comp = {
    m1: keys.find(k => /1.?m.*compounded|compounded.*1.?m/i.test(k)),
    m3: keys.find(k => /3.?m.*compounded|compounded.*3.?m/i.test(k)),
    m6: keys.find(k => /6.?m.*compounded|compounded.*6.?m/i.test(k)),
  };
  const points = recs
    .map(r => ({
      date: String(r[dateKey]).slice(0, 10),
      sora: Number(r[soraKey]),
      m1: comp.m1 ? Number(r[comp.m1]) : null,
      m3: comp.m3 ? Number(r[comp.m3]) : null,
      m6: comp.m6 ? Number(r[comp.m6]) : null,
    }))
    .filter(p => Number.isFinite(p.sora))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) throw new Error(`Column "${soraKey}" held no numbers.`);
  return { points, columns: { dateKey, soraKey, ...comp } };
}

const STATS_URL = 'https://eservices.mas.gov.sg/statistics/dir/DomesticInterestRates.aspx';
const STATS_LABEL = 'MAS statistics · Domestic Interest Rates (daily, CSV download)';
/* The form's column checkboxes, by index, as labelled on the page on
   26 Sep 2026: 13 SORA, 15/16/17 the 1-, 3- and 6-month compounded SORA.
   parseMasCsv reads the CSV's own header, so a reordering on MAS's side
   fails loudly there rather than filing the wrong column. */
const STATS_COLUMNS = [13, 15, 16, 17];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * MAS's daily CSV, as the Download button returns it: one block per year,
 * each with the header repeated, and the year and month printed only on the
 * first row they change on — so both carry down, across blocks too. Returns points in the same shape as shape() below.
 */
export function parseMasCsv(text) {
  const lines = String(text).split(/\r?\n/);
  const h = lines.findIndex(l => /^SORA Value Date,/i.test(l));
  if (h < 0) throw new Error(`No "SORA Value Date" header in the download.\n  First lines: ${lines.slice(0, 8).join(' | ').slice(0, 300)}`);
  const head = lines[h].split(',').map(x => x.trim());
  const col = re => head.findIndex(x => re.test(x));
  const at = { sora: col(/^SORA$/i), m1: col(/1 month/i), m3: col(/3 month/i), m6: col(/6 month/i) };
  if (at.sora < 0) throw new Error(`No SORA column. Columns: ${head.join(', ')}`);
  const num = v => (v === undefined || String(v).trim() === '' ? null : Number(v));
  let year = null, month = null;
  const points = [];
  for (const line of lines.slice(h + 1)) {
    const c = line.split(',');
    /* Not a day row: a blank line, the header MAS repeats for every year,
       or the footnotes. The table runs one block per year, so a blank line
       is not the end of it — that stopped the first version at 31 Dec. */
    if (!/^\s*\d{1,2}\s*$/.test(c[2] || '')) continue;
    if (c[0].trim()) year = Number(c[0]);
    if (c[1].trim()) month = MONTHS[c[1].trim().slice(0, 3).toLowerCase()] || null;
    if (!year || !month) continue;
    const sora = num(c[at.sora]);
    if (!Number.isFinite(sora)) continue;
    points.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(Number(c[2])).padStart(2, '0')}`,
      sora,
      m1: at.m1 >= 0 ? num(c[at.m1]) : null,
      m3: at.m3 >= 0 ? num(c[at.m3]) : null,
      m6: at.m6 >= 0 ? num(c[at.m6]) : null,
    });
  }
  if (!points.length) throw new Error('The download had a header and no rows.');
  points.sort((a, b) => a.date.localeCompare(b.date));
  return { points, columns: { dateKey: head[0], soraKey: head[at.sora], m1: head[at.m1], m3: head[at.m3], m6: head[at.m6] } };
}

/** The statistics page's form, submitted the way its Download button does. */
async function fromStatistics(now = new Date()) {
  const page = await fetch(STATS_URL, { signal: AbortSignal.timeout(30000) });
  const html = await page.text();
  if (isMaintenance(html)) return { ok: false, why: 'MAS is under maintenance' };
  if (!page.ok) return { ok: false, why: `HTTP ${page.status}` };
  const hidden = n => (new RegExp(`name="${n}" id="${n}" value="([^"]*)"`).exec(html) || [])[1];
  if (!hidden('__VIEWSTATE')) return { ok: false, why: 'the form has changed — no __VIEWSTATE on the page' };
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1));
  const P = 'ctl00$ContentPlaceHolder1$';
  const form = new URLSearchParams({
    __VIEWSTATE: hidden('__VIEWSTATE'), __VIEWSTATEGENERATOR: hidden('__VIEWSTATEGENERATOR') || '',
    __EVENTVALIDATION: hidden('__EVENTVALIDATION') || '',
    [`${P}StartYearDropDownList`]: String(from.getUTCFullYear()), [`${P}StartMonthDropDownList`]: String(from.getUTCMonth() + 1),
    [`${P}EndYearDropDownList`]: String(now.getUTCFullYear()), [`${P}EndMonthDropDownList`]: String(now.getUTCMonth() + 1),
    [`${P}Button2`]: 'Download',
  });
  for (const i of STATS_COLUMNS) form.set(`${P}ColumnsCheckBoxList$${i}`, 'on');
  const cookie = (page.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  const res = await fetch(STATS_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: STATS_URL, ...(cookie ? { Cookie: cookie } : {}) } });
  const text = await res.text();
  if (isMaintenance(text)) return { ok: false, why: 'MAS is under maintenance' };
  if (!res.ok || !/csv/i.test(res.headers.get('content-type') || '')) {
    return { ok: false, why: `expected CSV, got HTTP ${res.status} ${res.headers.get('content-type')}`, body: text.slice(0, 200) };
  }
  try { return { ok: true, ...parseMasCsv(text) }; }
  catch (e) { return { ok: false, why: e.message, body: text.slice(0, 200) }; }
}

async function write({ points, columns, label, accessedAt }) {
  const last = points.at(-1);
  const yearAgo = points.find(p => p.date >= isoShift(last.date, -365));
  const out = {
    source: 'MAS — Domestic Interest Rates (SORA)',
    endpoint: label,
    accessedAt,
    latest: last,
    yoyPts: yearAgo ? last.sora - yearAgo.sora : null,
    columns,
    points: points.slice(-370),
  };
  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(out));
  console.log(`Wrote data/sora.json — ${points.length} days to ${last.date}, SORA ${last.sora}%`);
  console.log(`  via ${label}`);
  console.log(`  columns: date="${columns.dateKey}" sora="${columns.soraKey}" 1m=${columns.m1} 3m=${columns.m3} 6m=${columns.m6}`);
  return out;
}

export async function ingestSora() {
  const accessedAt = new Date().toISOString();
  const failures = [];

  let st;
  try { st = await fromStatistics(); } catch (e) { st = { ok: false, why: e.message }; }
  if (st.ok) return write({ points: st.points, columns: st.columns, label: STATS_LABEL, accessedAt });
  failures.push(`  · ${STATS_LABEL}\n      ${st.why}${st.body ? ' — ' + st.body.replace(/\s+/g, ' ').slice(0, 120) : ''}`);

  for (const ep of ENDPOINTS) {
    let r;
    try { r = await tryOne(ep); }
    catch (e) { r = { ok: false, why: e.message }; }
    if (!r.ok) { failures.push(`  · ${ep.label}\n      ${r.why}${r.body ? ' — ' + r.body.replace(/\s+/g,' ').slice(0,120) : ''}`); continue; }

    const { points, columns } = shape(r.records);
    return write({ points, columns, label: ep.label, accessedAt });
  }

  // Everything failed. Keep whatever is already on disk.
  let kept = null;
  try {
    kept = JSON.parse(await fs.readFile(OUT, 'utf8'));
  } catch { /* nothing there yet */ }

  const maint = failures.some(f => /maintenance/i.test(f));
  const msg = [
    maint
      ? 'MAS is under maintenance — this is a MAS outage, not a problem with this repo.'
      : 'Every MAS endpoint failed.',
    '',
    'Tried:',
    ...failures,
    '',
    kept
      ? `Existing data/sora.json LEFT IN PLACE (last good: ${kept.latest?.date}, fetched ${kept.accessedAt?.slice(0,10)}). The site will keep showing it, marked stale past 7 days.`
      : 'No data/sora.json on disk, so the market page will simply omit the rates block. Nothing is broken.',
    '',
    maint ? 'Just re-run in a few hours: npm run ingest:sora' : 'Run with --probe for raw diagnostics.',
  ].join('\n');

  const err = new Error(msg);
  err.soft = Boolean(kept) || maint;
  throw err;
}

async function probe() {
  console.log('Probing MAS endpoints…\n');
  console.log(`— ${STATS_LABEL}\n  ${STATS_URL}`);
  try {
    const r = await fromStatistics();
    console.log(r.ok ? `  CSV · ${r.points.length} days to ${r.points.at(-1).date}, SORA ${r.points.at(-1).sora}%\n`
      : `  failed: ${r.why}${r.body ? ' — ' + r.body.replace(/\s+/g, ' ').slice(0, 160) : ''}\n`);
  } catch (e) { console.log(`  threw: ${e.message}\n`); }
  for (const ep of ENDPOINTS) {
    console.log(`— ${ep.label}\n  ${ep.url}`);
    try {
      const res = await fetch(ep.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      console.log(`  HTTP ${res.status} · ${text.length} bytes · ${isMaintenance(text) ? 'MAINTENANCE PAGE' : text.trimStart().startsWith('{') ? 'JSON' : 'HTML/other'}`);
      console.log(`  first 200: ${text.replace(/\s+/g,' ').slice(0,200)}\n`);
    } catch (e) { console.log(`  threw: ${e.message}\n`); }
  }
}

const isoShift = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--probe')) probe();
  else ingestSora().catch(e => {
    console.error(`\n${e.soft ? 'SORA NOT UPDATED' : 'SORA INGEST FAILED'}:\n${e.message}`);
    process.exit(e.soft ? 0 : 1);   // a MAS outage must not break `npm run data:all`
  });
}
