import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * `lib/consult/` must not be reachable from the published site.
 *
 * ── WHY THIS IS A TEST AND NOT A CONVENTION ────────────────────────────────
 * `lib/consult/avm.js` produces a point estimate of what a home is worth,
 * which is the single thing rule 2 forbids publishing, and it is written to
 * use whatever vocabulary is useful for thinking — "over", "under", a rank —
 * which rule 7 forbids in anything a reader sees. Both are fine in a tool
 * Shervin reads before he speaks. Neither is fine on a page that carries a CEA
 * registration number in its footer.
 *
 * The distance between those two states is one `import`. Next traces imports
 * from app/, so a single component pulling in a helper "just for the range"
 * would ship the whole module, and nothing about the resulting page would look
 * wrong in review — the failure is invisible at the call site and only shows
 * up in what the bundle contains.
 *
 * So the separation is asserted rather than agreed. `clientSafe()` in avm.js
 * is the supported crossing: it drops the point and keeps the observed band
 * and the comparables, which is what /blindspot already publishes.
 *
 * If this test ever needs to be relaxed, the thing to change is not this file.
 */
const ROOTS = ['app', 'components'];
/** lib/ is scanned too, minus consult itself — a public lib importing consult
 *  would drag it in one step further from where anyone would look. */
const LIB_EXCEPT = 'lib/consult';

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
};

const files = [
  ...ROOTS.flatMap(r => walk(r)),
  ...walk('lib').filter(f => !f.startsWith(LIB_EXCEPT)),
];

test('nothing the site builds imports lib/consult', () => {
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    /* Catches `from '../lib/consult/avm.js'`, `from './consult/avm.js'` and
       the dynamic `import('...consult/...')` form alike. */
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (/(^|\/)consult\//.test(m[1])) offenders.push(`${f} → ${m[1]}`);
    }
  }
  assert.deepStrictEqual(offenders, [],
    'A published surface has reached into the consult layer:\n  ' + offenders.join('\n  ')
    + '\nUse clientSafe() and move the range, not the estimate.');
});

test('the consult layer exists and is where it says it is', () => {
  /* A boundary test that passes because the directory was renamed and it is
     now scanning nothing would be worse than no test. */
  assert.ok(fs.existsSync('lib/consult/avm.js'), 'lib/consult/avm.js has moved — update this test');
  assert.ok(files.length > 50, `only ${files.length} files scanned; the walk is not finding the site`);
});

test('the AVM ships a way to cross the boundary safely', () => {
  const src = fs.readFileSync('lib/consult/avm.js', 'utf8');
  assert.match(src, /export function clientSafe/,
    'without clientSafe the only way to publish any of this is to copy it, '
    + 'and a copy is what stops being maintained');
});
