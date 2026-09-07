/**
 * The four ways /cost broke on a phone, and only on a phone.
 *
 * Every one of these passed on a desktop, passed its own unit tests, and was
 * found by a reader on an iPhone. They are asserted against the source for the
 * same reason test/motion.test.js is: node:test against three dependencies
 * cannot lay out CSS, and a transform to render one component would cost more
 * than the three-dependency rule is worth.
 *
 * What is asserted is the EDIT that reintroduces the bug, not the bug's
 * symptom — because in all four cases that edit looks like a tidy-up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
const scen = readFileSync(path.join(process.cwd(), 'components', 'Scenarios.jsx'), 'utf8');

/**
 * A 1px track with a 16px thumb is a 16px-tall target for a finger, and every
 * miss scrolls the page instead of moving the thumb — which is reported as a
 * slider that does not work, because that is what it is. The height is the hit
 * area and carries no visual weight, so it reads as removable padding.
 */
test('the range input keeps a finger-sized hit area', () => {
  const rule = /input\[type=range\]\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the base input[type=range] rule is gone');
  const h = /height:(\d+(?:\.\d+)?)px/.exec(rule[1]);
  assert.ok(h, 'input[type=range] declares no height — the thumb is the target again');
  assert.ok(Number(h[1]) >= 44, `range hit area is ${h[1]}px; 44 is the platform minimum`);
});

/**
 * A horizontal drag inside a range input must not be claimed by the page's
 * vertical scroll, and a swipe that runs out of table must not carry on into
 * the page behind it — the second slides the whole column sideways and looks
 * like a broken layout rather than a table the reader dragged.
 */
test('touch gestures stay inside the control they started in', () => {
  assert.match(css, /input\[type=range\]\{[^}]*touch-action:/,
    'the range input no longer declares touch-action');
  assert.match(css, /\.tablewrap\{[^}]*overscroll-behavior-x:contain/,
    '.tablewrap no longer contains its own overscroll');
});

/**
 * min-width:420px on a table is wider than every phone sold. The figures are
 * pinned right, so what the forced sideways scroll takes away is the LABELS,
 * and every row becomes a number with no name on it. min() keeps the floor
 * wherever there is room for it and drops it where there is not.
 */
/* The land trail's table is seven columns of different natures — two company
   names, three figures that must not wrap, a date — and no phone holds it.
   Scrolling it sideways is the design, and .bidtable is the same table under a
   second class. They are named here so the omission reads as considered. */
const WIDE_BY_DESIGN = new Set(['.landtable', '.bidtable']);

test('no table sets a fixed min-width wider than a phone', () => {
  for (const m of css.matchAll(/(\.[\w.-]*table[\w.-]*)\{([^}]*)\}/g)) {
    if (WIDE_BY_DESIGN.has(m[1])) continue;
    const fixed = /min-width:(\d+)px/.exec(m[2]);
    if (fixed) {
      assert.ok(Number(fixed[1]) <= 360,
        `${m[1]} sets min-width:${fixed[1]}px — wider than a phone. The figures are pinned right, ` +
        'so the forced sideways scroll takes away the LABELS and every row becomes a number with ' +
        'no name on it. Use min-width:min(Npx,100%), or add it to WIDE_BY_DESIGN with a reason.');
    }
  }
});

/**
 * `.rentcmp b` was a descendant selector. Downside's cards carry inline <b>
 * figures INSIDE .hint prose — "against S$385,072 of cash you put in" — so
 * every one of them became a 23px block, breaking each sentence into a column
 * of numbers with the full stop stranded on its own line. Third time this
 * exact selector shape has done this on this site.
 */
test('a card headline rule cannot capture the figures inside its prose', () => {
  for (const cls of ['rentcmp', 'scenfoot', 'scenslider']) {
    const descendant = new RegExp(`\\.${cls} b\\{[^}]*display:block`);
    assert.doesNotMatch(css, descendant,
      `.${cls} b is a descendant selector and will catch inline <b> inside .hint. Use > b.`);
  }
});

/**
 * The slider's state is the PERCENT. Holding the rate and rendering
 * value={rate * 100} puts 3.5000000000000004 into a controlled input whose
 * step is 0.5: the browser snaps the DOM value back, React re-asserts the
 * unsnapped one, and on a touchscreen — where a drag is a stream of small
 * moves — the thumb sticks. Reintroduced by anything that multiplies on the
 * way into `value`.
 */
test('every scenario default lands exactly on a slider step', () => {
  const step = Number(/step=\{([\d.]+)\}/.exec(scen)[1]);
  const min = Number(/min=\{(-?[\d.]+)\}/.exec(scen)[1]);
  const max = Number(/max=\{(-?[\d.]+)\}/.exec(scen)[1]);
  const defaults = [...scen.matchAll(/pct:\s*(-?[\d.]+)/g)].map(m => Number(m[1]));
  assert.equal(defaults.length, 3, 'expected three scenario defaults');
  for (const d of defaults) {
    assert.ok(d >= min && d <= max, `${d} is outside the slider's own range`);
    const steps = (d - min) / step;
    assert.equal(steps, Math.round(steps), `${d} is not a whole number of ${step} steps from ${min}`);
  }
});

test('the slider value is used as typed, not scaled on the way in', () => {
  const tag = /<input[^>]*type="range"[\s\S]*?\/>/.exec(scen)[0];
  assert.match(tag, /value=\{s\.pct\}/, 'the range value is computed rather than passed through');
  assert.doesNotMatch(tag, /\*\s*100|\/\s*100/,
    'the range value is being scaled inline — that is the float round-trip that broke the drag');
});

/**
 * Wrapping the whole card in a <label> forwards a tap ANYWHERE inside it,
 * including the two lines explaining the reader's assumption, to the range
 * input — which jumps the value to wherever the finger landed. Reading the
 * note about your assumption must not change your assumption.
 */
test('the slider card does not wrap its own explanation in a label', () => {
  assert.doesNotMatch(scen, /<label[^>]*className="scenslider"/,
    'the scenario card is a <label> again: tapping its hint text will move the slider');
  assert.match(scen, /htmlFor=\{`scen-\$\{s\.id\}`\}/, 'the slider has lost its bound label');
});
