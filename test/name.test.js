import test from 'node:test';
import assert from 'node:assert/strict';
import { titleCase } from '../lib/name.js';

test('shouting source data is calmed down', () => {
  assert.equal(titleCase('TELOK BLANGAH HILL PARK'), 'Telok Blangah Hill Park');
  assert.equal(titleCase('MARIS STELLA HIGH SCHOOL'), 'Maris Stella High School');
  assert.equal(titleCase('JALAN SEMBILANG PARK'), 'Jalan Sembilang Park');
});

test('a partly-cased label is fixed word by word, not judged as a whole', () => {
  // The lowercase "lk" in "Blk" sinks any whole-string uppercase ratio, which
  // is how this label used to escape unconverted.
  assert.equal(titleCase('Blk 275A BISHAN ST 24'), 'Blk 275A Bishan St 24');
  assert.equal(titleCase('Blk 406 ANG MO KIO AVE 10'), 'Blk 406 Ang Mo Kio Ave 10');
});

test('already mixed-case names are returned untouched', () => {
  for (const n of ['Tiong Bahru Market', 'Shunfu Road Blk 320 (Shunfu Mart)', 'iShine Centre', 'McNair Road']) {
    assert.equal(titleCase(n), n);
  }
});

test('acronyms survive', () => {
  assert.equal(titleCase("CHIJ ST. NICHOLAS GIRLS' SCHOOL"), "CHIJ St. Nicholas Girls' School");
  assert.equal(titleCase('BISHAN MRT STATION'), 'Bishan MRT Station');
  assert.ok(titleCase('PUNGGOL LRT STATION').includes('LRT'));
});

test('a small word is only small in the middle', () => {
  assert.equal(titleCase('THE SAIL @ MARINA BAY'), 'The Sail @ Marina Bay');
  assert.equal(titleCase('BANK OF SINGAPORE'), 'Bank of Singapore');
});

test('empty and odd input does not throw', () => {
  assert.equal(titleCase(''), '');
  assert.equal(titleCase(null), null);
  assert.equal(titleCase('   '), '   ');
  assert.equal(titleCase('123'), '123');
});
