/**
 * The sticky phone header has three independently useful pieces: the mark,
 * the parent link and the menu. On a 375px viewport the menu also repeated its
 * active group, making the row wider than the screen; "Look up +" was visibly
 * clipped before the page itself began. At 320px even the parent name can be
 * too wide, although its arrow and accessible label still fit.
 *
 * These source checks pin the two deliberate reductions. They do not try to
 * calculate font metrics in Node; the breakpoints were verified in-browser at
 * 375px and 320px, and this catches the easy regression of removing either.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const back = readFileSync(new URL('../components/BackLink.jsx', import.meta.url), 'utf8');

test('the mobile header drops duplicated context before it can overflow', () => {
  assert.match(css, /@media\(max-width:420px\)[\s\S]*?\.gnav \.navwhere\{display:none\}/,
    'the mobile menu repeats its active group until the header clips');
  assert.match(css, /@media\(max-width:340px\)[\s\S]*?\.backup\{[^}]*font-size:0/,
    'the parent name cannot yield at the narrow phone edge');
});

test('the arrow-only parent link keeps an explicit accessible name', () => {
  assert.match(back, /aria-label=\{`Back to \$\{up\.label\}`\}/,
    'collapsing the visible parent name would leave an unexplained arrow');
});
