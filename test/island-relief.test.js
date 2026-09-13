/**
 * The Blender relief: what it must not become.
 *
 * Three of these guard failures that have already happened on this site, in
 * this pipeline or one beside it. The fourth guards the one that would be
 * hardest to see.
 *
 * Source-reading, for the reason test/motion.test.js gives at length: the
 * harness is node:test against three dependencies, Node does not strip JSX,
 * and a transform would cost more than the three-dependency rule is worth.
 * Comments are stripped first — the notes in these files quote the exact
 * strings the assertions look for, so an indexOf over the raw source would
 * match the explanation of the bug instead of the fix. That has now caught
 * eight source-reading tests here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), 'utf8');

const stripComments = s => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/"""[\s\S]*?"""/g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*|#)/.test(l)).join('\n');

/* ── 1 ────────────────────────────────────────────────────────────────────
   /mop shipped 2.7MB, /market shipped 2.7MB and /yield shipped 884KB, each
   because a component took one field off a dataset and App Router put the
   whole dataset in the RSC payload behind it. island.json is 85KB of
   coordinates. The caption needs eleven scalars, which is what island-meta
   exists to carry, and the one-word edit that undoes all of it is changing
   which file /map opens. */
test('/map reads the meta file and never the geometry', () => {
  const src = stripComments(read('app', 'map', 'page.jsx'));
  assert.ok(src.includes('island-meta.json'),
    '/map no longer reads data/render/island-meta.json');
  assert.ok(!/island\.json/.test(src),
    '/map now reads island.json — that is 85KB of coordinates into the RSC payload');

  const relief = stripComments(read('components', 'IslandRelief.jsx'));
  assert.ok(!/island\.json|rings|shapes/.test(relief),
    'IslandRelief has been given the geometry; it takes scalars');
});

/* ── 2 ────────────────────────────────────────────────────────────────────
   An editorial thumbnail on this site rendered at 120x360 because the img
   carried height="360" and the stylesheet set aspect-ratio without
   height:auto. An HTML height attribute outranks aspect-ratio, the build was
   clean, every test passed, and the only thing that found it was looking at
   the page. The attributes are needed — they reserve the box and CLS on this
   site is measured — so the rule is that both must be present together. */
test('the render reserves its box and is still allowed to scale', () => {
  const jsx = stripComments(read('components', 'IslandRelief.jsx'));
  assert.match(jsx, /width="2400"/, 'the img lost its intrinsic width');
  assert.match(jsx, /height="1200"/, 'the img lost its intrinsic height');

  const css = stripComments(read('app', 'globals.css'));
  const rule = /\.relief img\{([^}]*)\}/.exec(css);
  assert.ok(rule, '.relief img has no rule; the height attribute now decides the height');
  assert.match(rule[1], /height:\s*auto/,
    '.relief img lost height:auto — height="1200" will win and the render will squash');
});

/* ── 3 ────────────────────────────────────────────────────────────────────
   The first render mapped lo..hi onto the full bar, so a 1.71x ratio between
   the dearest and cheapest town's medians stood 25x taller. It was the most
   impressive version of this picture and it was a chart lying about its axis,
   which is the thing this site refuses everywhere else. Reintroducing it is a
   two-token edit that looks like a contrast improvement. */
test('height is proportional to the figure, not to its place in the range', () => {
  const py = stripComments(read('scripts', 'render', 'island.py'));
  const fn = /def height\(psf\):([\s\S]*?)\ndef /.exec(py);
  assert.ok(fn, 'height() is gone from island.py');
  assert.ok(!/\blo\b/.test(fn[1]),
    'height() reads lo again — that is the range-mapped version that drew 1.71x as 25x');
  assert.match(fn[1], /psf\s*\/\s*hi/,
    'height() no longer divides by hi alone, so it is no longer zero-based');
});

/* ── 4 ────────────────────────────────────────────────────────────────────
   The caption is the only place the reader is told what the heights mean and
   where they came from. Rule 6 is not satisfied by a picture. And the site
   never publishes a valuation, which a relief of prices is one careless
   sentence away from implying. */
test('the caption carries its sources and refuses a valuation', () => {
  const jsx = stripComments(read('components', 'IslandRelief.jsx'));
  for (const field of ['psfSource', 'meta.source', 'accessedAt', 'period']) {
    assert.ok(jsx.includes(field), `the caption dropped ${field}; rule 6 applies to a render too`);
  }
  assert.match(jsx, /[Nn]ot a valuation/,
    'the caption no longer says this is not a valuation');
  for (const banned of ['undervalued', 'best deal', 'expert', 'specialist']) {
    assert.ok(!new RegExp(banned, 'i').test(jsx), `the caption says "${banned}"`);
  }
});

/* ── 5 ────────────────────────────────────────────────────────────────────
   IT SHIPPED WITHOUT A KEY. The first version carried a caption naming
   Queenstown as the dearest town and Choa Chu Kang as the cheapest, above a
   picture in which neither could be found — no legend, no town names, no
   scale. Six colours and a range of heights, and nothing saying what either
   one meant. PriceMap's own header says the relief for its two palest bands
   IS the legend carrying each band's psf. A map without a key is decoration,
   and decoration is what the Blender work was redirected away from. */
test('the relief carries a key, and it is the map\'s own key', () => {
  const meta = JSON.parse(read('data', 'render', 'island-meta.json'));
  assert.ok(Array.isArray(meta.ramp) && meta.ramp.length === 6,
    'island-meta.json lost the ramp, so the legend cannot be built');
  assert.ok(Array.isArray(meta.breaks) && meta.breaks.length === 5,
    'island-meta.json lost the breaks, so the legend has no figures');

  const jsx = stripComments(read('components', 'IslandRelief.jsx'));
  assert.match(jsx, /className="maplegend/,
    'the relief legend no longer reuses .maplegend — two keys imply two scales');
  assert.match(jsx, /Median psf/, 'the key lost its label');
  assert.ok(/breaks\[/.test(jsx),
    'the key no longer prints the break figures, so a colour means nothing');

  /* The picture cannot name a town. Saying so, and pointing at the thing that
     can, is the difference between an overview and a dead end. */
  assert.match(jsx, /No town is named here/,
    'the relief stopped telling the reader that no town is labelled');
  const page = stripComments(read('app', 'map', 'page.jsx'));
  assert.match(page, /id="map"/,
    'the map section lost id="map" and the relief now links to nothing');
});

/* ── 6 ────────────────────────────────────────────────────────────────────
   Degrade, never break. A checkout without the render, or before the export
   has run, must not 500 /map — and if the assets ARE committed they must be
   the small ones, because the whole delivery argument was that Blender writes
   AVIF and WebP itself rather than a 3.3MB PNG going through a converter. */
test('the page survives a missing render, and the committed render stays small', () => {
  const jsx = stripComments(read('components', 'IslandRelief.jsx'));
  assert.match(jsx, /if\s*\(!meta[\s\S]{0,80}return null/,
    'IslandRelief no longer returns null without its meta file');

  for (const [file, capKB] of [['island-a.avif', 60], ['island-a.webp', 90]]) {
    const p = path.join(process.cwd(), 'public', 'editorial', file);
    if (!existsSync(p)) continue;
    const kb = statSync(p).size / 1024;
    assert.ok(kb < capKB, `${file} is ${kb.toFixed(0)}KB, over the ${capKB}KB budget`);
  }
});
