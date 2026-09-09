import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * A refresh that leaves a derived file behind.
 *
 * CLAUDE.md records this once already: map.json and storey.json read
 * index.json, the sync refreshed index.json alone, and the map quietly drifted
 * from the tables beside it — caught at one dollar, BISHAN reading $731 on the
 * map and $732 on /hdb. The gap only ever grows.
 *
 * Four more derived files were added on 2 Sep and the same hole opened under
 * every one of them. Each stays internally valid while going stale, so nothing
 * fails and nothing looks wrong: Blindspot would score against last month's
 * comparables, and a rent from last quarter would sit beside a fresh
 * instalment on /cost.
 *
 * The map below is what each raw file feeds. If a build script starts reading
 * a new source, add it here and the test will say which job has to rebuild it.
 */
/* The job list moved to lib/datasets.js so /methodology can publish the real
   refresh schedule instead of a hand-written copy of it. scripts/sync.mjs is
   top-level executable code with no main(), so a page importing it would run a
   sync. This test reads whichever file holds the jobs, and both are named so a
   move breaks it loudly rather than silently finding nothing. */
const sync = readFileSync(new URL('../lib/datasets.js', import.meta.url), 'utf8')
  + readFileSync(new URL('../scripts/sync.mjs', import.meta.url), 'utf8');
const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;

/** raw file the sync replaces -> npm scripts that must run after it */
const DERIVED = {
  'index.json': ['build:storey', 'build:map', 'build:comps', 'build:trend', 'build:budget'],
  'rental.json': ['build:yield', 'build:rents'],
  'mop.json': ['build:map'],
};

/** The job block for one file, from the sync's own job list. */
function job(file) {
  const at = sync.indexOf(`file: '${file}'`);
  assert.ok(at > -1, `sync has no job for ${file}`);
  const start = sync.lastIndexOf('{ key:', at);
  return sync.slice(start, sync.indexOf('why:', at));
}

test('every job rebuilds what its refresh invalidates', () => {
  for (const [file, needed] of Object.entries(DERIVED)) {
    const cmd = job(file);
    for (const script of needed)
      assert.match(cmd, new RegExp(`npm run ${script.replace(':', ':')}`),
        `refreshing ${file} leaves ${script} stale — the map/storey bug again`);
  }
});

test('every rebuild named here is a script that exists', () => {
  // A job that runs `npm run build:whatever` when there is no such script
  // exits non-zero and takes the whole scheduled refresh with it.
  for (const needed of Object.values(DERIVED))
    for (const s of needed) assert.ok(scripts[s], `package.json has no "${s}"`);
});

test('the derived builds are in the build pipeline too', () => {
  // npm run data is what a deploy runs. A file built only by sync would be
  // missing from a fresh checkout.
  for (const s of ['build:comps', 'build:rents', 'build:trend', 'build:budget'])
    assert.match(scripts.data, new RegExp(s), `npm run data does not run ${s}`);
});

/**
 * A signal that fires every night is not a signal.
 *
 * The workflow failed deliberately whenever any source failed, so "a source
 * being down is loud rather than silent". MAS went down on 28 August and the
 * nightly run went red on 14 of the next 15 mornings — for a fault outside
 * this repo that nobody here can fix. A genuinely broken ingest would have
 * arrived as the fifteenth identical red X.
 *
 * So an outage now carries a duration. Inside the grace period it is a warning
 * and the run stays green; past it the run fails and keeps failing, because a
 * fortnight is not an outage, it is an endpoint that moved.
 */
test('a source outage is measured in days, not treated as a state', () => {
  const src = readFileSync(new URL('../scripts/sync.mjs', import.meta.url), 'utf8');
  assert.match(src, /GRACE_DAYS\s*=\s*(\d+)/, 'the grace period is gone; every outage fails the run again');
  const grace = Number(/GRACE_DAYS\s*=\s*(\d+)/.exec(src)[1]);
  assert.ok(grace >= 2 && grace <= 21, `a grace of ${grace} days is not a grace period`);
  assert.match(src, /failingSince/, 'nothing records WHEN a source started failing');
  assert.match(src, /process\.exit\(overdue\.length \? 1 : 0\)/,
    'the exit code is back to failing on any outage rather than a prolonged one');
});

/**
 * ageOf reads a DATE stamp, so the age is how many WHOLE days ago the file was
 * written. It used Math.round, which turned a file saved at 16:31 UTC into one
 * day old the moment it was saved — so on a daily interval every fresh pull
 * reported itself as having failed to refresh. Found by running the sync and
 * reading what it said, not by any test.
 */
test('a file written today is zero days old, whatever the hour', () => {
  const src = readFileSync(new URL('../scripts/sync.mjs', import.meta.url), 'utf8');
  const fn = /const ageOf = f => \{[\s\S]*?\n\};/.exec(src);
  assert.ok(fn, 'ageOf moved — check this test still describes it');
  assert.match(fn[0], /Math\.floor\(/, 'ageOf rounds again: a fresh file will read as a day stale');
  assert.doesNotMatch(fn[0], /Math\.round\(/, 'rounding a partial day up makes every afternoon refresh look failed');
});
