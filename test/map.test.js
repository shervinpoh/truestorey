import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/* The map's orientation layer — town and district labels, and the station
 * marks. These are the parts a reader trusts without being able to check them:
 * a label in the wrong place looks exactly as authoritative as a label in the
 * right one. So the checks here are geographic and specific, not shape checks.
 *
 * Skipped entirely when data/map.json has not been built, so a fresh clone
 * still runs a green suite. */
const P = path.join(process.cwd(), 'data', 'map.json');
const map = fs.existsSync(P) ? JSON.parse(fs.readFileSync(P, 'utf8')) : null;
const has = map ? undefined : { skip: 'data/map.json not built — run `npm run build:map`' };

const R = { LABEL: 0, HREF: 1, LAT: 2, LON: 3, PSF: 4, SALES: 5, MEMBERS: 6, PLOTTED: 7 };
const town = name => map.regions['0'].find(r => r[R.LABEL] === name);

test('every point carries a region index that resolves', has, () => {
  for (const code of ['0', '1', '2']) {
    const size = map.regions[code].length;
    assert.ok(size > 0, `no regions for kind ${code}`);
    const pts = map.points.filter(p => p[0] === Number(code));
    for (const p of pts) {
      assert.ok(Number.isInteger(p[7]) && p[7] >= 0 && p[7] < size,
        `${p[4]} has region index ${p[7]}, outside 0..${size - 1}`);
    }
  }
});

test('region plotted counts add up to the plotted total', has, () => {
  for (const [code, key] of [['0', 'hdb'], ['1', 'condo'], ['2', 'landed']]) {
    const sum = map.regions[code].reduce((a, r) => a + r[R.PLOTTED], 0);
    assert.equal(sum, map.counts[key], `${key} regions sum to ${sum}, counts says ${map.counts[key]}`);
  }
});

test('every HDB town label links to a town page that exists', has, () => {
  const towns = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'towns.json'), 'utf8'));
  const hrefs = new Set((Array.isArray(towns) ? towns : Object.values(towns)).map(t => t.href));
  for (const r of map.regions['0']) {
    assert.ok(r[R.HREF] && hrefs.has(r[R.HREF]), `${r[R.LABEL]} points at ${r[R.HREF]}, which is not a town`);
  }
});

test('districts are not given a page they do not have', has, () => {
  for (const code of ['1', '2']) {
    for (const r of map.regions[code]) {
      assert.equal(r[R.HREF], null, `${r[R.LABEL]} was given the href ${r[R.HREF]}`);
      assert.match(r[R.LABEL], /^D\d{2}$/);
    }
  }
});

/* Real coordinates, so a swapped lat/lon or a mean-instead-of-median centroid
 * shows up as a label in the sea rather than as a plausible number. */
test('town labels land in the right part of the island', has, () => {
  const at = (name, lat, lon, km) => {
    const r = town(name);
    assert.ok(r, `${name} is missing from the regions`);
    const dLat = (r[R.LAT] - lat) * 111, dLon = (r[R.LON] - lon) * 111;
    const d = Math.hypot(dLat, dLon);
    assert.ok(d < km, `${name} label is ${d.toFixed(1)}km from where ${name} is, expected under ${km}km`);
  };
  at('BISHAN', 1.3510, 103.8480, 2);
  at('TAMPINES', 1.3540, 103.9440, 3);
  at('JURONG WEST', 1.3400, 103.7070, 3);
  at('WOODLANDS', 1.4370, 103.7860, 3);
  at('PUNGGOL', 1.4050, 103.9020, 3);
});

test('every centroid sits inside the island bounding box', has, () => {
  const [minLat, minLon, maxLat, maxLon] = map.bbox;
  for (const code of ['0', '1', '2']) {
    for (const r of map.regions[code]) {
      assert.ok(r[R.LAT] >= minLat && r[R.LAT] <= maxLat, `${r[R.LABEL]} latitude ${r[R.LAT]} is outside the map`);
      assert.ok(r[R.LON] >= minLon && r[R.LON] <= maxLon, `${r[R.LABEL]} longitude ${r[R.LON]} is outside the map`);
    }
  }
});

/* The whole point of reading the figure out of index.json rather than
 * recomputing it: /map and /hdb must never show a town two different medians. */
test('HDB town medians match the figure /hdb publishes', has, () => {
  const i = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'index.json'), 'utf8'));
  for (const r of map.regions['0']) {
    const src = i.hdb?.towns?.[r[R.LABEL]];
    assert.ok(src, `${r[R.LABEL]} is not a town in index.json`);
    assert.equal(r[R.PSF], Math.round(src.medianPsf),
      `${r[R.LABEL]} reads $${r[R.PSF]} on the map and $${Math.round(src.medianPsf)} on /hdb`);
  }
});

test('a district figure is that district own type, not all private housing', has, () => {
  // D10 has both condos and landed. If the two layers ever report the same
  // median it means one of them is being fed the all-private figure again.
  const c = map.regions['1'].find(r => r[R.LABEL] === 'D10');
  const l = map.regions['2'].find(r => r[R.LABEL] === 'D10');
  assert.ok(c && l, 'D10 should appear on both the condo and landed layers');
  assert.notEqual(c[R.PSF], l[R.PSF], 'condo and landed D10 report the same median — layers are crossed');
  assert.notEqual(c[R.SALES], l[R.SALES], 'condo and landed D10 report the same sale count');
});

test('stations are stations, deduplicated, and inside Singapore', has, () => {
  assert.ok(Array.isArray(map.rail) && map.rail.length > 150, `only ${map.rail?.length} stations`);
  const names = new Set(map.rail.map(s => s[0]));
  assert.equal(names.size, map.rail.length, 'a station appears twice — exits are not being merged');
  for (const [name, lat, lon] of map.rail) {
    assert.doesNotMatch(name, /STATION/i, `${name} still carries the word STATION`);
    assert.ok(lat > 1.2 && lat < 1.5 && lon > 103.5 && lon < 104.1, `${name} is at ${lat},${lon}`);
  }
  // No line membership is published in the source, so nothing here may claim one.
  const bishan = map.rail.find(s => s[0] === 'BISHAN');
  assert.ok(bishan, 'Bishan station is missing');
  assert.equal(bishan.length, 4, 'a station record grew a field — check nothing invented a line');
});
