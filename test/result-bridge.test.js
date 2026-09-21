import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = file => readFileSync(path.join(process.cwd(), file), 'utf8');

test('the main decision tools end with one optional human handoff', () => {
  for (const file of [
    'components/Planner.jsx',
    'components/Ledger.jsx',
    'components/Progressive.jsx',
    'components/LeaseView.jsx',
    'components/BlindspotReport.jsx',
  ]) {
    assert.match(src(file), /<ResultBridge\b/, `${file} has no human handoff after its result`);
  }
});

test('the handoff sends no figures automatically and says so', () => {
  const bridge = src('components/ResultBridge.jsx');
  assert.doesNotMatch(bridge, /shareHash|shareUrl|location\.href|window\.location/);
  assert.match(bridge, /No figures are included and nothing is sent until you send it/);
  assert.match(bridge, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(bridge, /83335379/, 'the public phone number must still come from the one configured source');
});

test('the handoff does not pretend to unlock a result or subscribe the reader', () => {
  const bridge = src('components/ResultBridge.jsx');
  assert.doesNotMatch(bridge, /unlock|sign up|subscribe|get access/i);
  assert.match(bridge, /The numbers stop here\. The actual home does not\./);
});
