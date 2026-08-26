/**
 * Read the funnel back.
 *
 *   npm run stats            last 30 days
 *   npm run stats -- 7       last 7 days
 *   npm run stats -- all     everything
 *
 * The most useful section is FAILED SEARCHES. Every line there is someone who
 * came looking for something and left without it — a content gap, a naming
 * mismatch, or a genuine hole in the data. Nobody else can give him that list.
 */
import fs from 'node:fs/promises';
import { FUNNEL, EVENTS } from '../lib/analytics.js';

const arg = process.argv[2];
const DAYS = arg === 'all' ? Infinity : (Number(arg) || 30);

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const num = n => Number(n).toLocaleString('en-SG');

async function main() {
  let raw;
  try {
    raw = await fs.readFile(new URL('../data/events.jsonl', import.meta.url), 'utf8');
  } catch {
    console.log('\nNo data/events.jsonl yet.\n');
    console.log('Run the site, click around, then try again. Nothing is recorded until');
    console.log('someone actually visits — including you.\n');
    return;
  }

  const cutoff = DAYS === Infinity ? '' : new Date(Date.now() - DAYS * 86400000).toISOString();
  const events = raw.split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(e => e && e.t >= cutoff);

  if (!events.length) {
    console.log(`\nNo events in the last ${DAYS} days.\n`);
    return;
  }

  const sessions = new Set(events.map(e => e.s));
  const span = [events[0].t.slice(0, 10), events.at(-1).t.slice(0, 10)];

  console.log(`\n${'='.repeat(58)}`);
  console.log(`  ${num(events.length)} events · ${num(sessions.size)} sessions · ${span[0]} to ${span[1]}`);
  console.log(`${'='.repeat(58)}\n`);

  /* ---- funnel, by session ---- */
  const did = {};
  for (const step of FUNNEL) did[step.key] = new Set();
  for (const e of events) if (did[e.e]) did[e.e].add(e.s);

  console.log('FUNNEL  (sessions reaching each step)\n');
  const top = did[FUNNEL[0].key].size || 1;
  let prev = null;
  for (const step of FUNNEL) {
    const n = did[step.key].size;
    const pctTop = ((n / top) * 100).toFixed(0);
    const drop = prev == null || prev === 0 ? '' : `  −${(100 - (n / prev) * 100).toFixed(0)}% from previous`;
    const bar = '█'.repeat(Math.round((n / top) * 24)).padEnd(24, '·');
    console.log(`  ${pad(step.label, 30)} ${bar} ${rpad(num(n), 6)}  ${rpad(pctTop + '%', 4)}${drop}`);
    prev = n;
  }

  /* ---- pages ---- */
  const tally = (list, key) => {
    const m = new Map();
    for (const e of list) { const k = e[key]; if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const views = events.filter(e => e.e === EVENTS.VIEW);
  console.log('\n\nTOP PAGES\n');
  for (const [p, n] of tally(views, 'p').slice(0, 12)) console.log(`  ${rpad(num(n), 6)}  ${p}`);

  /* ---- device + referrer ---- */
  const dev = tally(views, 'd');
  if (dev.length) {
    const label = { m: 'mobile', t: 'tablet', d: 'desktop', '?': 'unknown' };
    console.log('\n\nDEVICE\n');
    for (const [d, n] of dev) console.log(`  ${rpad(num(n), 6)}  ${label[d] || d}  ${((n / views.length) * 100).toFixed(0)}%`);
  }
  const refs = tally(views.filter(e => e.r), 'r');
  if (refs.length) {
    console.log('\n\nCAME FROM\n');
    for (const [r, n] of refs.slice(0, 8)) console.log(`  ${rpad(num(n), 6)}  ${r}`);
  }

  /* ---- searches ---- */
  const searches = events.filter(e => e.e === EVENTS.SEARCH);
  const empty = events.filter(e => e.e === EVENTS.SEARCH_EMPTY);
  const picks = events.filter(e => e.e === EVENTS.SEARCH_PICK);

  if (searches.length) {
    console.log('\n\nTOP SEARCHES\n');
    for (const [q, n] of tally(searches, 'q').slice(0, 15)) console.log(`  ${rpad(num(n), 6)}  ${q}`);
  }

  if (empty.length) {
    console.log('\n\n' + '!'.repeat(58));
    console.log('FAILED SEARCHES — someone looked and found nothing');
    console.log('!'.repeat(58) + '\n');
    for (const [q, n] of tally(empty, 'q').slice(0, 20)) console.log(`  ${rpad(num(n), 6)}  ${q}`);
    console.log('\n  Each of these is a content gap, a naming mismatch, or a real hole');
    console.log('  in the data. Work down the list.\n');
  }

  if (picks.length) {
    console.log('\n\nMOST OPENED FROM SEARCH\n');
    for (const [h, n] of tally(picks, 'href').slice(0, 12)) console.log(`  ${rpad(num(n), 6)}  ${h}`);
  }

  /* ---- leads ---- */
  const starts = new Set(events.filter(e => e.e === EVENTS.LEAD_START).map(e => e.s));
  const subs = events.filter(e => e.e === EVENTS.LEAD_SUBMIT);
  if (starts.size || subs.length) {
    console.log('\n\nLEAD FORM\n');
    console.log(`  ${rpad(num(starts.size), 6)}  started`);
    console.log(`  ${rpad(num(subs.length), 6)}  submitted${starts.size ? `  (${((subs.length / starts.size) * 100).toFixed(0)}% completion)` : ''}`);
    const withConsent = subs.filter(e => e.consent).length;
    if (subs.length) console.log(`  ${rpad(num(withConsent), 6)}  opted in to contact  (${((withConsent / subs.length) * 100).toFixed(0)}%)`);
    if (subs.length) {
      console.log('\n  Submitted from:');
      for (const [h, n] of tally(subs, 'href').slice(0, 8)) console.log(`    ${rpad(num(n), 4)}  ${h || '(no record context)'}`);
    }
  }

  console.log('\n');
}

main().catch(e => { console.error('STATS FAILED:', e.message); process.exit(1); });
