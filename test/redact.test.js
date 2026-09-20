/**
 * Client-safe mode. The test that makes the next feature declare itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { redact, CLIENT_VISIBLE, CLIENT_WITHHELD } from '../lib/consult/redact.js';

const full = () => ({
  record: { href: '/condo/x', label: 'X', kind: 'PRIVATE', town: null },
  input: { areaSqft: 1000, floor: 10, price: 2000000, years: 7 },
  estimate: { ok: true, band: { psfLow: 1800, psfHigh: 1950 }, psf: 1875, price: 1875000 },
  stack: { ran: true, premium: 0.081, sales: [{ unit: '#21-01', psf: 2144 }] },
  clientSafe: true,
  score: { total: 9, of: 14 },
  residual: { ok: true, verdict: { code: 'under', says: 'below the estimate' } },
  outlook: { ok: true, clearedPct: 61 },
  generatedAt: '2026-09-20T00:00:00.000Z',
});

test('the speculative work does not reach a client report', () => {
  const r = redact(full());
  for (const k of ['residual', 'score', 'outlook']) {
    assert.equal(r[k], undefined, `${k} survived redaction — it prints in a client PDF`);
  }
  assert.ok(r.estimate, 'the band is the thing a client is meant to get');
  assert.ok(r.record && r.input);
});

test('REALIS never reaches a client, sound arithmetic or not', () => {
  /* Not speculation — filed transactions. It is withheld because REALIS is
     licensed for personal research and not commercial use, CEA PG 02-11 s6,
     which a stack table in a client deliverable would breach. */
  assert.equal(redact(full()).stack, undefined);
});

test('the report says what it withheld, and only what it actually had', () => {
  const r = redact(full());
  assert.equal(r.withheld.length, 4);
  assert.ok(r.withheld.some(w => /REALIS/.test(w)));

  /* A lookup with no asking price makes no over/under finding, so claiming
     one was withheld implies a suppressed verdict that never existed. */
  const noPrice = full(); noPrice.residual = null; noPrice.stack = null;
  const r2 = redact(noPrice);
  assert.equal(r2.withheld.length, 2);
  assert.ok(!r2.withheld.some(w => /above or below/.test(w)));
});

test('client-safe is asserted by the redactor, not trusted from the caller', () => {
  const lying = full(); lying.clientSafe = false;
  assert.equal(redact(lying).clientSafe, true);
});

/**
 * The durable one. Client-safe mode leaked for as long as it existed because
 * four features were added to the report and nobody was asked about any of
 * them. This reads the server's own report object and fails on a key that has
 * not been classified — so the decision happens when the feature is written.
 */
test('every key the report carries has been classified as visible or withheld', () => {
  const src = fs.readFileSync(new URL('../scripts/consult-server.mjs', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const out = {'));
  const body = block.slice(0, block.indexOf('\n      };'));
  const keys = [...body.matchAll(/^\s{8}(\w+):/gm)].map(m => m[1]);
  assert.ok(keys.length >= 8, `only ${keys.length} report keys parsed — has the object moved?`);

  for (const k of keys) {
    assert.ok(CLIENT_VISIBLE.has(k) || k in CLIENT_WITHHELD,
      `The report carries "${k}" and lib/consult/redact.js does not classify it. `
      + 'Add it to CLIENT_VISIBLE or to CLIENT_WITHHELD with the label a client sees. '
      + 'Both export buttons serialise the rendered page, so an unclassified key ships in a client PDF.');
  }
});
