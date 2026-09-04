/**
 * Refresh only what is actually due.
 *
 *   npm run sync            run everything that is stale
 *   npm run sync -- --due   say what is stale, run nothing
 *   npm run sync -- --all   force everything
 *
 * "Is the site auto-synced daily?" — no, and it should not be. The sources
 * move at wildly different speeds, and re-pulling a quarterly index every
 * morning is 364 wasted requests a year against a government API that is
 * doing us a favour by being free.
 *
 * So each dataset declares how often its SOURCE actually changes, this checks
 * what is past due, and runs only that. One command, no thinking required.
 *
 * ⚠ This still has to be run by a person, because the site currently runs on
 *    a laptop. Real automation needs the site deployed somewhere with a
 *    scheduler — see README, "Automating this". Until then the Thursday bot
 *    is the reminder.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const dueOnly = argv.includes('--due');
const forceAll = argv.includes('--all');

/**
 * `every` is how often the SOURCE publishes, not how often we feel like
 * asking. Getting these wrong in either direction is the whole cost model:
 * too short and we hammer a free API, too long and the site quietly lies.
 */
const JOBS = [
  { key: 'sora', file: 'sora.json', every: 1, cmd: 'npm run ingest:sora',
    why: 'MAS publishes SORA every business day' },
  /*
   * A REFRESH THAT LEAVES A DERIVED FILE BEHIND IS A REFRESH THAT MAKES THE
   * SITE DISAGREE WITH ITSELF.
   *
   * This ran ingest → index and stopped, while map.json and storey.json are
   * both built FROM index.json and were rebuilt by nothing on this schedule:
   * map.json only by the `boundaries` job, every 365 days, and storey.json by
   * no job at all. build-map.mjs says in its own header that the psf beside a
   * label is "read straight out of index.json, so the map and the tables can
   * never disagree" — true of one build, false across two schedules.
   *
   * test/map.test.js caught it at one dollar: BISHAN read $731 on the map and
   * $732 on /hdb. That gap only ever grows, and a map that quietly drifts from
   * the tables beside it is the exact failure this site exists not to commit.
   */
  /* EVERYTHING DERIVED FROM THE TRANSACTIONS REBUILDS HERE. comps, trend and
   * budget all read hdb.json and private.json — the two files this job
   * replaces — so leaving them out is the same bug the note above records,
   * with four more files in it: Blindspot would score against last month's
   * comparables, the size trend would stop at last month's year, and a budget
   * would be measured against prices that had moved. Silently, and passing
   * every test, because each file on its own is still valid. */
  { key: 'transactions', file: 'index.json', every: 7,
    cmd: 'npm run ingest:hdb && npm run ingest:ura && npm run index'
       + ' && npm run build:storey && npm run build:map'
       + ' && npm run build:comps && npm run build:trend && npm run build:budget',
    why: 'HDB and URA file new transactions continuously, with a lag of weeks' },
  { key: 'price-index', file: 'hdb-index.json', every: 80, cmd: 'npm run ingest:index',
    why: 'the resale price index is quarterly' },
  // URA's index is quarterly too, and it is the series /cost stress-tests a
  // private purchase against. Same 80 days as HDB's for the same reason: a
  // quarter is 91, and 80 catches the republication without asking twice.
  { key: 'ppi', file: 'ppi.json', every: 80, cmd: 'npm run ingest:ppi',
    why: 'URA\'s private residential price index is quarterly' },
  // build:map reads mop.json for HDB's published storey counts — the heights
  // the 3D blocks are extruded from — so refreshing the register without
  // rebuilding the map leaves the towers standing at last quarter's heights.
  { key: 'mop', file: 'mop.json', every: 80, cmd: 'npm run ingest:mop && npm run build:map',
    why: 'HDB Property Information changes a few times a year' },
  { key: 'amenities', file: 'amenities.json', every: 180, cmd: 'npm run ingest:amenities && npm run build:nearby',
    why: 'stations, schools and hawker centres barely move' },
  // build:rents is the other reader of rental.json — /cost compares the cost of
  // owning against what places like it actually let for, and a stale rent
  // would be quoted beside a fresh instalment.
  { key: 'rental', file: 'rental.json', every: 30,
    cmd: 'npm run ingest:rental && npm run build:yield && npm run build:rents',
    why: 'URA files rental contracts quarterly, but in rolling batches' },
  { key: 'boundaries', file: 'boundaries.json', every: 365, cmd: 'npm run ingest:boundaries && npm run build:map',
    why: 'the Master Plan is redrawn about every five years — this is a formality, not a refresh' },
  // URA awards a handful of sites a month and the sheet is republished as they
  // close. Fortnightly is faster than the source moves and slow enough not to
  // hammer a static file host.
  { key: 'gls-awards', file: 'gls-awards.json', every: 14, cmd: 'npm run ingest:gls-awards',
    why: 'URA republishes the past-sites sheet as each tender is awarded' },
  { key: 'planning', file: 'planning.json', every: 30, cmd: 'npm run ingest:planning',
    why: 'URA decides applications continuously and the current year grows all year' },
  { key: 'zoning', file: 'zoning.json', every: 365, cmd: 'npm run ingest:zoning',
    why: 'the Master Plan land use layer changes on the statutory review, not on a feed' },
  // gls is NOT here on purpose. data/sources/gls-programme.json is transcribed
  // by hand from URA's published programme, so there is nothing for a scheduler
  // to fetch — running the ingest would only re-geocode the same list. It goes
  // stale on a calendar and the ingest refuses a programme older than the
  // current half, which is the reminder.
];

