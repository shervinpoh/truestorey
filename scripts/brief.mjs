/**
 * The daily brief. What changed since last time, and what is worth writing about.
 *
 * This is a WRITING PROMPT, not a publishing pipeline. It never drafts prose and
 * never touches content/insights — it tells Shervin what moved and leaves the
 * take to him, which is the whole editorial premise of the site.
 *
 * Policy watch lives in scripts/brief-news.js — read the note at the top of that
 * file for why there is no RSS. Anything that IS fetched is read for headline,
 * date and link only; the body is never fetched, stored or reproduced.
 *
 * Usage:
 *   npm run brief              compare against the last run, then save the new state
 *   npm run brief -- --dry     report without saving, so you can re-run it
 *   npm run brief -- --reset   ignore previous state and rebuild the baseline
 *
 * State lives in data/.brief-state.json.
 */
import fs from 'node:fs/promises';

const DRY = process.argv.includes('--dry');
const RESET = process.argv.includes('--reset');
import { FEEDS, policyWatch } from './brief-news.js';
import { RATES_REVIEWED } from '../lib/calc/constants.js';

const url = n => new URL(`../data/${n}`, import.meta.url);
const readJson = async n => { try { return JSON.parse(await fs.readFile(url(n), 'utf8')); } catch { return null; } };

const strip = s => String(s).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();

