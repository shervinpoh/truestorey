import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tilesFor, zoomFor, lonToTileX, latToTileY, tileXToLon, tileYToLat,
         MIN_Z, MAX_Z, MAX_TILES, BASEMAP } from '../lib/tiles.js';

/**
 * The basemap sits under the price map, and the two use different projections.
 * These guard the reason that is allowed.
 */

test('the projection mismatch is negligible at Singapore, and only there', () => {
  // PriceMap is linear in lat/lon; OneMap serves Web Mercator. Over the
  // island's 0.22 degrees the two differ by a hundredth of a pixel. The same
  // shortcut in northern Europe is off by miles, which is why this is measured
  // rather than assumed.
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const [s, n] = [1.23963, 1.46125];
  const mid = (s + n) / 2;
  const fMerc = (mercY(mid) - mercY(s)) / (mercY(n) - mercY(s));
  const fLin = (mid - s) / (n - s);
  assert.ok(Math.abs(fMerc - fLin) * 900 < 0.05,
    `offset on a 900px map is ${(Math.abs(fMerc - fLin) * 900).toFixed(3)}px`);

  // And the same check at 50°N, to show what this file must never be used for.
  const [s2, n2] = [50.0, 50.3];
  const mid2 = (s2 + n2) / 2;
  const f2 = (mercY(mid2) - mercY(s2)) / (mercY(n2) - mercY(s2));
  assert.ok(Math.abs(f2 - 0.5) * 900 > 0.05, 'the shortcut should visibly fail away from the equator');
});

test('tile coordinates round-trip', () => {
  for (const z of [11, 13, 16]) {
    for (const [lat, lon] of [[1.3521, 103.8198], [1.24, 103.69], [1.46, 103.98]]) {
      const x = Math.floor(lonToTileX(lon, z)), y = Math.floor(latToTileY(lat, z));
      assert.ok(tileXToLon(x, z) <= lon && lon <= tileXToLon(x + 1, z), `lon ${lon} at z${z}`);
      assert.ok(tileYToLat(y + 1, z) <= lat && lat <= tileYToLat(y, z), `lat ${lat} at z${z}`);
    }
  }
});

test('the zoom follows the width and stays inside what OneMap serves', () => {
  const island = [1.23963, 103.68523, 1.46125, 103.98781];
  assert.ok(zoomFor(island, 400) < zoomFor(island, 1600), 'a wider map wants more detail');
  for (const w of [1, 400, 900, 4000]) {
    const z = zoomFor(island, w);
    assert.ok(z >= MIN_Z && z <= MAX_Z, `z${z} is outside the served range`);
  }
  // A degenerate view must not throw or ask for the whole world.
  assert.equal(zoomFor([1, 103, 1, 103], 900), MIN_Z);
});

test('a bad view cannot ask for thousands of images', () => {
  // A wrong zoom or a collapsed bbox would otherwise fire off a request storm.
  const whole = tilesFor([-85, -180, 85, 180], 4000);
  assert.ok(whole.length <= MAX_TILES, `${whole.length} tiles requested`);
  for (const t of tilesFor([1.23963, 103.68523, 1.46125, 103.98781], 900)) {
    assert.ok(t.north > t.south, 'a tile with no height');
    assert.ok(t.east > t.west, 'a tile with no width');
  }
});

test('the basemap is OneMap, credited, and not the coloured layer', () => {
  // OneMap's terms require attribution, and it is SLA's own cartography —
  // which is the background version of the rule about not drawing geometry the
  // data does not contain.
  assert.match(BASEMAP.url({ z: 13, x: 6458, y: 4065 }), /^https:\/\/www\.onemap\.gov\.sg\//);
  assert.match(BASEMAP.credit, /OneMap/);
  assert.match(BASEMAP.credit, /Singapore Land Authority/);
  assert.equal(BASEMAP.layer, 'Grey', 'the coloured layer competes with the price bands');
  const map = readFileSync(new URL('../components/PriceMap.jsx', import.meta.url), 'utf8');
  assert.match(map, /BASEMAP\.credit/, 'the credit is not rendered anywhere');
  assert.doesNotMatch(map, /no tile\s*\n?\s*server/, 'the map still claims it has no tile server');
});
