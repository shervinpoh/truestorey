import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/ai/floorplan/route.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../components/FloorplanUpload.jsx', import.meta.url), 'utf8');

test('a floor-plan model describes space but never assigns its own score', () => {
  assert.doesNotMatch(route, /"score":\s*number/,
    'the model schema asks for a numeric layout verdict');
  assert.match(route, /parsed\.spatialHealth\s*=\s*\{\s*basis:/,
    'a provider can still return an old score unless the route discards it');
  assert.doesNotMatch(view, /spatialHealth\.score|Layout efficiency/,
    'the reader is shown a model-made layout rating');
  assert.match(view, /spatialHealth\.basis/,
    'the observation should remain available after removing the rating');
});
