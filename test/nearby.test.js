import test from 'node:test';
import assert from 'node:assert/strict';
import { nearFor, isPrimary } from '../lib/nearby.js';

const HERE = { lat: 1.35112, lon: 103.84819, match: 'exact' };
const ORDER = ['rail', 'schools', 'hawker', 'parks', 'childcare', 'malls'];
/** ~111m per 0.001 degrees of latitude. */
const north = (m, extra = {}) => ({ lat: HERE.lat + m / 111195, lon: HERE.lon, ...extra });

const LAYERS = {
  rail: { within: 2000, points: [
    north(300, { name: 'BISHAN MRT STATION', line: 'NSL' }),
    north(1200, { name: 'MARYMOUNT MRT STATION', line: 'CCL' }),
    north(9000, { name: 'MIles AWAY', line: 'XX' }),
  ] },
  schools: { within: 2000, points: [
    north(400, { name: 'Ai Tong School', level: 'PRIMARY' }),
    north(1500, { name: 'Kuo Chuan Presbyterian Primary', level: 'PRIMARY' }),
    north(600, { name: 'Raffles Institution', level: 'SECONDARY' }),
    north(5000, { name: 'Far Primary', level: 'PRIMARY' }),
  ] },
  hawker: { within: 1500, points: [north(500, { name: 'Bishan Hawker' })] },
  parks:  { within: 1500, points: [north(9000, { name: 'Way Out Park' })] },
  childcare: { within: 1000, points: [north(200, { name: 'Little Ones' }), north(700, { name: 'Big Ones' })] },
};

test('a point picks up every layer that has something in range', () => {
  const near = nearFor(HERE, LAYERS, { order: ORDER });
  assert.equal(near.rail.length, 2, 'the 9km station is out of range');
  assert.equal(near.rail[0].name, 'BISHAN MRT STATION');
  assert.equal(near.hawker.length, 1);
  assert.equal(near.childcare.length, 2);
  assert.equal(near.at.match, 'exact');
});

test('a layer with nothing in range is absent, not empty', () => {
  const near = nearFor(HERE, LAYERS, { order: ORDER });
  assert.ok(!('parks' in near), 'the only park is 9km away, so there should be no parks key at all');
  assert.ok(!('malls' in near), 'no mall layer was supplied');
});

test('only MOE-coded primary schools are banded', () => {
  const { primary, schools } = nearFor(HERE, LAYERS, { order: ORDER });
  assert.deepEqual(primary.within1.map(s => s.name), ['Ai Tong School']);
  assert.deepEqual(primary.within2.map(s => s.name), ['Kuo Chuan Presbyterian Primary']);
  assert.deepEqual(schools.map(s => s.name), ['Raffles Institution'],
    'a secondary school is listed but never banded');
  assert.ok(!JSON.stringify(primary).includes('Far Primary'), 'a primary 5km away is out of both bands');
});

test('level is read from MOE, never guessed from the name', () => {
  assert.ok(isPrimary({ level: 'PRIMARY' }));
  assert.ok(!isPrimary({ name: 'Anglo-Chinese School (Primary)' }), 'no level column means no claim');
  assert.ok(!isPrimary({ name: 'X', level: 'SECONDARY' }));
});

test('a point with nothing around it returns null rather than an empty shell', () => {
  const middleOfNowhere = { lat: 1.20, lon: 104.10, match: 'exact' };
  assert.equal(nearFor(middleOfNowhere, LAYERS, { order: ORDER }), null);
});

test('an empty layer set returns null', () => {
  assert.equal(nearFor(HERE, {}, { order: ORDER }), null);
});

test('station exits collapse to one entry per station, nearest exit winning', () => {
  // What the LTA layer actually looks like: many exits, few stations.
  const exits = { within: 2000, dedupe: 'station', points: [
    north(420, { name: 'BISHAN MRT STATION', exit: 'A' }),
    north(300, { name: 'BISHAN MRT STATION', exit: 'B' }),
    north(510, { name: 'BISHAN MRT STATION', exit: 'C' }),
    north(1150, { name: 'MARYMOUNT MRT STATION', exit: 'A' }),
    north(1400, { name: 'MARYMOUNT MRT STATION', exit: 'B' }),
  ] };
  const near = nearFor(HERE, { rail: exits }, { order: ['rail'] });
  assert.deepEqual(near.rail.map(r => r.name), ['BISHAN MRT STATION', 'MARYMOUNT MRT STATION'],
    'three Bishan exits must not crowd out Marymount');
  assert.equal(near.rail[0].exit, 'B', 'the nearest exit is the one that should survive');
  assert.equal(near.rail[0].m, 300);
});

test('without dedupe a layer keeps every point, as it should', () => {
  const plain = { within: 2000, points: [
    north(300, { name: 'Same Name' }), north(400, { name: 'Same Name' }),
  ] };
  const near = nearFor(HERE, { hawker: plain }, { order: ['hawker'] });
  assert.equal(near.hawker.length, 2);
});

test('through-train schools coded MIXED LEVEL (P1-S4) are treated as primary', () => {
  // Catholic High, CHIJ St Nicholas Girls' and Maris Stella High all register
  // a P1 cohort but are not coded "PRIMARY". They are also among the schools
  // people most want the 1km answer for.
  assert.ok(isPrimary({ level: 'MIXED LEVEL (P1-S4)' }));
  assert.ok(isPrimary({ level: 'PRIMARY' }));
  assert.ok(!isPrimary({ level: 'MIXED LEVEL (S1-JC2)' }), 'no P1 intake, no band');
  assert.ok(!isPrimary({ level: 'MIXED LEVEL (S1-S5, JC1-JC2)' }));
  assert.ok(!isPrimary({ level: 'JUNIOR COLLEGE' }));
  assert.ok(!isPrimary({ level: 'SECONDARY (S1-S5)' }));
});