/** Minimal RSS/Atom item extraction. Feeds move and break; a dead feed is reported, not fatal. */
function parseFeed(xml, limit = 8) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks.slice(0, limit)) {
    const title = strip((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    let link = strip((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
    if (!link) link = ((b.match(/<link[^>]*href=["']([^"']+)/i) || [])[1] || '').trim();
    const date = strip((b.match(/<(pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || '');
    if (title) items.push({ title, link, date: normDate(date) });
  }
  return items;
}

const normDate = d => {
  if (!d) return '';
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

async function fetchFeeds() {
  if (!FEEDS.length) return [];
  const out = [];
  await Promise.all(FEEDS.map(async f => {
    try {
      const res = await fetch(f.url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'TrueStorey/1.0' } });
      if (!res.ok) return out.push({ ...f, error: `HTTP ${res.status}` });
      const items = parseFeed(await res.text());
      if (!items.length) return out.push({ ...f, error: 'no items parsed — feed format may have changed' });
      out.push({ ...f, items });
    } catch (e) { out.push({ ...f, error: e.name === 'TimeoutError' ? 'timed out' : e.message }); }
  }));
  return out.sort((a, b) => FEEDS.findIndex(x => x.name === a.name) - FEEDS.findIndex(x => x.name === b.name));
}

/* ------------------------------------------------------------------ signals */

function indexSignal(idx, prev) {
  if (!idx) return null;
  const now = idx.latest;
  if (prev?.quarter === now.quarter) return null;
  const dir = idx.qoq == null ? '' : Math.abs(idx.qoq) < 0.05 ? 'flat' : idx.qoq > 0 ? `up ${idx.qoq.toFixed(1)}%` : `down ${Math.abs(idx.qoq).toFixed(1)}%`;
  return {
    kind: 'NEW QUARTER',
    line: `HDB resale price index ${now.quarter}: ${now.index.toFixed(1)} — ${dir} on the quarter, ${fmtPct(idx.yoy)} year on year.`,
    angle: prev
      ? `Previous quarter was ${prev.index.toFixed(1)}. A fresh quarter is the one reliable news peg you get every three months.`
      : 'First run — baseline recorded.',
    write: 'What the quarter actually did, against what the headlines said it did.',
  };
}

function soraSignal(s, prev) {
  if (!s) return null;
  const now = s.latest;
  if (!prev) return { kind: 'RATES', line: `SORA ${now.sora.toFixed(2)}% as at ${now.date}.`, angle: 'Baseline recorded.', write: null };
  const move = now.sora - prev.sora;
  if (Math.abs(move) < 0.10) return null;
  return {
    kind: 'RATES',
    line: `SORA moved ${move > 0 ? 'up' : 'down'} ${Math.abs(move).toFixed(2)} pts to ${now.sora.toFixed(2)}% since ${prev.date}.`,
    angle: 'A 0.10pt move is roughly S$25–30 a month on a S$500k loan over 25 years. Worth a post when it moves this much.',
    write: 'What this does to the monthly payment on a typical upgrade, in dollars.',
  };
}

function mopSignal(m, prev) {
  if (!m) return null;
  const out = [];
  if (!prev) {
    out.push({ kind: 'MOP', line: `${num(m.totals.upcomingUnits)} units across ${num(m.totals.upcomingBlocks)} blocks reach year five ${m.generatedForYear}–${m.generatedForYear + 4}.`, angle: 'Baseline recorded.', write: null });
  } else {
    const d = m.totals.upcomingUnits - prev.upcomingUnits;
    if (Math.abs(d) >= 200) {
      out.push({
        kind: 'MOP', line: `Upcoming MOP supply changed by ${d > 0 ? '+' : ''}${num(d)} units since last run (now ${num(m.totals.upcomingUnits)}).`,
        angle: 'Either new blocks completed, or a year rolled out of the window.',
        write: 'Which town absorbed the change, and whether it lands on your reader.',
      });
    }
  }
  // Towns with a lot of eligible supply and nothing filed — the standout story.
  const silent = Object.values(m.towns).map(t => {
    const elig = Object.values(t.byYear).filter(y => y.year <= m.generatedForYear);
    const units = elig.reduce((a, y) => a + y.units, 0);
    const withResale = elig.reduce((a, y) => a + y.withResale, 0);
    const blocks = elig.reduce((a, y) => a + y.blocks, 0);
    return { town: t.town, units, blocks, withResale };
  }).filter(t => t.blocks >= 5 && t.withResale === 0 && t.units > 0)
    .sort((a, b) => b.units - a.units).slice(0, 3);
  for (const t of silent) {
    out.push({
      kind: 'SILENT SUPPLY',
      line: `${t.town}: ${num(t.units)} units across ${t.blocks} blocks past their fifth year, and not one filed resale.`,
      angle: 'Eligible but untraded — these blocks CAN be sold and have not been. Not to be confused with a new estate where nothing has reached MOP yet; those are filtered out.',
      write: `Whether ${t.town} owners are holding out on price or genuinely have nowhere to move to.`,
    });
  }
  return out;
}

function transactionSignals(index, prev) {
  if (!index?.hdb?.towns) return [];
  const out = [];
  const prevPsf = prev?.townPsf || {};
  const moves = [];
  for (const [town, t] of Object.entries(index.hdb.towns)) {
    const was = prevPsf[town];
    if (was && t.medianPsf) {
      const pct = ((t.medianPsf - was) / was) * 100;
      if (Math.abs(pct) >= 2) moves.push({ town, from: was, to: t.medianPsf, pct });
    }
  }
  moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  for (const m of moves.slice(0, 3)) {
    out.push({
      kind: 'TOWN MOVE',
      line: `${m.town} median psf ${m.pct > 0 ? 'up' : 'down'} ${Math.abs(m.pct).toFixed(1)}% — $${m.from} → $${m.to}.`,
      angle: 'A town-level move of this size usually comes from a handful of blocks, not the whole town. Worth finding which.',
      write: `Which blocks actually moved ${m.town}, and whether it is a mix shift or a real price change.`,
    });
  }
  return out;
}

const num = n => Number(n).toLocaleString('en-SG');
const fmtPct = v => v == null ? 'n/a' : Math.abs(v) < 0.05 ? 'flat' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

/* -------------------------------------------------------------------- main */

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const [idx, s, m, index] = await Promise.all([
    readJson('hdb-index.json'), readJson('sora.json'), readJson('mop.json'), readJson('index.json'),
  ]);
  const prev = RESET ? null : await readJson('.brief-state.json');
  if (RESET) console.log('--reset: ignoring previous state, rebuilding the baseline.\n');

  const signals = [
    indexSignal(idx, prev?.index),
    soraSignal(s, prev?.sora),
    ...(mopSignal(m, prev?.mop) || []),
    ...transactionSignals(index, prev),
  ].filter(Boolean);

  const feeds = await fetchFeeds();
  const seen = new Set(prev?.seenLinks || []);
  const freshNews = [];
  for (const f of feeds) {
    for (const it of f.items || []) {
      const key = it.link || `${f.name}:${it.title}`;
      if (!seen.has(key)) freshNews.push({ source: f.name, ...it, key });
    }
  }

  /* ---- report ---- */
  const L = [];
  L.push(`# Brief — ${today}`, '');
  if (!prev) L.push('_First run. Everything below is a baseline; from tomorrow this shows only what changed._', '');

  L.push('## What moved', '');
  if (!signals.length) L.push('Nothing material since the last run.', '');
  for (const sig of signals) {
    L.push(`**${sig.kind}** — ${sig.line}`);
    if (sig.angle) L.push(`> ${sig.angle}`);
    if (sig.write) L.push(`- Angle: ${sig.write}`);
    L.push('');
  }

  if (freshNews.length) {
    L.push('## New from the feeds', '');
    for (const n of freshNews.slice(0, 15)) {
      L.push(`- **${n.source}**${n.date ? ` · ${n.date}` : ''} — ${n.title}`);
      if (n.link) L.push(`  ${n.link}`);
    }
    L.push('', '_Headlines and links only. Read the source, then write your own take — never reproduce it._', '');
  }
  const broken = feeds.filter(f => f.error);
  if (broken.length) {
    L.push('### Feeds that did not answer', '');
    for (const f of broken) L.push(`- ${f.name}: ${f.error}`);
    L.push('', '_Fix or remove it in scripts/brief-news.js._', '');
  }

  L.push(...policyWatch(RATES_REVIEWED));

  const report = L.join('\n');
  console.log('\n' + report);

  await fs.writeFile(url('brief-latest.md'), report);
  console.log(`\n(saved to data/brief-latest.md)`);

  if (DRY) { console.log('--dry: state not saved, re-run to see this again.'); return; }

  const townPsf = {};
  for (const [t, v] of Object.entries(index?.hdb?.towns || {})) townPsf[t] = v.medianPsf;
  await fs.writeFile(url('.brief-state.json'), JSON.stringify({
    ranAt: new Date().toISOString(),
    index: idx?.latest || null,
    sora: s?.latest || null,
    mop: m ? { upcomingUnits: m.totals.upcomingUnits, upcomingBlocks: m.totals.upcomingBlocks } : null,
    townPsf,
    seenLinks: [...seen, ...freshNews.map(n => n.key)].slice(-400),
  }));
}

main().catch(e => { console.error('BRIEF FAILED:', e.message); process.exit(1); });
