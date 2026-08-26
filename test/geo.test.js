import test from 'node:test';
import assert from 'node:assert/strict';
import { haversine, nearest, band, schoolBands, fmtDistance, nearBoundary } from '../lib/geo.js';

/* Real Singapore coordinates, so a sign error or a swapped lat/lon shows up as
   a wrong answer rather than as a plausible one. */
const BISHAN_MRT   = { lat: 1.35112, lon: 103.84819 };
const JUNCTION8    = { lat: 1.35047, lon: 103.84889 };  // ~110m from the station
const AMK_MRT      = { lat: 1.36993, lon: 103.84961 };  // ~2.1km north
const RAFFLES      = { lat: 1.28437, lon: 103.85152 };  // ~7.4km south

test('haversine matches known distances within 3%', () => {
  const d = haversine(BISHAN_MRT.lat, BISHAN_MRT.lon, AMK_MRT.lat, AMK_MRT.lon);
  assert.ok(d > 2020 && d < 2160, `Bishan→AMK was ${Math.round(d)}m, expected ~2090m`);
  const far = haversine(BISHAN_MRT.lat, BISHAN_MRT.lon, RAFFLES.lat, RAFFLES.lon);
  assert.ok(far > 7300 && far < 7600, `Bishan→Raffles was ${Math.round(far)}m, expected ~7450m`);
});

test('haversine is symmetric and zero at a point', () => {
  const a = haversine(1.3, 103.8, 1.4, 103.9);
  const b = haversine(1.4, 103.9, 1.3, 103.8);
  assert.equal(Math.round(a), Math.round(b));
  assert.equal(Math.round(haversine(1.3, 103.8, 1.3, 103.8)), 0);
});

test('nearest sorts by distance and respects k', () => {
  const pts = [
    { name: 'AMK', ...AMK_MRT }, { name: 'J8', ...JUNCTION8 }, { name: 'Raffles', ...RAFFLES },
  ];
  const got = nearest(BISHAN_MRT.lat, BISHAN_MRT.lon, pts, { k: 2 });
  assert.deepEqual(got.map(g => g.name), ['J8', 'AMK']);
  assert.ok(got[0].m < got[1].m);
});

test('nearest drops anything beyond `within` rather than returning it as far', () => {
  const pts = [{ name: 'AMK', ...AMK_MRT }, { name: 'Raffles', ...RAFFLES }];
  const got = nearest(BISHAN_MRT.lat, BISHAN_MRT.lon, pts, { k: 5, within: 1500 });
  assert.equal(got.length, 0, 'nothing is within 1.5km, so nothing should come back');
});

test('nearest carries the point through and adds rounded metres', () => {
  const [hit] = nearest(BISHAN_MRT.lat, BISHAN_MRT.lon, [{ name: 'J8', line: 'NSL', ...JUNCTION8 }], { k: 1 });
  assert.equal(hit.name, 'J8');
  assert.equal(hit.line, 'NSL');
  assert.equal(hit.m, Math.round(hit.m));
});

test('nearest ignores points with missing or non-numeric coordinates', () => {
  const pts = [{ name: 'bad' }, { name: 'worse', lat: null, lon: 'x' }, { name: 'ok', ...JUNCTION8 }];
  const got = nearest(BISHAN_MRT.lat, BISHAN_MRT.lon, pts, { k: 5 });
  assert.deepEqual(got.map(g => g.name), ['ok']);
});

test('nearest returns nothing for an unplaced record', () => {
  assert.deepEqual(nearest(undefined, undefined, [{ name: 'J8', ...JUNCTION8 }]), []);
  assert.deepEqual(nearest(1.3, 103.8, null), []);
});

/* The band boundaries decide what the page tells someone about school
   priority, so they are asserted exactly rather than approximately. */
test('MOE bands split at exactly 1000m and 2000m', () => {
  assert.equal(band(0), '1km');
  assert.equal(band(1000), '1km');
  assert.equal(band(1000.1), '2km');
  assert.equal(band(2000), '2km');
  assert.equal(band(2000.1), null);
  assert.equal(band(NaN), null);
});

test('schoolBands puts each school in one band, nearest first', () => {
  const here = BISHAN_MRT;
  const mk = (name, dLat) => ({ name, lat: here.lat + dLat, lon: here.lon });
  // one degree of latitude is ~111,195m on the sphere haversine uses,
  // so 0.008 deg is ~890m (inside 1km) and 0.009 deg is ~1001m (outside it)
  const schools = [mk('far', 0.015), mk('close', 0.002), mk('mid', 0.008), mk('justover', 0.009), mk('offisland', 0.5)];
  const { within1, within2 } = schoolBands(here.lat, here.lon, schools);
  assert.deepEqual(within1.map(s => s.name), ['close', 'mid']);
  assert.deepEqual(within2.map(s => s.name), ['justover', 'far']);
  assert.ok(within1[0].m < within1[1].m);
});

test('fmtDistance never rounds across the 1km line', () => {
  assert.equal(fmtDistance(980), '980m');
  assert.equal(fmtDistance(999), '999m');
  assert.equal(fmtDistance(1000), '1.0km');
  assert.equal(fmtDistance(1240), '1.2km');
  assert.equal(fmtDistance(NaN), '—');
});

test('nearBoundary flags only distances that could fall either side of 1km', () => {
  assert.ok(nearBoundary(960));
  assert.ok(nearBoundary(1040));
  assert.ok(!nearBoundary(900));
  assert.ok(!nearBoundary(1100));
  assert.ok(!nearBoundary(NaN));
});

test('the bounding-box prefilter never drops a point sitting exactly on the cutoff', () => {
  // Due east, which is where an ellipsoid-vs-sphere mismatch in the prefilter
  // bites hardest. A school at exactly 1000m must survive to be measured.
  const here = { lat: 1.35, lon: 103.85 };
  for (const bearing of ['east', 'north']) {
    const deg = 1000 / ((Math.PI * 6371008.8) / 180);
    const p = bearing === 'east'
      ? { name: bearing, lat: here.lat, lon: here.lon + deg / Math.cos((here.lat * Math.PI) / 180) }
      : { name: bearing, lat: here.lat + deg, lon: here.lon };
    const got = nearest(here.lat, here.lon, [p], { k: 1, within: 1000 });
    assert.equal(got.length, 1, `a point due ${bearing} at 1000m was filtered out before it was measured`);
    assert.ok(Math.abs(got[0].m - 1000) <= 1, `expected ~1000m, got ${got[0].m}m`);
  }
});
