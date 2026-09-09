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
import { JOBS } from '../lib/datasets.js';

const ageOf = f => {
  const p = path.join(ROOT, 'data', f);
  if (!fs.existsSync(p)) return null;                       // absent, not stale
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const d = (j.accessedAt || j.builtAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    /* floor, not round. The stamp is a DATE, so the age is "how many whole
       days ago was this written". Rounding turned a file written at 16:31 UTC
       into one day old the moment it was saved — which on a daily interval
       made every fresh pull report itself as having failed to refresh, and
       the source-health record above would have logged a healthy source as
       broken every night. */
    return Math.floor((Date.now() - new Date(d + 'T00:00:00Z')) / 86400000);
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
/* Every source that did not actually produce fresh data this run, whether it
   threw or lied about succeeding. Both are "not refreshing" to a reader. */
const sick = new Set();
for (const r of due) {
  console.log(`── ${r.key}`);
  let threw = false;
  try { execSync(r.cmd, { stdio: 'inherit', cwd: ROOT }); }
  catch { threw = true; failed++; sick.add(r.key); console.error(`   ${r.key} failed — the others still ran.\n`); }

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
    sick.add(r.key);
    console.error(`   ${r.key} reported success but data/${r.file} is ${after === null ? 'still missing' : `still ${after}d old`} — not refreshed.\n`);
  }
}

/* ── AN OUTAGE NEEDS A DURATION, NOT A STATE ────────────────────────────────
 * The exit code above told the truth and then told it every single night. MAS
 * went down on 28 August and the scheduled run went red on 14 of the next 15
 * mornings — for a fault that is not in this repo and that nobody here can
 * fix. A signal that fires every night is not a signal; a genuinely broken
 * ingest would have arrived as the fifteenth identical red X and nobody would
 * have looked.
 *
 * So the file records WHEN each source started failing. Under the grace
 * period a known outage is a warning and the run stays green, because the
 * honest report is "MAS is down again" and everything else refreshed. Past it
 * the run fails and keeps failing, because a fortnight is no longer an outage
 * — it is an endpoint that moved and nobody noticed.
 *
 * Committed, deliberately. It is four lines of JSON and it is the only record
 * of how long something has been broken; keeping it out of the repo would put
 * that answer on one laptop. */
const HEALTH = 'data/.source-health.json';
const GRACE_DAYS = 7;

const healthPath = path.join(ROOT, HEALTH);
let health = {};
try { health = JSON.parse(fs.readFileSync(healthPath, 'utf8')); } catch { health = {}; }

const todayIso = new Date().toISOString().slice(0, 10);
for (const r of due) {
  if (sick.has(r.key)) {
    /* failingSince survives across runs: it is the first morning this stopped
       working, not the most recent one. Overwriting it every night would reset
       the clock daily and the grace period would never expire. */
    health[r.key] = {
      failingSince: health[r.key]?.failingSince || todayIso,
      lastSeenFailing: todayIso,
    };
  } else {
    delete health[r.key];            // it worked; forget it ever did not
  }
}
fs.writeFileSync(healthPath, JSON.stringify(health, null, 2) + '\n');

const daysSince = iso => Math.round((Date.now() - Date.parse(iso + 'T00:00:00Z')) / 86400000);
const overdue = Object.entries(health).filter(([, v]) => daysSince(v.failingSince) >= GRACE_DAYS);

if (Object.keys(health).length) {
  console.log('\nSources not refreshing:');
  for (const [k, v] of Object.entries(health)) {
    const d = daysSince(v.failingSince);
    console.log(`  ${k} — failing since ${v.failingSince} (${d}d)` +
      (d >= GRACE_DAYS ? '  ← past the grace period; this run will fail' : `  (tolerated up to ${GRACE_DAYS}d)`));
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

/* The exit code still has to tell the truth, or a scheduled run rots silently
 * — but the truth is now "something has been down longer than a fortnight",
 * not "something is down tonight". A source inside its grace period leaves
 * this green and says so above; that is the difference between a warning and
 * an alarm, and this workflow had lost it. */
if (overdue.length) {
  console.error(`\n${overdue.map(([k, v]) => `${k} has not refreshed since ${v.failingSince}`).join('; ')}.`);
  console.error('Past the grace period — treat this as an endpoint that moved, not an outage.\n');
}
process.exit(overdue.length ? 1 : 0);
