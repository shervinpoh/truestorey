/**
 * Put a coordinate on every HDB block and every private project.
 *
 *   npm run geocode              resume, or start
 *   npm run geocode -- --only=hdb        one namespace
 *   npm run geocode -- --report          what is on disk, no network
 *   npm run geocode -- --retry-weak      have another go at poor matches
 *
 * Around 13,000 addresses. Expect 40 to 70 minutes on the first run, and a
 * few seconds on every run after that, because every answer is cached in
 * data/geocache.json. Leave it going; it is safe to interrupt at any point
 * and safe to run again.
 *
 * Nothing here invents a coordinate. An address OneMap cannot place is
 * recorded as unplaced, and the record simply shows no amenities — which is
 * the correct outcome, and visibly different from showing the wrong ones.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  geocodeBlock, geocodeProject, geocodeStreet,
  loadCache, saveCache, cacheSize, USABLE, ATTRIBUTION,
  RateLimited, currentRate, setCacheOnly,
} from './lib/onemap.mjs';

const ROOT = process.cwd();
const RECORDS = path.join(ROOT, 'data', 'records');

/* Same shape the record routes use, so an href built here addresses the same
   page the rest of the site would link to. */
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const OUT = path.join(ROOT, 'data', 'geo.json');

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || null;

/* ------------------------------------------------------------ work list */

async function workList() {
  const only = opt('only');
  const items = [];
  for (const ns of ['hdb', 'condo', 'landed']) {
    if (only && only !== ns) continue;
    let files;
    try { files = await fs.readdir(path.join(RECORDS, ns)); }
    catch { continue; }
    for (const f of files.filter(f => f.endsWith('.json'))) {
      const shard = JSON.parse(await fs.readFile(path.join(RECORDS, ns, f), 'utf8'));
      for (const rec of Object.values(shard)) {
        items.push({
          href: rec.href, ns,
          block: rec.block || null, street: rec.street || null,
          project: rec.project || null, label: rec.label,
        });
      }
    }
  }

  /* ── blocks that have never had a resale ──────────────────────────────
   * The work list above walks data/records/, which only holds blocks with a
   * filed transaction. A block reaching its fifth year for the FIRST time has
   * none by definition — so 693 of the 749 blocks about to reach MOP were
   * never geocoded, and any "supply within 2km" calculation quietly reported
   * almost no supply anywhere. That is the worst shape of wrong: confident,
   * and wrong in the reassuring direction.
   *
   * They are added here so the radius is measured against the whole estate
   * rather than only the parts of it that have sold before. */
  if (!only || only === 'mop') {
    const seen = new Set(items.map(i => i.href));
    let mop;
    try { mop = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'mop.json'), 'utf8')); }
    catch { mop = null; }
    let added = 0;
    for (const town of Object.values(mop?.towns || {})) {
      for (const year of Object.values(town.byYear || {})) {
        for (const b of year.list || []) {
          const href = `/hdb/${slugify(b.town)}/${slugify(`${b.block} ${b.street}`)}`;
          if (seen.has(href)) continue;
          seen.add(href);
          items.push({
            href, ns: 'hdb',
            block: b.block, street: b.street, project: null,
            label: `Blk ${b.block} ${b.street}`,
          });
          added++;
        }
      }
    }
    if (added) console.log(`  + ${added} blocks from the MOP register with no resale history yet`);
  }

  return items;
}

/* ------------------------------------------------------------------ run */

