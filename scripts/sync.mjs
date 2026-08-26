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
  { key: 'transactions', file: 'index.json', every: 7, cmd: 'npm run ingest:hdb && npm run ingest:ura && npm run index',
    why: 'HDB and URA file new transactions continuously, with a lag of weeks' },
  { key: 'price-index', file: 'hdb-index.json', every: 80, cmd: 'npm run ingest:index',
    why: 'the resale price index is quarterly' },
  { key: 'mop', file: 'mop.json', every: 80, cmd: 'npm run ingest:mop',
    why: 'HDB Property Information changes a few times a year' },
  { key: 'amenities', file: 'amenities.json', every: 180, cmd: 'npm run ingest:amenities && npm run build:nearby',
    why: 'stations, schools and hawker centres barely move' },
  { key: 'rental', file: 'rental.json', every: 30, cmd: 'npm run ingest:rental && npm run build:yield',
    why: 'URA files rental contracts quarterly, but in rolling batches' },
  { key: 'boundaries', file: 'boundaries.json', every: 365, cmd: 'npm run ingest:boundaries && npm run build:map',
    why: 'the Master Plan is redrawn about every five years — this is a formality, not a refresh' },
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
for (const r of due) {
  console.log(`── ${r.key}`);
  try { execSync(r.cmd, { stdio: 'inherit', cwd: ROOT }); }
  catch { failed++; console.error(`   ${r.key} failed — the others still ran.\n`); }
}

// A failing source must never stop the rest. That is the SORA lesson: MAS
// being down for an afternoon cannot be allowed to hold back HDB transactions.
console.log(failed ? `\n${failed} of ${due.length} failed. Re-run to retry just those.\n`
                   : `\nAll ${due.length} refreshed. Next: npm run brief, then npm run note.\n`);
process.exit(0);
