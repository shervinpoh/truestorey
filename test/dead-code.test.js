import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Nothing in lib/ is exported and then referenced nowhere at all.
 *
 * This repo has a scar from the opposite of dead code and the same root:
 * lib/calc/proceeds.js was correct, tested, and imported by nothing, while
 * Proceeds.jsx carried its own copy of the sale-proceeds maths wrapped in
 * Math.max(0, …) — so a seller who had to bring S$197,747 to completion was
 * told they walked away with nothing. Two implementations was the bug; the
 * floor is what made it dangerous.
 *
 * An export nobody calls is where the second implementation hides. It reads
 * as the real one, it has tests, and the thing actually running is somewhere
 * else.
 *
 * WHAT THIS DELIBERATELY ALLOWS: an export used only by tests. Those are
 * internal helpers made reachable so a unit can be tested on its own, which
 * is a real reason to export something. What it forbids is a symbol that
 * appears exactly once in the entire repository — its own definition.
 */
const ROOT = new URL('..', import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next|\.git|land-in|photos-in/.test(p)) walk(p); }
    else if (/\.(js|jsx|mjs)$/.test(e.name)) files.push(p);
  }
})(ROOT);
const sources = files.map(f => [f.replace(ROOT, ''), fs.readFileSync(f, 'utf8')]);

test('no export in lib/ is defined and never referenced', () => {
  const dead = [];
  for (const [file, src] of sources) {
    if (!file.startsWith('lib/')) continue;
    for (const m of src.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)\s*=/gm)) {
      const name = m[1] || m[2];
      const uses = sources.reduce((n, [, s]) =>
        n + (s.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length, 0);
      if (uses <= 1) dead.push(`${file} → ${name}`);
    }
  }
  assert.deepEqual(dead, [],
    'exported and referenced nowhere — either wire it up or delete it:\n  ' + dead.join('\n  '));
});
