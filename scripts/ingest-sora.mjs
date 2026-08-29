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

export async function ingestSora() {
  const accessedAt = new Date().toISOString();
  const failures = [];

  for (const ep of ENDPOINTS) {
    let r;
    try { r = await tryOne(ep); }
    catch (e) { r = { ok: false, why: e.message }; }
    if (!r.ok) { failures.push(`  · ${ep.label}\n      ${r.why}${r.body ? ' — ' + r.body.replace(/\s+/g,' ').slice(0,120) : ''}`); continue; }

    const { points, columns } = shape(r.records);
    const last = points.at(-1);
    const yearAgo = points.find(p => p.date >= isoShift(last.date, -365));
    const out = {
      source: 'MAS — Domestic Interest Rates (SORA)',
      endpoint: ep.label,
      accessedAt,
      latest: last,
      yoyPts: yearAgo ? last.sora - yearAgo.sora : null,
      columns,
      points: points.slice(-370),
    };
    await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
    await fs.writeFile(OUT, JSON.stringify(out));
    console.log(`Wrote data/sora.json — ${points.length} days to ${last.date}, SORA ${last.sora}%`);
    console.log(`  columns: date="${columns.dateKey}" sora="${columns.soraKey}" 1m=${columns.m1} 3m=${columns.m3} 6m=${columns.m6}`);
    return out;
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
