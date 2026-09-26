/**
 * The buildings around a home, for Sunward. Read from data/buildings.json,
 * so every assertion here is a rule that holds on tomorrow's data — CLAUDE.md
 * records what happens to a data test that pins one building.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { massingAround } from '../lib/massing.js';
import { recordByHref, geoRecords } from '../lib/data/query.js';

const have = existsSync(new URL('../data/buildings.json', import.meta.url));

test('every height has a named source, and none is invented', { skip: !have && 'no buildings.json' }, () => {
  const raw = JSON.parse(readFileSync(new URL('../data/buildings.json', import.meta.url), 'utf8'));
  assert.match(raw.licence, /OpenStreetMap contributors, ODbL/);
  for (const [m, src] of raw.b.slice(0, 5000)) {
    if (m === null) assert.equal(src, 0, 'a building with no height claims a source');
    else assert.ok(src >= 1 && src <= 4 && m > 0 && m < 400, `height ${m} from source ${src}`);
  }
  /* Most blocks HDB lists should carry its storey count, in the areas read. */
  if (!(raw.missing || []).length) assert.ok(raw.b.filter(b => b[1] === 1).length > 5000, 'HDB storey heights reached too few blocks — the join has broken');
});

test('an HDB block page finds its own building, with HDB’s storey count on it', { skip: !have && 'no buildings.json' }, () => {
  /* A sweep, not one block: most HDB records with a coordinate should sit
     inside a footprint that carries HDB's own storey count. */
  const geo = geoRecords();
  const all = Object.keys(geo).filter(h => h.startsWith('/hdb/'));
  const hrefs = all.filter((_, i) => i % Math.ceil(all.length / 400) === 0);
  let own = 0, hdbHeight = 0;
  let covered = 0;
  for (const h of hrefs) {
    const g = geo[h];
    const m = massingAround(g.lat, g.lon);
    if (!m) continue;                    // an area the ingest has not read: no answer, by design
    covered++;
    if (m.own < 0) continue;
    own++;
    if (m.buildings[m.own].src === 1) hdbHeight++;
  }
  if (!covered) return;
  assert.ok(own / covered > 0.8, `only ${own} of ${covered} HDB records found their building`);
  assert.ok(hdbHeight / own > 0.8, `only ${hdbHeight} of ${own} carry HDB's storey count`);
});

test('the neighbourhood is local metres, nearest first, within reach', { skip: !have && 'no buildings.json' }, () => {
  const rec = recordByHref('/condo/artra');
  const g = rec && geoRecords()[rec.href];
  if (!g) return;
  const m = massingAround(g.lat, g.lon, 320);
  if (!m) return;                        // not read yet
  assert.ok(m.buildings.length > 0);
  for (let i = 0; i < m.buildings.length; i++) {
    assert.ok(m.buildings[i].dist <= 320);
    if (i) assert.ok(m.buildings[i].dist >= m.buildings[i - 1].dist);
    for (const [x, y] of m.buildings[i].ring) assert.ok(Math.abs(x) < 700 && Math.abs(y) < 700, 'a footprint is not in local metres');
  }
  assert.ok(Number.isInteger(m.small) && m.small >= 0);
});

test('a tile the ingest could not read gives no answer near it, not a partial one', () => {
  /* Buildings missing without the page knowing would make a window read as
     sunny beside a tower that was never loaded. */
  const lib = readFileSync(new URL('../lib/massing.js', import.meta.url), 'utf8');
  assert.match(lib, /B\.meta\.missing/, 'massingAround no longer checks for unread tiles');
  const ingest = readFileSync(new URL('../scripts/ingest-buildings.mjs', import.meta.url), 'utf8');
  assert.match(ingest, /missing\.push\(box\)/, 'a failed tile no longer gets recorded');
  assert.match(ingest, /if \(!cache\.done\[box\.join\(','\)\]\) boxes\.push\(box\)/, 'the ingest no longer resumes');
});

test('the buildings file ships with the pages that render on demand', () => {
  /* Long-tail block and project pages render at request time. Excluding
     buildings.json from tracing (it was, for an afternoon) would make Sunward
     show in development and never in production. */
  const cfg = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
  const excludes = cfg.slice(cfg.indexOf('outputFileTracingExcludes'), cfg.indexOf('outputFileTracingIncludes'));
  assert.doesNotMatch(excludes, /'\.\/data\/buildings\.json'/, 'buildings.json is excluded from the functions that need it');
  const includes = cfg.slice(cfg.indexOf('outputFileTracingIncludes'));
  assert.match(includes, /'\/hdb\/\*\/\*': \[[^\]]*'\.\/data\/buildings\.json'/);
  assert.match(includes, /'\/condo\/\*': \[[^\]]*'\.\/data\/buildings\.json'/);
});
