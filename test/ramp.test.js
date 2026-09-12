/**
 * The cheapest third of a town rendered as invisible dots.
 *
 * The ramp was built for the island, where a band shading a whole planning
 * area reads even at low contrast because the shape is large. The record
 * page's locator reuses it at 4px, and there the two cheapest bands measure
 * 1.07:1 and 1.35:1 against the ground they are drawn on — so the blocks that
 * filed the lowest prices simply were not on the map.
 *
 * A map that silently drops part of its data is worse than a monochrome one,
 * because it looks complete. The fix is a stroke on every dot, so the fill is
 * free to carry the value rather than also having to carry visibility.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAMP, quantileBreaks, bandOf, MIN_TO_BAND } from '../lib/ramp.js';

const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = h => {
  const [r, g, b] = [0, 1, 2].map(i => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);

test('the ramp alone cannot make the cheapest bands visible at dot scale', () => {
  // --line2, the town outline fill the dots sit on.
  const ground = '#EDEBE5';
  const faint = RAMP.filter(c => ratio(c, ground) < 1.5);
  assert.ok(faint.length >= 2,
    'the ramp changed — recheck whether the dots still need a stroke to be seen');
});

/* --edge exists because every control border on this site was at 1.21:1. It is
   the token for "a boundary you must be able to find", which is what a dot on
   a map needs before its fill can mean anything. */
test('every shaded dot is given a boundary, whatever its band', () => {
  const src = readFileSync(path.join(process.cwd(), 'components', 'Locator.jsx'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.match(code, /stroke: 'var\(--edge\)'/,
    'the dot outline is gone, so the cheapest bands are invisible again');
  assert.ok(ratio('#8C8B87', '#EDEBE5') >= 2.5,
    '--edge no longer separates a dot from the town fill');
});

/* Two implementations of one calculation is the failure this repo records
   against proceeds.js. Two maps colouring one price differently would not go
   red — the site would just quietly stop being one atlas. */
test('both maps read the ramp from one place', () => {
  for (const f of ['components/IslandMap.jsx', 'components/Locator.jsx']) {
    const src = readFileSync(path.join(process.cwd(), f), 'utf8');
    assert.match(src, /from '\.\.\/lib\/ramp\.js'/, `${f} does not import the shared ramp`);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.doesNotMatch(code, /const RAMP\s*=/, `${f} carries its own copy of the ramp again`);
  }
});

test('six equal-sized groups, not six equal price steps', () => {
  // A handful of expensive outliers must not flatten everything else into one
  // shade, which is what a min-max ramp does.
  const v = [...Array(120).keys()].map(i => 500 + i).concat([4000, 4200, 5000]);
  const breaks = quantileBreaks(v);
  const counts = RAMP.map((_, i) => v.filter(x => bandOf(x, breaks) === i).length);
  const biggest = Math.max(...counts), smallest = Math.min(...counts);
  assert.ok(biggest - smallest <= 4,
    `bands hold ${counts.join('/')} — three outliers have flattened the rest`);
});

test('a sample too small to band is not banded', () => {
  assert.strictEqual(MIN_TO_BAND, RAMP.length * 2, 'the floor is no longer two per band');
  const src = readFileSync(path.join(process.cwd(), 'components', 'Locator.jsx'), 'utf8');
  assert.match(src, /priced\.length >= MIN_TO_BAND/,
    'the locator shades regardless of sample size; six bands over a handful of blocks is noise');
  assert.match(src, /Too few blocks here carry a filed median/,
    'a town that could not be banded no longer says so');
});

test('a value outside the breaks still lands on the ramp', () => {
  const breaks = quantileBreaks([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  assert.strictEqual(bandOf(0, breaks), 0, 'below the first break fell off the ramp');
  assert.strictEqual(bandOf(9999, breaks), RAMP.length - 1, 'above the last break fell off the ramp');
  assert.strictEqual(bandOf(null, breaks), null, 'a missing price was given a colour');
});
