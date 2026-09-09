/**
 * Astronomy, and the one place this site computes a figure instead of reading
 * one.
 *
 * Every other number here comes from a published dataset, because a figure the
 * site cannot source is a figure it does not print. Solar position is the
 * exception that does not break the rule: it is determined by a latitude, a
 * longitude and a moment, checkable by anyone with the same formulas, and it
 * does not change when a dataset refreshes.
 *
 * That standing depends entirely on it being RIGHT, so it is checked against
 * facts about Singapore that can be verified independently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solarPosition, sunsetAzimuth, sunsetArc, lowSunWindow, bearingTo, compass, LOW_SUN_DEG }
  from '../lib/sun.js';
import { storeysIn } from '../lib/blindspot/measure.js';

const LAT = 1.3521, LON = 103.8198;              // Singapore
const noonOn = iso => {
  let best = { altitude: -90 }, at = null;
  for (let m = 0; m < 1440; m += 1) {
    const t = new Date(Date.parse(`${iso}T00:00:00Z`) + m * 60000);
    const p = solarPosition(LAT, LON, t);
    if (p.altitude > best.altitude) { best = p; at = t; }
  }
  return { ...best, at };
};

test('the sun is nearly overhead at the equinox, and never far off it', () => {
  // Singapore is 1.35° from the equator, so at the equinoxes the noon sun is
  // within a degree and a half of vertical. Anything else means the formulas
  // are wrong in a way no amount of prose would rescue.
  assert.ok(noonOn('2026-03-20').altitude > 87, 'equinox noon should be near 90°');
  // At the solstices it is 23.4° off, so about 65°.
  assert.ok(Math.abs(noonOn('2026-12-21').altitude - 65.2) < 1.5);
  assert.ok(Math.abs(noonOn('2026-06-21').altitude - 67.9) < 1.5);
});

test('solar noon is about an hour after clock noon, which is a fact about the time zone', () => {
  // Singapore keeps UTC+8 but sits 16° west of that zone's meridian, so its
  // clock runs roughly 64 minutes ahead of its sun. A solar noon at 12:00
  // would mean the longitude is being ignored.
  const at = noonOn('2026-09-15').at;
  const sgHour = Number(at.toLocaleString('en-SG', { hour: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }));
  assert.equal(sgHour, 13, `solar noon came out at ${sgHour}:00 SGT, expected 13`);
});

test('the sunset arc is the 47° swing the feature exists to describe', () => {
  const arc = sunsetArc(LAT);
  assert.ok(Math.abs(arc.from - 246.6) < 0.5, `December sunset ${arc.from}`);
  assert.ok(Math.abs(arc.to - 293.4) < 0.5, `June sunset ${arc.to}`);
  assert.ok(Math.abs(arc.atEquinox - 270) < 0.5, 'the equinox sun must set due west');
  assert.ok(arc.to - arc.from > 45, 'the swing is the whole point; it must not collapse');
  assert.equal(compass(arc.atEquinox), 'W');
});

test('a latitude with no sunset is refused rather than returned as a number', () => {
  // Above the Arctic circle at the solstice there is no sunset. cos(A) leaves
  // the domain, and the honest answer is null rather than NaN dressed as a
  // bearing.
  assert.equal(sunsetAzimuth(80, 23.44), null);
  assert.ok(Number.isFinite(sunsetAzimuth(LAT, 0)));
});

test('the low-sun hour is the last hour, and it is stated not hidden', () => {
  const w = lowSunWindow(LAT, LON, new Date('2026-09-15T00:00:00Z'));
  assert.ok(w, 'there is a low-sun window every day at this latitude');
  const hour = Number(w.start.toLocaleString('en-SG', { hour: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }));
  assert.ok(hour >= 17 && hour <= 19, `low sun started at ${hour}:00 SGT`);
  assert.ok(w.end > w.start);
  assert.ok(w.peakAltitude > 80, 'the same day must still have a near-overhead noon');
  assert.equal(LOW_SUN_DEG, 15, 'the threshold is a stated choice; changing it changes the claim');
});

test('a bearing is a real bearing', () => {
  // Due north and due east of a point, checked against the obvious answer.
  assert.ok(Math.abs(bearingTo(1.3, 103.8, 1.4, 103.8) - 0) < 0.1);
  assert.ok(Math.abs(bearingTo(1.3, 103.8, 1.3, 103.9) - 90) < 0.1);
  assert.ok(Math.abs(bearingTo(1.3, 103.8, 1.2, 103.8) - 180) < 0.1);
  assert.ok(Math.abs(bearingTo(1.3, 103.8, 1.3, 103.7) - 270) < 0.1);
  assert.equal(compass(0), 'N');
  assert.equal(compass(247), 'WSW');
  assert.equal(compass(293), 'WNW');
});

test('a storey count is read from URA wording, and a misparse is refused', () => {
  assert.equal(storeysIn('PROPOSED ERECTION OF A 19-STOREY PUBLIC HOUSING DEVELOPMENT'), 19);
  assert.equal(storeysIn('2-STOREY CARPARK AND 16 STOREY RESIDENTIAL FLATS'), 16, 'the tallest wins');
  assert.equal(storeysIn('PROPOSED ADDITIONS AT 340 CLEMENTI AVENUE'), null, 'an address is not a height');
  assert.equal(storeysIn(''), null);
  assert.equal(storeysIn(null), null);
});
