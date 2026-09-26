/**
 * SORA from MAS's statistics download.
 *
 * The JSON API this ingest was built on returned MAS's failover page for as
 * long as this repo has existed, so data/sora.json was never written and every
 * daily refresh since 9 Sep 2026 ended red. The replacement reads MAS's own
 * CSV, whose layout is easy to misread: one block per year with the header
 * repeated, blank lines between, and the year and month printed only on the
 * row where they change. The first parser stopped at the first blank line and
 * reported 31 Dec as the latest day in September.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMasCsv } from '../scripts/ingest-sora.mjs';

const CSV = [
  'MAS: Financial Database - Domestic Interest Rates', '',
  'Domestic Interest Rates (Daily)', 'Nov 2025 to Jan 2026', '', '',
  'SORA Value Date,,,SORA Publication Date,SORA,Compound SORA - 1 month,Compound SORA - 3 month,Compound SORA - 6 month',
  '2025,Nov,28,01 Dec 2025,1.0518,1.1455,1.2530,1.4117',
  ',Dec,01,02 Dec 2025,1.0297,1.1348,1.2564,1.4058',
  ',,31,02 Jan 2026,0.8949,1.1739,1.1857,1.3195',
  '', '',
  'SORA Value Date,,,SORA Publication Date,SORA,Compound SORA - 1 month,Compound SORA - 3 month,Compound SORA - 6 month',
  '2026,Jan,02,05 Jan 2026,1.0119,1.1779,1.1797,1.3111',
  ',,05,06 Jan 2026,1.0970,1.1767,1.1781,1.3090',
  '', '"Notes:"', '" The Singapore Overnight Rate Average or SORA is the volume-weighted average rate…"',
].join('\r\n');

test('every year block is read, with the year and month carried down', () => {
  const { points, columns } = parseMasCsv(CSV);
  assert.deepEqual(points.map(p => p.date), ['2025-11-28', '2025-12-01', '2025-12-31', '2026-01-02', '2026-01-05'],
    'a year block was dropped, or a carried year or month went to the wrong row');
  assert.deepEqual(points.at(-1), { date: '2026-01-05', sora: 1.097, m1: 1.1767, m3: 1.1781, m6: 1.309 });
  assert.equal(columns.soraKey, 'SORA');
  assert.match(columns.m3, /3 month/);
});

test('a download without the table fails loudly instead of writing nothing useful', () => {
  assert.throws(() => parseMasCsv('<html>work in progress</html>'), /No "SORA Value Date" header/);
  assert.throws(() => parseMasCsv('SORA Value Date,,,SORA Publication Date,SORA\r\n\r\n'), /no rows/);
});
