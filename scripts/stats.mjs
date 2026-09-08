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
import { NAV } from '../lib/nav.js';

/** Tool routes, from the nav, so this list cannot drift from the site. */
const TOOLS = NAV.find(g => /tool/i.test(g.group)).items
  .map(i => i.href.replace('/', '')).filter(t => t && t !== 'tools');
import { recentEvents, configured } from '../lib/supabase/rest.js';

const arg = process.argv[2];
const DAYS = arg === 'all' ? Infinity : (Number(arg) || 30);

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const num = n => Number(n).toLocaleString('en-SG');

/**
 * Read from wherever /api/track wrote.
 *
 * The two sinks are not interchangeable and the report has to say which one it
 * read, or a deployed site with a stale local file reads as if it had no
 * traffic — silence that looks like data. Same rule as everywhere else here:
 * say what could not be measured rather than printing an empty table.
 */
async function load() {
  if (configured()) {
    const { rows, error } = await recentEvents({ limit: 20000 });
    if (error) return { events: null, from: 'Supabase', error };
    return { events: rows, from: 'Supabase', error: null };
  }
  try {
    const raw = await fs.readFile(new URL('../data/events.jsonl', import.meta.url), 'utf8');
    const events = raw.split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    return { events, from: 'data/events.jsonl', error: null };
  } catch {
    return { events: [], from: 'data/events.jsonl', error: null };
  }
}

