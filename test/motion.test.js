/**
 * Motion.jsx — a guard on the count-up, not on the animation.
 *
 * These assertions read the source rather than render the component, for the
 * same reason test/guides.test.js reads the published guides: the harness is
 * node:test against three dependencies, Node does not strip JSX, and adding a
 * transform to unit-test one component would cost more than the component is
 * worth. The precedent is deliberate, not laziness.
 *
 * WHAT THIS CATCHES, and why it is worth a brittle-looking test:
 *
 * `Figure` shipped with its IntersectionObserver effect keyed on
 * `[value, duration]`. Every recalculation therefore ran the cleanup, the
 * cleanup cancelled the in-flight requestAnimationFrame, and the re-run of the
 * effect returned early because the run-once latch was already set. Nothing
 * else wrote `shown`, so the figure froze mid-ease on an arbitrary fraction of
 * the truth and then ignored every subsequent input without any error.
 *
 * On /plan that read S$12,516 where the answer was S$57,100 — sitting directly
 * above a table that had the right number the whole time — and it stayed there
 * while the reader changed their income. Every figure on this site is
 * published under a CEA registration. A wrong number that will not move is the
 * worst of the available failures, because it looks settled.
 *
 * Putting `value` back in that dependency array is a one-word edit that looks
 * like a correctness fix and silently reintroduces all of it. That is the
 * failure someone could actually cause, so that is what is asserted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.join(process.cwd(), 'components', 'Motion.jsx'), 'utf8');

/** The body of `Figure`, so `Reveal`'s effects cannot satisfy these by accident. */
function figureBody() {
  const start = src.indexOf('export function Figure');
  assert.notEqual(start, -1, 'Figure is no longer exported from Motion.jsx');
  const end = src.indexOf('export function Reveal');
  return src.slice(start, end === -1 ? undefined : end);
}

test('the count-up effect is not keyed on the value it animates', () => {
  const body = figureBody();
  // Every dependency array in Figure that belongs to an effect observing the
  // element. `value` in any of them restores the freeze.
  const observerEffect = body.slice(body.indexOf('IntersectionObserver'));
  const deps = observerEffect.match(/\}, \[([^\]]*)\]\)/);
  assert.ok(deps, 'could not find the observer effect dependency array');
  const listed = deps[1].split(',').map(s => s.trim()).filter(Boolean);
  assert.ok(
    !listed.includes('value'),
    'The IntersectionObserver effect in Figure is keyed on `value` again. ' +
    'That cancels the in-flight frame on every recalculation and strands the ' +
    'figure on a wrong number for good. Key it on [duration].'
  );
});

test('a figure that is not mid-count follows its value', () => {
  const body = figureBody();
  // The tracking effect. Without it `shown` is only ever written from inside
  // the animation loop, which is the whole bug.
  assert.match(
    body,
    /animating\.current[\s\S]{0,40}setShown\(value\)/,
    'Figure no longer writes `shown` outside the animation loop. A headline ' +
    'figure must equal its value whenever no count is running, or it stops ' +
    'responding to input the moment the first animation ends.'
  );
});

test('the count lands on the current target, not the one it started with', () => {
  const body = figureBody();
  assert.match(
    body,
    /target\.current/,
    'Figure captures its target once instead of reading it each frame. A ' +
    'value that changes mid-count would then be overwritten by a stale one ' +
    'when the animation lands.'
  );
});

