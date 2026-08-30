import test from 'node:test';
import assert from 'node:assert/strict';
import { relativity, annualDecay, curve, parseRemaining, LEASE_TABLE } from '../lib/calc/lease.js';

/* All ninety-nine rows, or it is not the table. */
test('the table is complete and rises with the term', () => {
  assert.equal(Object.keys(LEASE_TABLE.years).length, 99);
  for (let y = 2; y <= 99; y++) {
    assert.ok(relativity(y) > relativity(y - 1), `${y} years is not worth more than ${y - 1}`);
  }
});

/* The three figures quoted across the industry. If a transcription slipped,
 * these are what would catch it — and they did, before this shipped. */
test('the anchor points reconcile', () => {
  assert.equal(relativity(99), 96.0);
  assert.equal(relativity(60), 80.0);
  assert.equal(relativity(30), 60.0);
  assert.equal(relativity(1), 3.8);
});

/* The whole point of the table is that it is NOT a straight line. A linear
 * 99ths-per-year model would put 50 years at about half of 96%; the table
 * says three quarters. */
test('the decay is not linear, and steepens as the lease runs down', () => {
  assert.ok(relativity(50) > 70, 'half the lease left is not half the value');
  const late = annualDecay(20), mid = annualDecay(40), early = annualDecay(90);
  assert.ok(late > mid && mid > early,
    `erosion must accelerate: 90y=${early} 40y=${mid} 20y=${late}`);
  assert.ok(late > early * 3, 'the last decades should be several times the first');
});

/* A table that covers 1–99 covers 1–99. Extrapolating past either end would
 * be inventing a row the State never published. */
test('outside the table it returns nothing rather than guessing', () => {
  assert.equal(relativity(0), null);
  assert.equal(relativity(100), null);
  assert.equal(relativity(999), null, 'a 999-year lease is not on this table');
  assert.equal(relativity('nonsense'), null);
  assert.equal(annualDecay(1), null, 'there is no year zero to subtract');
});

test('HDB’s own lease format parses', () => {
  assert.equal(Math.round(parseRemaining('51 years 11 months') * 100) / 100, 51.92);
  assert.equal(parseRemaining('60 years'), 60);
  assert.equal(parseRemaining(45), 45);
  assert.equal(parseRemaining(''), null);
});

test('the curve runs from a full lease down to one year', () => {
  const c = curve();
  assert.equal(c.length, 99);
  assert.equal(c[0].years, 99);
  assert.equal(c.at(-1).years, 1);
});

/* CEA PG 02-11 s3.1, and the chain matters here: this is SLA's table reached
 * through a paper, because SLA does not publish it at a findable URL. The page
 * must be able to say so. */
test('the source names both SLA and the paper it was transcribed from', () => {
  assert.match(LEASE_TABLE.source, /Singapore Land Authority/);
  assert.match(LEASE_TABLE.reproducedIn, /Kwong/);
  assert.match(LEASE_TABLE.reproducedUrl, /^https:\/\/ink\.library\.smu\.edu\.sg\//);
  assert.match(LEASE_TABLE.note, /rather than fetched from SLA/);
  assert.match(LEASE_TABLE.transcribed, /^\d{4}-\d{2}-\d{2}$/);
});
