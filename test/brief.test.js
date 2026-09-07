import test from 'node:test';
import assert from 'node:assert/strict';
import { brief } from '../lib/brief.js';

/**
 * The brief exists because a model was writing market claims with no source
 * behind them. These tests are the rule that replaced that: CEA PG 02-11 s3.1
 * requires a market claim to be substantiated, so every figure leaving here
 * carries the period it covers and the agency it came from.
 */

test('every figure names its period and its source', () => {
  const b = brief();
  assert.ok(b.figures.length >= 3, 'a brief with no figures is not a brief');
  for (const f of b.figures) {
    assert.ok(f.period, `${f.what} has no period`);
    assert.ok(f.source, `${f.what} has no source`);
    assert.ok(f.what, 'a figure with no label cannot be written about');
    assert.ok(typeof f.value === 'number' || f.value === null,
      `${f.what} must carry a number or nothing, not a string`);
  }
});

test('the two indices share a base, or they must not be compared', () => {
  // 1Q2009 = 100 for both. Rebasing either here would make the figure ours
  // rather than the agency's, which is what rule 6 is about.
  const b = brief();
  const hdb = b.figures.find(f => f.id === 'hdb-index');
  const ura = b.figures.filter(f => f.id.startsWith('ura-'));
  if (!hdb || !ura.length) return;                 // an ingest has not run
  for (const u of ura) {
    assert.equal(u.basis, hdb.basis,
      'the private and HDB indices no longer share a base quarter — the brief must stop setting them side by side');
    assert.equal(u.comparableWith, 'hdb-index');
  }
});

test('what could not be read is named, not dropped', () => {
  // Silent truncation reads as completeness. SORA is the live example: MAS
  // goes under maintenance and the ingest exits 0 with no file.
  const b = brief();
  assert.ok(Array.isArray(b.missing));
  for (const m of b.missing) assert.ok(typeof m === 'string' && m.length > 3);
});

test('the MOP figure says what it does not mean', () => {
  const b = brief();
  if (!b.mop) return;
  assert.match(b.mop.caveat, /not an intention/i,
    'the register says when a flat becomes eligible, never that anyone intends to sell');
  assert.ok(b.mop.thisYear.units > 0);
  assert.ok(b.mop.source && b.mop.retrieved);
});

test('the payload stays small enough to send to a model', () => {
  // It is pasted into a prompt on every /brief. A payload that grows into the
  // tens of kilobytes starts costing more than the brief is worth.
  const bytes = JSON.stringify(brief()).length;
  assert.ok(bytes < 8000, `brief payload is ${bytes} bytes`);
});
