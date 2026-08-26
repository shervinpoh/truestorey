/**
 * Build the policy and data archive.
 *
 *   npm run ingest:archive
 *   npm run ingest:archive -- --probe    can we reach URA today?
 *
 * Two sources, merged and de-duplicated:
 *
 *  1. data/archive/manual.json — hand-added entries. The honest route for
 *     anything a person had to read first.
 *  2. The datasets already on disk. Every index quarter, every MOP refresh
 *     and every transaction period is itself a dated, sourced, primary fact
 *     that nobody has to type.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: fetch and summarise news articles.
 * Compressing an outlet's reporting into entries here would reproduce their
 * journalism on a commercial site and break the rule the publication is built
 * on. Government announcements are facts; a journalist's write-up of them is
 * their work. See data/archive/README.md.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'data', 'archive.json');
const probe = process.argv.includes('--probe');

const read = async (f, fb = null) => {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, 'data', f), 'utf8')); }
  catch { return fb; }
};

/** Quarter label → the date the release actually lands (about four weeks after quarter end). */
function quarterReleaseDate(q) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(q));
  if (!m) return null;
  const y = Number(m[1]), k = Number(m[2]);
  const endMonth = k * 3;                       // Q1 ends March
  const d = new Date(Date.UTC(y, endMonth, 1)); // first of the following month
  return d.toISOString().slice(0, 10);
}

async function derived() {
  const out = [];

  const idx = await read('hdb-index.json');
  if (idx?.points?.length) {
    // One entry per quarter for the last three years. Older history is real
    // but it is not news, and an archive that opens on 1990 is a database.
    const recent = idx.points.slice(-12);
    for (let i = 0; i < recent.length; i++) {
      const p = recent[i], prev = recent[i - 1];
      const v = p.index ?? p.value;
      const pv = prev ? (prev.index ?? prev.value) : null;
      const move = pv ? ((v - pv) / pv) * 100 : null;
      out.push({
        date: quarterReleaseDate(p.quarter),
        title: `HDB Resale Price Index, ${p.quarter} — ${v}`,
        summary: move == null ? '' :
          `${move >= 0 ? 'Up' : 'Down'} ${Math.abs(move).toFixed(1)}% on the quarter.`,
        tag: 'index', source: 'data.gov.sg',
        url: 'https://data.gov.sg/datasets?query=resale+price+index',
      });
    }
  }

  const m = await read('mop.json');
  if (m?.generatedForYear) {
    const total = Object.values(m.towns || {})
      .flatMap(t => Object.values(t.byYear || {}))
      .filter(y => y.year >= m.generatedForYear)
      .reduce((a, y) => a + (y.units || 0), 0);
    out.push({
      date: (m.accessedAt || '').slice(0, 10) || null,
      title: `HDB Property Information refreshed — ${total.toLocaleString('en-SG')} units reach year five from ${m.generatedForYear}`,
      summary: 'Earliest-possible MOP year by block, from year of completion. Not an asserted MOP date.',
      tag: 'hdb', source: 'data.gov.sg',
      url: 'https://data.gov.sg/datasets?query=hdb+property+information',
    });
  }

  const i = await read('index.json');
  if (i?.hdb?.period?.to) {
    out.push({
      date: (i.hdb.accessedAt || '').slice(0, 10) || null,
      title: `Filed transactions refreshed — HDB through ${i.hdb.period.to}`,
      summary: i.private?.period?.to ? `Private through ${i.private.period.to}.` : '',
      tag: 'data', source: 'data.gov.sg + URA',
      url: 'https://data.gov.sg/datasets?query=resale+flat+prices',
    });
  }

  const sora = await read('sora.json');
  if (sora?.latest) {
    out.push({
      date: sora.latest.date,
      title: `SORA ${sora.latest.sora}%`,
      summary: sora.yoyPts != null ? `${sora.yoyPts >= 0 ? '+' : ''}${sora.yoyPts.toFixed(2)}pt on the year.` : '',
      tag: 'rates', source: 'MAS',
      url: 'https://www.mas.gov.sg/statistics/interest-rates',
    });
  }

  return out.filter(e => e.date);
}

/** Diagnostic only. Nothing here is written to the archive automatically. */
async function probeUra() {
  const url = 'https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases';
  console.log(`Probing ${url}\n`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'truestorey/0.1 (+personal research)', Accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    console.log(`HTTP ${res.status} · ${text.length} bytes`);
    const dates = [...text.matchAll(/(\d{1,2}\s+\w+\s+20\d\d)/g)].slice(0, 8).map(m => m[1]);
    console.log(dates.length ? `Dates visible in the HTML: ${dates.join(' · ')}` : 'No dates found in the raw HTML — the listing is probably rendered client-side.');
    console.log('\nIf dates appear above, a parser is worth writing. If not, keep using manual.json —');
    console.log('a hand-added entry you have read is better than a scraper that silently breaks.');
  } catch (e) { console.log(`failed: ${e.message}`); }
}

async function main() {
  const manual = (await read('archive/manual.json', [])) || [];
  const auto = await derived();

  const seen = new Set();
  const all = [...manual, ...auto]
    .filter(e => e?.date && e?.title)
    .filter(e => { const k = e.date + '|' + e.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.date.localeCompare(a.date));

  const tags = {};
  for (const e of all) tags[e.tag || 'other'] = (tags[e.tag || 'other'] || 0) + 1;

  await fs.writeFile(OUT, JSON.stringify({
    builtAt: new Date().toISOString(),
    counts: { total: all.length, manual: manual.length, derived: auto.length },
    tags, entries: all,
  }));

  console.log(`data/archive.json — ${all.length} entries (${manual.length} hand-added, ${auto.length} derived)`);
  for (const [t, n] of Object.entries(tags).sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(8)} ${n}`);
  console.log('\nAdd anything you have read yourself to data/archive/manual.json.');
}

(probe ? probeUra() : main()).catch(e => { console.error(`ARCHIVE FAILED: ${e.message}`); process.exit(1); });