async function main() {
  await loadCache();
  const geo = await readJson(OUT, { records: {} });
  geo.records ||= {};

  if (flag('report')) return report(geo);

  const items = await workList();
  const retryWeak = flag('retry-weak');
  const regrade = flag('regrade');
  // --regrade re-runs every record through the matcher. Anything already in
  // the cache answers from disk, so this costs no network at all — it exists
  // so a fix to the matching rules can be applied to work already done.
  const todo = items.filter(it => {
    const have = geo.records[it.href];
    if (!have) return !regrade;             // regrade never fetches anything new
    if (regrade) return true;
    if (retryWeak && !USABLE.has(have.match)) return true;
    return false;
  });
  if (regrade) {
    setCacheOnly(true);                     // hard guarantee: no network in this mode
    console.log(`regrading ${todo.length} already-placed records against the cache — no network, seconds not minutes\n`);
  }

  if (!regrade) {
    console.log(`${items.length} records · ${items.length - todo.length} already placed · ${todo.length} to do`);
    console.log(`cache holds ${cacheSize()} answers`);
    console.log(`pacing at ~${Math.round(currentRate())} requests/min — about ${Math.round(todo.length / currentRate())} min if OneMap stays happy\n`);
  }
  if (!todo.length) { await finish(geo, items.length); return; }

  let done = 0, placed = 0, failedNet = 0;
  const started = Date.now();

  // Two lanes, only so one request's latency overlaps the next one's wait.
  // The pace itself is set by the shared gate in onemap.mjs, not by this
  // number — raising it does not make the run faster, it just gets us
  // throttled, which is exactly what the first version of this did.
  const LANES = 2;
  const queue = todo.slice();
  let stopped = null;

  async function lane() {
    for (;;) {
      if (stopped) return;
      const it = queue.shift();
      if (!it) return;
      let r;
      try {
        if (it.ns === 'hdb') r = await geocodeBlock(it.block, it.street);
        else if (it.ns === 'condo') r = await geocodeProject(it.project || it.label, it.street);
        else r = await geocodeStreet(it.street);
      } catch (e) {
        if (e instanceof RateLimited) { stopped = e; return; }
        throw e;
      }

      done++;
      if (r?.error) {
        failedNet++;
        // Leave it out of geo.json entirely so the next run retries it.
        if (failedNet === 1 && !regrade) console.log(`\n  network trouble: ${r.error} — will retry these on the next run`);
      } else {
        geo.records[it.href] = r.match === 'none'
          ? { match: 'none' }
          : { lat: r.lat, lon: r.lon, match: r.match, matched: r.matched || null };
        if (USABLE.has(r.match)) placed++;
      }

      if (done % 200 === 0) {
        await saveCache();
        await writeJson(OUT, stamp(geo, items.length));
        const rate = done / ((Date.now() - started) / 1000);
        const left = Math.round((todo.length - done) / Math.max(rate, 0.1) / 60);
        process.stdout.write(`  ${done}/${todo.length} · ${placed} placed · ~${left} min left · ${Math.round(currentRate())}/min\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: LANES }, lane));
  await saveCache({ force: true });
  await finish(geo, items.length);

  if (failedNet && !regrade) {
    console.log(`\n${failedNet} lookups failed on the network and were NOT saved. Run again to pick them up.`);
  }
  if (stopped) {
    console.log(`\nSTOPPED EARLY — ${stopped.message}`);
    console.log(`Progress so far is on disk. Just run \`npm run geocode\` again.`);
    process.exitCode = 0;   // not a failure: a pause
  }
}

async function finish(geo, total) {
  await writeJson(OUT, stamp(geo, total));
  report(geo);
}

function stamp(geo, total) {
  return {
    source: 'OneMap (Singapore Land Authority)',
    attribution: ATTRIBUTION,
    accessedAt: new Date().toISOString().slice(0, 10),
    total,
    records: geo.records,
  };
}

function report(geo) {
  const by = {};
  for (const v of Object.values(geo.records || {})) by[v.match] = (by[v.match] || 0) + 1;
  const usable = Object.entries(by).filter(([m]) => USABLE.has(m)).reduce((a, [, n]) => a + n, 0);
  const all = Object.keys(geo.records || {}).length;
  console.log(`\ndata/geo.json — ${all} records, ${usable} usable (${((usable / Math.max(all, 1)) * 100).toFixed(1)}%)`);
  for (const [m, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${USABLE.has(m) ? '✓' : '·'} ${m.padEnd(7)} ${n}`);
  }
  if (by.weak || by.none) {
    console.log(`\n  ${(by.weak || 0) + (by.none || 0)} records will show no amenities. That is deliberate —`);
    console.log('  a coordinate we are not sure of would put schools in the wrong band.');
    console.log('  `npm run geocode -- --retry-weak` has another go at them.');
  }
}

const readJson = async (p, fb) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fb; } };
/* Serialised for the same reason saveCache() is — three lanes, one temp path. */
let writing = Promise.resolve();
const writeJson = (p, v) => {
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p + '.tmp', JSON.stringify(v));
    await fs.rename(p + '.tmp', p);
  }).catch(e => { console.error(`  write failed: ${e.message}`); });
  return writing;
};

main().catch(async e => {
  await saveCache({ force: true }).catch(() => {});
  console.error(`\nGEOCODE FAILED: ${e.message}`);
  console.error('Nothing already geocoded was lost — run again to resume.');
  process.exit(1);
});
