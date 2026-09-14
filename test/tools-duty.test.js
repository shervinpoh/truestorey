/**
 * The stamp duty tool read a property that does not exist, for months.
 *
 * `<div className="big">{money(b.total + (a?.duty ?? 0))}</div>`
 *
 * absd() returns `{ rate, total }`. There is no `duty` on it. So the headline
 * on /tools?calc=duty was Buyer's Stamp Duty alone, and every profile that
 * attracts ABSD was understated:
 *
 *   SPR, 1st property   shown S$32,600   actual S$92,600    -S$60,000
 *   Foreigner           shown S$32,600   actual S$752,600   -S$720,000
 *   Entity              shown S$32,600   actual S$812,600   -S$780,000
 *   Citizen, 3rd+       shown S$32,600   actual S$392,600   -S$360,000
 *   SSD, bought 1Jun24  shown S$0        actual S$48,000    -S$48,000
 *
 * ── WHY IT SURVIVED SO LONG ────────────────────────────────────────────────
 * Three things, each reasonable on its own.
 *
 * bsd() returns `bands`, and every band carries `.duty`. So `.duty` genuinely
 * IS the convention in the neighbouring structure, and reaching for it on
 * absd() is the natural mistake rather than a careless one.
 *
 * `?? 0` turned the undefined into a silent, plausible zero.
 *
 * And money() renders a non-finite number as an em dash, so the page read
 * "ABSD — at 60%". That does not look like a bug. It looks like a considered
 * statement that no ABSD is payable, sitting next to a correct rate.
 *
 * Nothing could catch it except adding the numbers up by hand, which is the
 * one thing a reader of a stamp duty calculator will not do.
 *
 * ── WHAT THIS TEST DOES ────────────────────────────────────────────────────
 * Not a spot check on today's three lines — those are fixed. It reads every
 * property the component takes off bsd(), absd() and ssd() and asserts each
 * one exists on what those functions actually return. A rename in either
 * direction, or a fourth figure wired to a fourth wrong key, goes red.
 *
 * Source-reading for the reason test/motion.test.js sets out: node:test over
 * three dependencies, Node does not strip JSX, and a transform costs more than
 * the three-dependency rule is worth. Comments are stripped first — the note
 * above quotes `.duty` repeatedly, and an un-stripped scan would match the
 * explanation instead of the code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bsd, absd, ssd } from '../lib/calc/stampDuty.js';

const stripComments = s => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const src = stripComments(
  readFileSync(path.join(process.cwd(), 'components', 'Tools.jsx'), 'utf8'));

/** The body of Duty(), so no other calculator on the page can satisfy these. */
function dutyBody() {
  const start = src.indexOf('function Duty()');
  assert.notEqual(start, -1, 'Duty() is gone from Tools.jsx');
  const after = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, after === -1 ? src.length : after);
}

const P = 1200000;

test('every field the tool reads off a duty function actually exists on it', () => {
  const body = dutyBody();
  const shapes = {
    b: bsd(P),
    a: absd(P, 'FOREIGNER', 1),
    s: ssd(P, new Date('2024-06-01')),
  };
  for (const [v, obj] of Object.entries(shapes)) {
    const used = new Set();
    for (const m of body.matchAll(new RegExp(`\\b${v}\\??\\.([a-zA-Z_][\\w]*)`, 'g'))) {
      used.add(m[1]);
    }
    assert.ok(used.size, `the tool reads nothing off \`${v}\` any more — has it been rewired?`);
    for (const key of used) {
      assert.ok(key in obj,
        `Duty() reads \`${v}.${key}\`, which ${v === 'a' ? 'absd()' : v === 's' ? 'ssd()' : 'bsd()'} ` +
        `does not return. It returns: ${Object.keys(obj).join(', ')}. ` +
        `This is exactly how the total shipped as BSD alone.`);
    }
  }
});

test('the purchase total adds ABSD rather than swallowing it', () => {
  const body = dutyBody();
  /* The precise failure was a nullish coalesce over a missing key. A guard on
     the SHAPE of the expression is brittle, so this asserts the component
     names the field that carries the money — if the total stops mentioning
     a.total, it is not adding ABSD to anything. */
  const total = /Total stamp duty on purchase[\s\S]{0,400}?money\(([^)]*\([^)]*\)[^)]*|[^)]*)\)/.exec(body);
  assert.ok(total, 'the purchase total figure is no longer recognisable');
  assert.match(total[1], /b\.total/, 'the purchase total stopped including BSD');
  assert.match(total[1], /a\.total/, 'the purchase total stopped including ABSD — the original bug');
});

test('the figures the tool should now print, pinned', () => {
  /* If a rate changes these move, and they should — the point is that the
     COMPOSITION is right, not that 60% is forever. A failure here means
     either a rate moved (update it) or the arithmetic broke (do not). */
  assert.equal(bsd(P).total, 32600);
  for (const [profile, count, rate, duty] of [
    ['SC', 1, 0, 0],
    ['SPR', 1, 0.05, 60000],
    ['FOREIGNER', 1, 0.60, 720000],
    ['ENTITY', 1, 0.65, 780000],
    ['SC', 3, 0.30, 360000],
  ]) {
    const a = absd(P, profile, count);
    assert.equal(a.rate, rate, `${profile} x${count} rate`);
    assert.equal(a.total, duty, `${profile} x${count} duty`);
    assert.equal(a.duty, undefined,
      'absd() has grown a `duty` key. Either finish the rename everywhere or drop it — ' +
      'two names for one figure is what caused this bug.');
  }
  /* EXPLICIT SALE DATES. The first version of this test passed only a purchase
     date and asserted 4%, copying the rate off a screenshot of the live page.
     That was wrong twice over: ssd() defaults the sale date to TODAY, so the
     assertion silently depended on when it ran, and 1 Jun 2024 to 14 Sep 2025
     is 1.29 years, which is the 8% band — the page showed 4% only because the
     day it was screenshotted was 2026, at 2.29 years. A duty test whose answer
     changes with the calendar is not a test. */
  const bought = new Date('2024-06-01');
  for (const [sale, rate, duty] of [
    ['2024-09-01', 0.12, 144000],   // 0.25 yr — within 1
    ['2025-09-14', 0.08, 96000],    // 1.29 yr — within 2
    ['2026-09-14', 0.04, 48000],    // 2.29 yr — within 3
    ['2027-09-01', 0.00, 0],        // 3.25 yr — free
  ]) {
    const s = ssd(P, bought, new Date(sale));
    assert.equal(s.rate, rate, `legacy SSD sold ${sale}`);
    assert.equal(s.total, duty, `legacy SSD sold ${sale}`);
    assert.equal(s.duty, undefined, 'ssd() has grown a `duty` key — see above');
  }
});