async function main() {
  const { events: all, from, error } = await load();

  if (error) {
    console.log(`\nCould not read events from ${from}: ${error}\n`);
    console.log('This is not the same as no traffic. Nothing is being reported here.\n');
    return;
  }
  if (!all.length) {
    console.log(`\nNo events in ${from} yet.\n`);
    console.log('Run the site, click around, then try again. Nothing is recorded until');
    console.log('someone actually visits — including you.\n');
    return;
  }

  const cutoff = DAYS === Infinity ? '' : new Date(Date.now() - DAYS * 86400000).toISOString();
  // Supabase returns newest first; the file is oldest first. Sort so the span
  // line below reads correctly whichever sink this came from.
  const events = all.filter(e => e && e.t >= cutoff).sort((a, b) => (a.t < b.t ? -1 : 1));

  if (!events.length) {
    console.log(`\nNo events in the last ${DAYS} days.\n`);
    return;
  }

  const sessions = new Set(events.map(e => e.s));
  const span = [events[0].t.slice(0, 10), events.at(-1).t.slice(0, 10)];

  console.log(`\n${'='.repeat(58)}`);
  console.log(`  ${num(events.length)} events · ${num(sessions.size)} sessions · ${span[0]} to ${span[1]}`);
  console.log(`  read from ${from}`);
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

  /* ---- which tools are actually used ---- */
  const runs = events.filter(e => e.e === EVENTS.TOOL_RUN);
  const seenTools = new Set(views.map(e => String(e.p || '').split('/')[1]).filter(Boolean));
  if (runs.length) {
    console.log('\n\nTOOLS ACTUALLY USED  (one per tool per visit, not per click)\n');
    for (const [t, n] of tally(runs, 'tool')) console.log(`  ${rpad(num(n), 6)}  ${t}`);

    /* The line that answers the question this was added for. A tool with
     * visits and no runs is one people open and walk away from, and NEXT.md
     * says that is what must be measured before any specialist tool is judged
     * by taste. Named here rather than left to be noticed in the list above. */
    const ran = new Set(runs.map(e => e.tool));
    const opened = [...seenTools].filter(t => TOOLS.includes(t));
    const cold = opened.filter(t => !ran.has(t));
    if (cold.length) {
      console.log('\n  Opened but never used: ' + cold.join(', '));
      console.log('  That is a page people land on and leave. Before cutting one, check');
      console.log('  whether it is the tool or the way in that is failing.');
    }
  } else if (seenTools.size) {
    console.log('\n\nTOOLS ACTUALLY USED\n\n  No runs recorded yet. Either nobody has used one');
    console.log('  since tracking was added, or a page is missing its <ToolUse id>.');
  }

  /* ---- did the guided paths get taken ---- */
  const sits = events.filter(e => e.e === EVENTS.SITUATION);
  if (sits.length || runs.length) {
    const idx = views.filter(e => e.p === '/tools').length;
    console.log('\n\nHOW PEOPLE REACHED THE TOOLS\n');
    for (const [id, n] of tally(sits, 'id')) console.log(`  ${rpad(num(n), 6)}  situation: ${id}`);
    console.log(`  ${rpad(num(idx), 6)}  the full index at /tools`);
    console.log('\n  The navigation rebuild rests on people preferring a situation to a');
    console.log('  tool. If the index still wins by a distance, it did not.');
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

  /* ---- how fast it was for the people who were actually here ---- */
  const vit = events.filter(e => e.e === EVENTS.VITALS);
  if (vit.length) {
    console.log('\n\nCORE WEB VITALS, AT THE 75TH PERCENTILE\n');
    /* p75 because that is where the thresholds are DEFINED. A median hides the
       quarter of visits having the worst time, and those are the ones on a
       phone on mobile data — which is most of this audience. */
    const p75 = xs => {
      const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
      return a.length ? a[Math.min(a.length - 1, Math.ceil(a.length * 0.75) - 1)] : null;
    };
    const rows = [
      ['LCP', 'lcp', 2500, 4000, v => `${(v / 1000).toFixed(2)}s`],
      ['INP', 'inp', 200, 500, v => `${Math.round(v)}ms`],
      ['CLS', 'cls', 0.1, 0.25, v => v.toFixed(3)],
    ];
    const band = (v, good, poor) => (v <= good ? 'good' : v <= poor ? 'needs work' : 'POOR');

    for (const [label, key, good, poor, fmt] of rows) {
      const all = vit.map(e => e[key]).filter(v => v != null);
      if (!all.length) { console.log(`  ${rpad(label, 5)} no readings yet`); continue; }
      const v = p75(all);
      console.log(`  ${rpad(label, 5)} ${rpad(fmt(v), 9)} ${rpad(band(v, good, poor), 11)} ` +
                  `target ${fmt(good)}   (${num(all.length)} readings)`);
    }

    /* Split by device, because a desktop median can hide a phone problem
       entirely and the phone is where this audience is. */
    for (const [code, name] of [['m', 'phone'], ['t', 'tablet'], ['d', 'desktop']]) {
      const sub = vit.filter(e => e.d === code);
      if (sub.length < 5) continue;
      const l = p75(sub.map(e => e.lcp).filter(v => v != null));
      const c = p75(sub.map(e => e.cls).filter(v => v != null));
      console.log(`    ${rpad(name, 8)} LCP ${rpad(l == null ? '—' : (l / 1000).toFixed(2) + 's', 8)}` +
                  `CLS ${c == null ? '—' : c.toFixed(3)}   (${num(sub.length)} visits)`);
    }

    const worst = [...tally(vit.filter(e => e.lcp > 2500), 'p')].slice(0, 5);
    if (worst.length) {
      console.log('\n  Slowest pages, by how often they came back over 2.5s:');
      for (const [path, n] of worst) console.log(`    ${rpad(num(n), 4)}  ${path}`);
    }
    console.log('\n  Measured from real visits, not a lab run. A reading arrives when a tab');
    console.log('  is hidden or closed, because none of the three is final before then.');
  } else {
    console.log('\n\nCORE WEB VITALS\n');
    console.log('  No readings yet. They arrive as people close tabs, so give it a day of');
    console.log('  real traffic. This is not the same as good performance.');
  }

  console.log('\n');
}

main().catch(e => { console.error('STATS FAILED:', e.message); process.exit(1); });
