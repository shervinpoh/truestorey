/**
 * The floor premium on the homepage and /floors, and the two ways it went wrong.
 *
 * ── TWO DEFINITIONS OF "HIGH FLOOR" IN ONE SENTENCE ────────────────────────
 * The homepage headline set a pooled figure against a within-building figure
 * and called the gap the cost of pooling. The pooled side was the band table's
 * top against its bottom — floors 46-48 against 1-3 — and the within side was
 * floors 13+ against 1-6. For 4-room that printed 144% beside 10.5%. At the
 * same cuts pooling gives 26.7%. /floors said "a tenth of that", and FloorView
 * gated its card on `spread` and then displayed the band extremes anyway.
 *
 * ── A QUALITATIVE WORD IS A CLAIM TOO ──────────────────────────────────────
 * "Most of it isn't the height" is true while within < pooled / 2 and false
 * after. And "it runs above that figure" was about to ship on a card where it
 * is false for 41 of 138 town and type combinations. Words that summarise a
 * number have to be switched by that number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (...p) => JSON.parse(readFileSync(path.join(root, ...p), 'utf8'));
const code = (...p) => readFileSync(path.join(root, ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const storey = read('data', 'storey.json');
const med = v => { const s = v.slice().sort((a, b) => a - b); return s[(s.length - 1) >> 1]; };
const midOf = r => { const m = /^(\d+)\s*(?:TO|-)\s*(\d+)$/i.exec(String(r || '').trim()); return m ? (+m[1] + +m[2]) / 2 : null; };

test('the national pooled figure uses the same floors as the within-building one', () => {
  /* Recomputed from the sales rather than trusting the field name: a `spread`
     that quietly went back to band extremes would pass a presence check. */
  const n4 = storey.hdb.national['4 ROOM'];
  assert.ok(n4?.spread != null, 'data/storey.json has no national 4-room spread; run npm run build:storey');
  const { lo, hi } = storey.cuts.hdb;
  const rows = read('data', 'hdb.json').rows
    .filter(r => r.flatType === '4 ROOM' && r.psf > 0)
    .map(r => ({ psf: r.psf, mid: midOf(r.storeyRange) })).filter(r => r.mid != null);
  const expect = Math.round((med(rows.filter(r => r.mid >= hi).map(r => r.psf))
    / med(rows.filter(r => r.mid <= lo).map(r => r.psf)) - 1) * 1000) / 10;
  assert.equal(n4.spread, expect,
    `national 4-room spread is ${n4.spread}% but floors ${hi}+ against 1-${lo} gives ${expect}%. `
    + 'If it is not the same cuts as `within`, the two cannot be printed side by side.');
});

test('no page derives the pooled figure from the top and bottom storey bands', () => {
  for (const f of [['app', 'page.jsx'], ['app', 'floors', 'page.jsx'], ['components', 'FloorView.jsx']]) {
    const src = code(...f);
    assert.ok(!/bands\[[^\]]*length\s*-\s*1\]\s*\[2\]\s*\/\s*[\w.?]*bands\[0\]\[2\]/.test(src),
      `${f.join('/')} computes top band over bottom band again. That is floors 46-48 against 1-3, `
      + 'and it printed 144% beside a 10.5% measured on floors 13+ against 1-6.');
    assert.match(src, /\.spread\b/, `${f.join('/')} no longer reads the same-cuts spread`);
  }
});

test('"most" on the homepage and /floors is switched by the figures, not typed', () => {
  const home = code('app', 'page.jsx');
  assert.match(home, /mostly:\s*s4\.within\.p50\s*<\s*s4\.spread\s*\/\s*2/,
    'the homepage no longer derives "mostly" from the two figures');
  assert.match(home, /floorFinding\.mostly\s*\?\s*'Most of/,
    'the homepage headline says "most" without asking the data');
  const floors = code('app', 'floors', 'page.jsx');
  assert.match(floors, /mostly\s*=\s*pooled != null && hdb4 && hdb4\.p50 < pooled \/ 2/,
    '/floors no longer derives "mostly" from the two figures');
  assert.match(floors, /mostly \? 'Most of that/, '/floors says "most" without asking the data');
});

test('the pooled card says it runs above the within figure only where it does', () => {
  const src = code('components', 'FloorView.jsx');
  assert.match(src, /rec\.spread <= rec\.within\.p50/,
    'FloorView says pooling inflates the premium on every card; at the same cuts that is false for about 3 in 10');
});

test('the homepage headline carries its source, period and basis', () => {
  /* Rule 6, and the reason this whole file exists: a figure without its cuts
     beside it is how two definitions ended up in one sentence. */
  const home = code('app', 'page.jsx');
  for (const k of ['floorFinding.source', 'floorFinding.period', 'floorFinding.cut.hi', 'floorFinding.cut.lo', 'floorFinding.blocks']) {
    assert.ok(home.includes(k), `the homepage finding stopped rendering ${k}`);
  }
  assert.ok(storey.source?.hdb && storey.source?.period?.from, 'storey.json lost its source or period');
});

test('the build computes the national spread with the town bar, at the shared cuts', () => {
  const src = code('scripts', 'build-storey.mjs');
  const block = /national\[e\.type\] = \{([\s\S]*?)\};/.exec(src);
  assert.ok(block, 'the national block is gone from build-storey.mjs');
  assert.match(block[1], /spread:\s*usable\(e, BAR\.group\)\s*\?\s*r1\(med\(e\.hi\) \/ med\(e\.lo\) - 1\)/,
    'national spread is no longer e.hi over e.lo — the same buckets `within` is cut from');
});
