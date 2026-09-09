import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Every data file a REQUEST opens must be named in outputFileTracingIncludes.
 *
 * The data layer reads `path.join(process.cwd(), 'data', f)` with a runtime
 * `f`, which the tracer cannot follow. @vercel/nft rescues that by bundling
 * all of data/, and CLAUDE.md records this being forgotten three times — but
 * the rescue is not a contract. Anything added to the excludes, or a change in
 * how nft treats an unresolvable join, removes a file silently: the feature
 * works in dev, where the whole repo is on disk, and returns nothing in
 * production.
 *
 * So the includes are the guarantee, and this checks they are complete. It
 * failed on planning.json, which /api/ai/blindspot opens on every report.
 */
const config = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
const includes = config.slice(config.indexOf('outputFileTracingIncludes'));

const listed = route => {
  const at = includes.indexOf(`'${route}'`);
  assert.ok(at > -1, `${route} has no entry in outputFileTracingIncludes`);
  const body = includes.slice(at, includes.indexOf(']', at));
  return new Set([...body.matchAll(/'\.\/data\/([^']+)'/g)].map(m => m[1]));
};

/** What a module opens, following the one level of import that matters. */
const reads = path => new Set(
  [...readFileSync(new URL(path, import.meta.url), 'utf8')
    .matchAll(/\bload\(\s*'([^']+)'/g)].map(m => m[1]));

test('the Blindspot route can open every file it reads', () => {
  const named = listed('/api/ai/blindspot');
  // analyse() reads through measure.js and query.js; both run per request.
  const needed = new Set([...reads('../lib/blindspot/measure.js'),
                          ...['geo.json', 'index.json']]);
  for (const f of needed) {
    if (f.startsWith('near/')) continue;      // amenities are read by the page, not the API
    assert.ok(named.has(f) || named.has('records/**') && f.startsWith('records/'),
      `/api/ai/blindspot opens data/${f} at request time and it is not in the includes`);
  }
});

test('a route that resolves records is given the shards', () => {
  for (const r of ['/api/record', '/api/watch', '/compare', '/api/rent'])
    assert.ok(listed(r).has('records/**'), `${r} resolves a record and cannot open the shards`);
});

test('nothing is both excluded and required', () => {
  // The excludes exist to stop 155MB of ingest output riding into every
  // function. Excluding something a request opens is the same bug wearing the
  // opposite mask.
  const ex = new Set([...config.slice(0, config.indexOf('outputFileTracingIncludes'))
    .matchAll(/'\.\/data\/([^']+)'/g)].map(m => m[1]));
  for (const route of ['/api/ai/blindspot', '/api/record', '/api/rent', '/compare', '/api/search'])
    for (const f of listed(route))
      assert.ok(!ex.has(f), `${route} needs data/${f} and it is excluded`);
});

/**
 * An import path that node:test cannot see.
 *
 * Three pages were wired to a new component with `../components/...` where the
 * depth needed `../../`. Every test passed — node never imports a page file,
 * because Node does not strip JSX — and the build failed with three
 * module-not-found errors. The suite is not a substitute for the build here,
 * but it can at least check that a relative import names a file that exists.
 */
import { readdirSync as readdirForImports } from 'node:fs';
import path from 'node:path';

test('every relative import in app/ and components/ resolves to a real file', () => {
  const roots = ['app', 'components'];
  const walk = dir => readdirForImports(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.jsx?$/.test(e.name) ? [full] : [];
  });

  const broken = [];
  for (const file of roots.flatMap(r => walk(path.join(process.cwd(), r)))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      if (!existsSync(target)) {
        broken.push(`${path.relative(process.cwd(), file)} → ${m[1]}`);
      }
    }
  }
  assert.deepEqual(broken, [], 'these imports name a file that does not exist:\n  ' + broken.join('\n  '));
});
