/**
 * What the consult tools are running on, and how old it is.
 *
 * Every tool in lib/consult reads a file somebody had to build. A farming list
 * off a scan built before the last data refresh, or an error table measured
 * against weights that have since been tuned, returns confident output about a
 * market or a method that no longer exists — and none of those failures is
 * visible from inside the tool that reads the file. So they are gathered in one
 * place with their dates beside them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { VERSION } from './avm.js';
import { staleFor } from './error.js';

const DAY = 86_400_000;

/* The HDB files are 20MB and more. Parsed once per change on disk, not once
   per page load. */
const cache = new Map();
function readJson(p) {
  if (!fs.existsSync(p)) return null;
  const m = fs.statSync(p).mtimeMs;
  const hit = cache.get(p);
  if (hit && hit.m === m) return hit.v;
  let v = null;
  try { v = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { v = null; }
  cache.set(p, { m, v });
  return v;
}

export function dataStatus({ root = process.cwd(), now = new Date() } = {}) {
  const f = n => path.join(root, 'data', n);
  const age = iso => (iso ? Math.floor((now - new Date(iso)) / DAY) : null);
  const mtime = n => (fs.existsSync(f(n)) ? new Date(fs.statSync(f(n)).mtimeMs).toISOString() : null);
  const items = [];

  const hdb = readJson(f('hdb.json'));
  items.push({
    key: 'hdb', title: 'HDB resale transactions', present: !!hdb, asOf: hdb?.accessedAt || null,
    ageDays: age(hdb?.accessedAt), detail: hdb ? `${hdb.count.toLocaleString()} sales, ${hdb.monthsBack} months` : 'Missing.',
    /* HDB registers by month with a lag; past five weeks a whole month of
       filings is missing from every estimate. */
    stale: age(hdb?.accessedAt) > 35, refresh: 'npm run sync',
  });

  const scanAt = readJson(f('.scan.json'))?.builtAt || null;
  const compsAt = mtime('comps.json');
  const scanBehind = scanAt && compsAt && new Date(scanAt) < new Date(compsAt);
  items.push({
    key: 'scan', title: 'Island scan', present: !!scanAt, asOf: scanAt, ageDays: age(scanAt),
    detail: scanAt ? (scanBehind ? 'Built before the comparables it ranks were last refreshed.' : 'Built after the last comparables refresh.') : 'Never run.',
    /* The real test is not age: a scan built before comps.json was rebuilt is
       ranking blocks against a market that has since moved. */
    stale: !scanAt || scanBehind, refresh: 'npm run scan',
  });

  const err = readJson(f('avm-error.json'));
  const drift = staleFor(VERSION);
  items.push({
    key: 'error', title: 'AVM error table', present: !!err, asOf: err?.builtAt || null, ageDays: age(err?.builtAt),
    detail: err ? (drift ? `Measured estimator ${drift.was}; running ${drift.now}. Its error figures describe a method that no longer runs.` : `Matches the running estimator (${VERSION}).`) : 'Never built — every estimate reports its error as unmeasured.',
    stale: !err || !!drift, refresh: 'npm run build:avm-error',
  });

  const histAt = mtime('.hdb-history.json');
  items.push({
    key: 'history', title: 'HDB history since 2017', present: !!histAt, asOf: histAt, ageDays: age(histAt),
    detail: histAt ? 'Used by the rolling backtest only.' : 'Not downloaded — the rolling backtest cannot run.',
    stale: age(histAt) > 90, refresh: 'npm run ingest:hdb:history',
  });

  const pipe = readJson(f('pipeline.json'));
  items.push({
    key: 'pipeline', title: 'URA development pipeline', present: !!pipe, asOf: pipe?.accessedAt || null, ageDays: age(pipe?.accessedAt),
    detail: pipe ? `${pipe.projects} projects, ${pipe.totalUnits.toLocaleString()} units — ${Math.round(100 * pipe.datedUnits / pipe.totalUnits)}% dated` : 'Not ingested.',
    stale: age(pipe?.accessedAt) > 100, refresh: 'npm run ingest:pipeline',
  });

  const L = readJson(f('.listings.json'));
  const active = L ? Object.values(L.listings).filter(x => x.status === 'active').length : 0;
  items.push({
    key: 'listings', title: 'Listings feed', present: !!L, asOf: L?.updatedAt || null, ageDays: age(L?.updatedAt),
    detail: L ? `${active} active of ${Object.keys(L.listings).length} known · ${L.snapshots.length} snapshot(s)` : 'Nothing imported yet.',
    stale: !!L && age(L.updatedAt) > 10, refresh: 'Add a listings export above',
  });

  const R = readJson(f('.realis.json'));
  items.push({
    key: 'realis', title: 'REALIS exports', present: !!R, asOf: R?.ingestedAt || null, ageDays: age(R?.ingestedAt),
    /* This line said "no tool reads it yet" for as long as that was true and
       for a while after it stopped being. A status page that is itself stale
       is worse than no status page, because it is the thing you check. */
    detail: R
      ? `${R.count.toLocaleString()} transactions · ${R.stacks.toLocaleString()} stacks. Read by the stack premium on Development and Valuation.`
      : 'Nothing imported yet — the stack premium needs one.',
    stale: false, refresh: 'Add a REALIS export above',
  });

  const B = readJson(f('breakeven.json'));
  items.push({
    key: 'breakeven', title: 'Land → launch model', present: !!B, asOf: B?.builtAt || null, ageDays: age(B?.builtAt),
    detail: B
      ? `${B.observations.length} launches joined to their land · ${B.unlaunched.length} sites still to come · `
        + `${B.fit.regime} fit on ${B.fit.n}, ${(100 * B.accuracy.mdape).toFixed(1)}% median error`
      : 'Not built.',
    /* It only moves when a new launch files its first sales or a new site is
       awarded, so it goes stale slowly — but it does go stale, and every
       month that passes widens the extrapolation on everything in the
       pipeline table. */
    stale: age(B?.builtAt) > 60, refresh: 'npm run build:breakeven',
  });

  const PS = readJson(f('private-scan.json'));
  items.push({
    key: 'privatescan', title: 'Private scan', present: !!PS, asOf: PS?.builtAt || null, ageDays: age(PS?.builtAt),
    detail: PS
      ? `${PS.projects.length.toLocaleString()} condominiums across ${PS.districts.length} districts · `
        + `${PS.basis.rows.toLocaleString()} resales, restated to ${PS.restatedTo}`
      : 'Not built.',
    /* Rebuilt from the same private.json the AVM reads, so it goes stale on
       the same clock. */
    stale: age(PS?.builtAt) > 35, refresh: 'npm run build:private-scan',
  });

  return items;
}
