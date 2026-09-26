/**
 * Sunward's geometry, on buildings whose answer is known. The failure that
 * matters is a window reported sunny behind a tower, or shaded by a building
 * whose height nobody published — both would read as fact under a CEA
 * number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rayEntry, windowOn, litAt, sunOnWindow, groundShadow, offBy, sgt, sunAt } from '../lib/sunlight.js';

const box = (cx, cy, half) => [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]];
const LAT = 1.35, LON = 103.82;

test('a ray finds the wall it meets, and nothing it misses', () => {
  const sq = box(50, 0, 10);                       // x 40..60
  assert.ok(Math.abs(rayEntry([0, 0], [1, 0], sq) - 40) < 1e-9);
  assert.equal(rayEntry([0, 0], [-1, 0], sq), Infinity);
  assert.equal(rayEntry([50, 0], [1, 0], sq), 0, 'a ray starting inside is inside');
});

test('the window sits on the facade it faces, just outside it', () => {
  const w = windowOn(box(0, 0, 10), 90, 20);        // east-facing
  assert.ok(Math.abs(w.x - 10.5) < 1e-9 && Math.abs(w.y) < 1e-9 && w.z === 20);
  assert.equal(offBy(350, 10), 20);
});

test('a tower in the line of the sun shades the window; an unmeasured one does not', () => {
  const own = box(0, 0, 10);
  const win = windowOn(own, 270, 10);               // west-facing, 10 m up
  const westSun = { altitude: 20, azimuth: 270, dx: -1, dy: 0 };
  const tower = { m: 60, ring: box(-40, 0, 8) };
  const low = { m: 5, ring: box(-40, 0, 8) };
  const unknown = { m: null, ring: box(-40, 0, 8) };
  const ownB = { m: 30, ring: own };
  assert.equal(litAt(win, 270, westSun, [ownB, tower], 0).why, 'blocked');
  assert.equal(litAt(win, 270, westSun, [ownB, low], 0).lit, true);
  const u = litAt(win, 270, westSun, [ownB, unknown], 0);
  assert.equal(u.lit, true, 'a building with no published height blocked the sun');
  assert.equal(u.unknown, 1, 'and the result must still say it was in the way');
  assert.equal(litAt(win, 270, { altitude: 30, azimuth: 90, dx: 1, dy: 0 }, [ownB], 0).why, 'behind');
  assert.equal(litAt(win, 270, { altitude: -2, azimuth: 270, dx: -1, dy: 0 }, [ownB], 0).why, 'night');
});

test('in Singapore a west window gets the afternoon and an east window the morning', () => {
  const own = { m: 40, ring: box(0, 0, 10) };
  const west = sunOnWindow({ lat: LAT, lon: LON, win: windowOn(own.ring, 270, 20), facing: 270, buildings: [own], ownIndex: 0, year: 2026 });
  const east = sunOnWindow({ lat: LAT, lon: LON, win: windowOn(own.ring, 90, 20), facing: 90, buildings: [own], ownIndex: 0, year: 2026 });
  const am = g => g.reduce((a, row) => a + row.slice(0, 5).reduce((x, y) => x + y, 0), 0);   // 7–12
  // From 2 pm: solar noon here is about 1:10 pm, so an east facade can
  // honestly see the sun until just after 1.
  const pm = g => g.reduce((a, row) => a + row.slice(7).reduce((x, y) => x + y, 0), 0);      // 14–19
  assert.equal(am(west.grid), 0, 'a west window was lit in the morning');
  assert.equal(pm(east.grid), 0, 'an east window was lit in the afternoon');
  assert.ok(pm(west.grid) > 0 && am(east.grid) > 0);
  for (const t of west.totals) assert.ok(t <= 12 * 60);
  assert.ok(west.afternoonMinutesPerYear > 0);
});

test('the clock is Singapore time', () => {
  const noon = sunAt(LAT, LON, sgt(2026, 2, 21, 13, 10));    // near the equinox, solar noon is about 1:10 pm here
  assert.ok(noon.altitude > 80, `the sun at 1:10 pm SGT in March is ${noon.altitude.toFixed(1)}° up`);
});

test('no shadow is drawn for a building of unknown height', () => {
  assert.equal(groundShadow(box(0, 0, 5), null, { altitude: 30, azimuth: 270, dx: -1, dy: 0 }), null);
  assert.ok(groundShadow(box(0, 0, 5), 30, { altitude: 30, azimuth: 270, dx: -1, dy: 0 }).length >= 4);
});

test('the scene and the grid say where heights come from, and that unmeasured buildings are counted', () => {
  const src = readFileSync(new URL('../components/SunStudy.jsx', import.meta.url), 'utf8');
  assert.match(src, /storey count × \{floor\.hdb\} m/);
  assert.match(src, /no published height/);
  assert.match(src, /massing\.small/);
  assert.match(src, /aria-hidden="true"/, 'the canvas is not hidden from assistive tech, though the grid carries its content');
});
