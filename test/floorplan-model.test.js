import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseReport } from '../lib/floorplan.js';

const route = readFileSync(new URL('../app/api/ai/floorplan/route.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../components/FloorplanUpload.jsx', import.meta.url), 'utf8');

test('a floor-plan model describes space but never assigns its own score', () => {
  assert.doesNotMatch(route, /"score":\s*number/, 'the model schema asks for a numeric layout verdict');
  assert.match(route, /Never estimate value, rent, renovation cost or a score of any kind/);
  /* A provider that sends a score anyway gets it dropped: the report keeps
     only the fields lib/floorplan.js names. */
  const r = normaliseReport({ isFloorPlan: true, score: 8, spatialHealth: { score: 7 }, unit: { type: 'x' } });
  assert.equal(r.score, undefined);
  assert.equal(r.spatialHealth, undefined);
  assert.doesNotMatch(view, /spatialHealth\.score|Layout efficiency/, 'the reader is shown a model-made layout rating');
});