const ageOf = f => {
  const p = path.join(ROOT, 'data', f);
  if (!fs.existsSync(p)) return null;                       // absent, not stale
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const d = (j.accessedAt || j.builtAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return Math.round((Date.now() - new Date(d + 'T00:00:00Z')) / 86400000);
  } catch { return null; }
};

const rows = JOBS.map(j => {
  const age = ageOf(j.file);
  return { ...j, age, due: forceAll || age === null || age >= j.every };
});

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('DATASET', 15)}${pad('AGE', 8)}${pad('REFRESH', 10)}STATUS`);
for (const r of rows) {
  const age = r.age === null ? 'missing' : `${r.age}d`;
  console.log(`${pad(r.key, 15)}${pad(age, 8)}${pad('every ' + r.every + 'd', 10)}${r.due ? '→ DUE' : 'ok'}`);
  if (r.due) console.log(`${' '.repeat(15)}${r.why}`);
}

const due = rows.filter(r => r.due);
if (!due.length) { console.log('\nEverything is current. Nothing to do.\n'); process.exit(0); }

if (dueOnly) {
  console.log(`\n${due.length} due. Run \`npm run sync\` to refresh them.\n`);
  process.exit(0);
}

console.log(`\nRefreshing ${due.length}…\n`);
let failed = 0;
const untouched = [];
for (const r of due) {
  console.log(`── ${r.key}`);
  let threw = false;
  try { execSync(r.cmd, { stdio: 'inherit', cwd: ROOT }); }
  catch { threw = true; failed++; console.error(`   ${r.key} failed — the others still ran.\n`); }

  /*
   * AN EXIT CODE IS NOT EVIDENCE THE FILE MOVED.
   *
   * ingest:sora exits 0 when MAS is under maintenance, on purpose — a MAS
   * outage is not a fault in this repo and must not fail `npm run data:all`.
   * The cost was that this script then printed "All 1 refreshed" over a
   * dataset it had not refreshed, and the scheduled workflow went green,
   * committed nothing, and left a log saying everything was fine.
   *
   * So the file itself is the evidence. If it is still as old as it was — or
   * still missing — the job did not do what this script just claimed it did,
   * whatever it returned.
   */
  const after = ageOf(r.file);
  if (!threw && (after === null || after >= r.every)) {
    untouched.push(r.key);
    console.error(`   ${r.key} reported success but data/${r.file} is ${after === null ? 'still missing' : `still ${after}d old`} — not refreshed.\n`);
  }
}

// A failing source must never stop the rest. That is the SORA lesson: MAS
// being down for an afternoon cannot be allowed to hold back HDB transactions.
const stalled = failed + untouched.length;
if (stalled) {
  const parts = [];
  if (failed) parts.push(`${failed} failed`);
  if (untouched.length) parts.push(`${untouched.length} reported success without refreshing (${untouched.join(', ')})`);
  console.log(`\n${parts.join(', ')} of ${due.length}. Re-run to retry just those.\n`);
} else {
  console.log(`\nAll ${due.length} refreshed. Next: npm run brief, then npm run note.\n`);
}

// A failing source still must not stop the others — that is the SORA lesson and
// it is why the loop above swallows each error. But the EXIT CODE has to tell
// the truth, or a scheduled run rots silently: the workflow commits whatever
// succeeded, sees a zero, and reports green while a source has been down for
// weeks. Everything that was going to run has already run by this point.
process.exit(stalled ? 1 : 0);
