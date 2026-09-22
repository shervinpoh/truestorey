import test from 'node:test';
import assert from 'node:assert/strict';
import { floorplanQuestions } from '../lib/floorplan-questions.js';

test('only concrete questions are copied, with the structural limit attached', () => {
  const note = floorplanQuestions([
    { where: 'Wall by kitchen', askYourQP: 'Is this structural in the approved drawings?' },
    { where: 'Living room', askYourQP: ' ' },
    { askYourQP: 'What approval would this alteration require?' },
  ]);
  assert.match(note, /floor plan alone cannot establish whether a wall is structural/i);
  assert.match(note, /1\. Wall by kitchen: Is this structural/);
  assert.match(note, /2\. What approval would this alteration require/);
  assert.doesNotMatch(note, /Living room/);
});

test('no usable questions means no empty copy action', () => {
  assert.equal(floorplanQuestions([]), '');
  assert.equal(floorplanQuestions(null), '');
  assert.equal(floorplanQuestions([{ where: 'Kitchen' }]), '');
});
