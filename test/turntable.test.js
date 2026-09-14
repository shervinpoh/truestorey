/**
 * The unit turntable on /floorplan: what it must not become.
 *
 * Source-reading for the reason test/motion.test.js sets out — node:test over
 * three dependencies, Node does not strip JSX. Comments are stripped first,
 * because the notes in these files quote the exact strings being searched for
 * and an un-stripped scan matches the explanation instead of the code. That
 * mistake has now been made eight times on this site.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), 'utf8');
const stripComments = s => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const page = stripComments(read('app', 'floorplan', 'page.jsx'));
const comp = stripComments(read('components', 'UnitTurntable.jsx'));

/* ── 1 ────────────────────────────────────────────────────────────────────
   The page prints room sizes beside the picture, and two transforms sit
   between the traced spec and the geometry on screen: the area-derived scale,
   and the snap that pulls near-miss edges onto shared lines and moves a
   dimension by up to 15cm doing it. Deriving those in JavaScript to fill the
   table is the failure this repo records against proceeds.js and the price
   ramp — and worse here, because nothing would go red. The table would simply
   disagree with the picture by a few centimetres, forever. */
test('the room table comes from what was rendered, not from the spec', () => {
  assert.match(page, /unit-a-rooms\.json/,
    '/floorplan stopped reading the renderer’s own output');
  assert.ok(!/data\/layouts|traced-unit-a\.json/.test(page),
    '/floorplan now reads the traced spec directly and will recompute the scale itself');
  for (const banned of ['Math.sqrt', 'areaSqm /', '/ traced']) {
    assert.ok(!page.includes(banned),
      `/floorplan contains \`${banned}\` — it is solving the scale again instead of reading it`);
  }
});

/* ── 2 ────────────────────────────────────────────────────────────────────
   requestIdleCallback only runs when the browser decides it is idle, and a
   page that is not compositing — a background tab, a hidden pane — may never
   be. The first version passed no timeout, and the readout sat on
   "loading views…" indefinitely. CLAUDE.md already records this site shipping
   the same class of bug once, where a count-up keyed on requestAnimationFrame
   froze because rAF does not run in a background tab. */
test('the frame preload cannot starve', () => {
  assert.match(comp, /requestIdleCallback/,
    'the preload no longer defers, which puts 120KB on the critical path');
  const call = /requestIdleCallback\s*\(([\s\S]{0,120}?)\)/.exec(comp);
  assert.ok(call, 'requestIdleCallback is referenced but never called');
  assert.match(call[1], /timeout/,
    'requestIdleCallback was called without a timeout — on a page that never goes idle ' +
    'the callback never runs and no frame past the first is ever fetched');
});

/* ── 3 ────────────────────────────────────────────────────────────────────
   An editorial thumbnail on this site rendered at 120x360 because the img
   carried a height attribute and the stylesheet set aspect-ratio without
   height:auto. The attributes are needed — they reserve the box, and CLS here
   is measured — so the rule is that both appear together. */
test('the frame reserves its box and is still allowed to scale', () => {
  assert.match(comp, /width="1400"/, 'the frame lost its intrinsic width');
  assert.match(comp, /height="1400"/, 'the frame lost its intrinsic height');
  const css = stripComments(read('app', 'globals.css'));
  const rule = /\.ttstage img\{([^}]*)\}/.exec(css);
  assert.ok(rule, '.ttstage img has no rule; the height attribute now decides the height');
  assert.match(rule[1], /height:\s*auto/,
    '.ttstage img lost height:auto — height="1400" will win and the frame will squash');
  assert.match(/\.ttstage\{([^}]*)\}/.exec(css)?.[1] ?? '', /touch-action:\s*none/,
    '.ttstage lost touch-action:none — dragging it on a phone scrolls the page instead');
});

/* ── 4 ────────────────────────────────────────────────────────────────────
   The flag means a person checked the plan, its source and its date. It does
   not mean the arithmetic agreed with itself, which it always will. A page
   that shows traced geometry without saying so is claiming a survey. */
test('unverified geometry says so on the page', () => {
  assert.match(page, /!model\.verified/,
    '/floorplan stopped checking whether the geometry has been verified');
  assert.match(page, /has not been checked against the source plan/,
    'the unverified notice is gone — the page now presents a trace as a survey');
  assert.match(page, /[Nn]ot a survey/, 'the provenance line dropped its refusal');

  const model = JSON.parse(read('public', 'layouts', 'unit-a-rooms.json'));
  assert.equal(typeof model.verified, 'boolean', 'the sidecar lost its verified flag');
  assert.ok(Array.isArray(model.rooms) && model.rooms.length,
    'the sidecar carries no rooms');
  assert.ok(model.areaBasis && !/includeInArea|true|false/.test(model.areaBasis),
    'areaBasis leaks a code identifier into reader-facing prose');
});

/* ── 5 ────────────────────────────────────────────────────────────────────
   Sixteen frames exist and stay small. The whole argument for a stepped
   sequence over a 3D viewer was that it costs less than a photograph; a frame
   that grows past that budget quietly undoes it. */
test('every frame exists in both formats and stays within budget', () => {
  let avif = 0;
  for (let i = 0; i < 16; i++) {
    const n = String(i).padStart(2, '0');
    for (const [ext, cap] of [['avif', 40], ['webp', 90]]) {
      const p = path.join(process.cwd(), 'public', 'layouts', `unit-a-PROVISIONAL-${n}.${ext}`);
      assert.ok(existsSync(p), `frame ${n}.${ext} is missing — the rotation will jump`);
      const kb = statSync(p).size / 1024;
      assert.ok(kb < cap, `frame ${n}.${ext} is ${kb.toFixed(0)}KB, over the ${cap}KB budget`);
      if (ext === 'avif') avif += kb;
    }
  }
  assert.ok(avif < 400, `the AVIF rotation totals ${avif.toFixed(0)}KB; it should stay under 400`);
});
