/**
 * The floor plan report: what may be said about a plan, where its numbers come
 * from, and a shared link that cannot be forged.
 *
 * Shervin, 26 Sep: every reading was generic — whether walls can come down,
 * read back off a drawing the buyer could already see. The report is now about
 * living in the unit. These are the ways it could go wrong again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sizeOf, bedFit, normaliseReport, byTheme, viewingChecklist, BEDS, CLEAR } from '../lib/floorplan.js';
import { seal, open, MAX_TOKEN } from '../lib/floorplan-share.js';

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ENV = { SHARE_SIGNING_KEY: 'test-key-for-signing' };

test('a size is read only when it is printed in a form that can be read exactly', () => {
  assert.deepEqual(sizeOf('3.2m x 3.0m'), { w: 3.0, l: 3.2 });
  assert.deepEqual(sizeOf('3200 x 3000'), { w: 3.0, l: 3.2 });
  assert.deepEqual(sizeOf('3.2 × 3.0'), { w: 3.0, l: 3.2 });
  const ft = sizeOf(`10'6" x 9'`);
  assert.ok(Math.abs(ft.l - 3.2) < 0.01 && Math.abs(ft.w - 2.743) < 0.01);
  for (const bad of [null, '', 'large', '93 sqm', '0.5 x 0.4', '40 x 30', 'Unit 12-345']) {
    assert.equal(sizeOf(bad), null, `"${bad}" was read as a room size`);
  }
});

test('the bed that fits follows the published walkway rule, both ways round', () => {
  assert.equal(bedFit({ w: 3.0, l: 3.2 }).name, 'King');
  assert.equal(bedFit({ w: 2.6, l: 2.7 }).name, 'Queen');
  assert.equal(bedFit({ w: 2.4, l: 2.6 }).name, 'Super single');
  assert.equal(bedFit({ w: 1.8, l: 2.2 }), null);
  assert.equal(bedFit(null), null);
  /* The rule on the page must be the rule in the code. */
  const view = src('components/FloorplanUpload.jsx');
  assert.match(view, /CLEAR\.foot/); assert.match(view, /CLEAR\.eachSide/);
  assert.deepEqual(BEDS.map(b => b.name), ['King', 'Queen', 'Super single', 'Single']);
  assert.equal(CLEAR.foot, 0.6);
});

test('an area comes only from a printed size, never from the model', () => {
  const r = normaliseReport({ isFloorPlan: true, unit: {}, rooms: [
    { name: 'Bedroom 2', kind: 'bedroom', printedSize: '2.7m x 2.6m', areaSqm: 99 },
    { name: 'Bedroom 3', kind: 'bedroom', printedSize: null, areaSqm: 12 },
    { name: 'Kitchen', kind: 'kitchen', printedSize: 'about 10 sqm' },
  ] });
  assert.equal(r.rooms[0].areaSqm, 7, 'the area was not worked out from the printed size');
  assert.equal(r.rooms[0].bed, 'Queen');
  assert.equal(r.rooms[1].areaSqm, null, 'a model-supplied area survived');
  assert.equal(r.rooms[2].printedSize, null, 'an estimate was kept as a printed size');
  assert.equal(r.rooms[2].bed, null);
});

test('a wall is never high confidence, and never a statement', () => {
  const r = normaliseReport({ isFloorPlan: true, unit: {}, wallsToAskAbout: [
    { where: 'Bedroom 2 / Bedroom 3', askYourQP: 'Is this wall structural?', confidence: 'high' },
    { where: 'Kitchen wall', askYourQP: '', confidence: 'low' },
  ] });
  assert.equal(r.wallsToAskAbout.length, 1, 'a wall item with no question was kept');
  assert.equal(r.wallsToAskAbout[0].confidence, 'medium');
  const sys = src('app/api/ai/floorplan/route.js');
  assert.match(sys, /Never state that a wall is load-bearing, structural or removable/);
});

test('a line in the site\'s prohibited language or an invented voice is dropped, not shown', () => {
  const r = normaliseReport({ isFloorPlan: true, unit: { summary: 'A bargain layout, undervalued for the area.' }, findings: [
    { theme: 'zoning', observation: 'This unit is undervalued for its layout.', whyItMatters: 'x' },
    { theme: 'privacy', observation: 'I have seen many buyers love this door.', whyItMatters: 'x' },
    { theme: 'privacy', observation: 'The main door opens straight into the living room.', whyItMatters: 'A visitor sees in.' },
  ] });
  assert.equal(r.unit.summary, '');
  assert.equal(normaliseReport({ isFloorPlan: true, unit: { type: '3-bedroom flat (appears to be an older HDB layout)' } }).unit.type,
    '3-bedroom flat', 'a hedge in brackets was left in the headline');
  assert.deepEqual(r.findings.map(f => f.observation), ['The main door opens straight into the living room.']);
  assert.equal(byTheme(r.findings)[0].heading, 'Privacy');
});

test('the reader is told to be specific to the plan and to transcribe, never estimate', () => {
  const sys = src('app/api/ai/floorplan/route.js');
  assert.match(sys, /BE SPECIFIC TO THIS PLAN/);
  assert.match(sys, /Transcribe printed numbers exactly; never estimate a dimension/);
  assert.match(sys, /model: 'claude-opus-5-5', effort: 'low'/);
  assert.match(sys, /normaliseReport\(parsed\)/, 'the route shows the reading uncleaned');
  assert.match(viewingChecklist({ atTheViewing: ['Open both doors together.'] }), /1\. Open both doors together\.[\s\S]*cannot show which walls are structural/);
  assert.equal(viewingChecklist({ atTheViewing: [] }), '');
});

test('a shared link opens only as it was made', () => {
  const report = normaliseReport({ isFloorPlan: true, unit: { type: 'Three-bedroom flat', summary: 'Bedrooms along the top.' },
    findings: [{ theme: 'light', observation: 'All bedrooms face the same side.', whyItMatters: 'Same sun.' }] });
  const token = seal(report, ENV);
  assert.ok(token && token.length < MAX_TOKEN);
  assert.deepEqual(open(token, ENV).report, report);
  const [payload, sig] = token.split('.');
  const forged = seal({ ...report, unit: { ...report.unit, summary: 'Changed.' } }, { SHARE_SIGNING_KEY: 'another key' }).split('.')[0];
  assert.match(open(`${forged}.${sig}`, ENV).error, /changed since it was made/, 'an altered report was shown');
  assert.match(open(`${payload}.${'x'.repeat(sig.length)}`, ENV).error, /changed since it was made/);
  assert.match(open('x'.repeat(MAX_TOKEN + 1), ENV).error, /too long/);
  assert.equal(seal(report, {}), null, 'sharing ran with no key');
  assert.match(open(token, {}).error, /not available/);
  /* A genuine link carrying a line that today's rules refuse is cleaned on the way out. */
  const old = seal({ ...report, findings: [{ theme: 'zoning', observation: 'The best deal on the floor.', whyItMatters: '' }] }, ENV);
  assert.deepEqual(open(old, ENV).report.findings, []);
});

test('the page never renders a shared report without the server\'s check', () => {
  const view = src('components/FloorplanUpload.jsx');
  assert.match(view, /fetch\('\/api\/ai\/floorplan\/shared'/);
  assert.doesNotMatch(view, /inflate|DecompressionStream|atob\(/, 'the page decodes a link itself, skipping the signature check');
});
