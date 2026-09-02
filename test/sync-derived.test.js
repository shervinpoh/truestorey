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
const sync = readFileSync(new URL('../scripts/sync.mjs', import.meta.url), 'utf8');
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