test('an interrupted count still lands', () => {
  const body = figureBody();
  // requestAnimationFrame does not run in a background tab. Without a timer
  // that fires regardless, a reader who switches away 20ms into a count comes
  // back to a figure stranded on frame one — with the animating latch still
  // set, so every later value is refused in silence. This was the second route
  // into the same stranded-number bug and it was reproduced, not theorised:
  // the figure sat at S$9,396 against a true S$487,907 in the table below it.
  assert.match(
    body,
    /setTimeout\(\s*land/,
    'Figure no longer sets a deadline for its count. A count interrupted by a ' +
    'backgrounded tab would never clear the animating latch, and the figure ' +
    'would ignore every subsequent value.'
  );
  assert.match(
    body,
    /animating\.current = false;[\s\S]{0,60}setShown\(target\.current\)/,
    'The settle path no longer clears the animating latch and lands on the ' +
    'current target. Both must happen together or the figure stays stuck.'
  );
});

test('the real value is what renders before any animation runs', () => {
  const body = figureBody();
  // SSR and no-JS readers must get the figure, per the rules at the top of
  // Motion.jsx. useState seeded with `value` is what guarantees it.
  assert.match(
    body,
    /useState\(value\)/,
    'Figure no longer seeds its state with the real value, so server-rendered ' +
    'HTML and readers without JS would receive a placeholder instead of the ' +
    'number the page exists to show.'
  );
});

test('reduced motion is decided before any work happens', () => {
  assert.match(
    src,
    /prefers-reduced-motion: reduce/,
    'The reduced-motion check has gone from Motion.jsx.'
  );
  const body = figureBody();
  assert.ok(
    body.indexOf('still()') < body.indexOf('IntersectionObserver'),
    'Figure consults still() after setting up the observer. Someone who asked ' +
    'their OS for less movement should never have an observer attached at all.'
  );
});

/* ── reduced motion, everywhere something moves ─────────────────────────────
 *
 * prefers-reduced-motion was honoured by the components in Motion.jsx and by
 * nothing outside it. The map eased its viewport onto a town over 380ms and
 * Blindspot smooth-scrolled a screen-and-a-half report into view — the two
 * largest movements on the site, both unconditional. Someone who asks the
 * operating system for less motion is asking the whole page.
 *
 * Source-read for the same reason the rest of this file is: Node does not
 * strip JSX, and a transform would cost more than the three-dependency rule
 * is worth.
 */
const readSrc = f => readFileSync(new URL(`../components/${f}`, import.meta.url), 'utf8');

test('still() is exported, so it has one definition rather than one per file', () => {
  assert.match(readSrc('Motion.jsx'), /export const still = \(\) =>/);
});

test('every viewport movement outside Motion.jsx asks first', () => {
  for (const f of ['PriceMap.jsx', 'BlindspotReport.jsx', 'SectionNav.jsx']) {
    const src = readSrc(f);
    assert.match(src, /import \{[^}]*\bstill\b[^}]*\} from '\.\/Motion\.jsx'/,
      `${f} moves the viewport without importing still()`);
    assert.match(src, /still\(\)/, `${f} imports still() and never calls it`);
  }
});

test('no smooth scroll is unconditional', () => {
  for (const f of ['BlindspotReport.jsx', 'SectionNav.jsx']) {
    const src = readSrc(f);
    for (const m of src.matchAll(/behavior:\s*([^,}]+)/g)) {
      assert.match(m[1], /still\(\)/,
        `${f} has a scroll behavior that ignores reduced motion: ${m[1].trim()}`);
    }
  }
});

/* The map's box is reserved by CSS before hydration. It carried
 * `height: size.h` with size starting at { w: 0, h: 0 }, so the server drew a
 * zero-height map and hydration shoved the legend, the town list and the rest
 * of the page down by ~720px on desktop after paint. */
test('the map reserves its own box before any JavaScript runs', () => {
  const src = readSrc('PriceMap.jsx');
  assert.match(src, /className="mapwrap"[^>]*style=\{\{ aspectRatio: aspect \}\}/,
    'the map wrapper no longer reserves its aspect ratio in CSS');
  assert.doesNotMatch(src, /className="mapwrap"[^>]*height: size\.h/,
    'the wrapper height is back to being set only after hydration');
  // Height measured from the box, never recomputed from the ratio — two
  // roundings of one number put the canvas a pixel proud of its own wrapper.
  assert.match(src, /h: el\.clientHeight/);
});

/* The record section bar used to discover its anchors in an effect. That made
 * the server render no bar at all, then hydration inserted 43px above the
 * headline figure. RecordPage already knows which optional sections it will
 * render, so making the browser rediscover them was both slower and less
 * truthful about the first frame. */
test('the record section bar exists before hydration', () => {
  const nav = readSrc('SectionNav.jsx');
  const page = readSrc('RecordPage.jsx');
  assert.match(page, /<SectionNav ids=\{sectionIds\}/,
    'RecordPage no longer tells SectionNav which sections it renders');
  assert.match(nav, /function SectionNav\(\{ ids \}\)/,
    'SectionNav no longer accepts the server-known section ids');
  assert.doesNotMatch(nav, /\[items,\s*setItems\]/,
    'SectionNav is discovering its whole contents after paint again');
});
