/**
 * The page is called "how the market actually sits" and showed one market.
 *
 * NEXT.md has said since 4 September that the URA private index data was in
 * and the page was not: "/market still shows HDB's index alone, and that is
 * the leaving-the-site problem this row was written about." ingest:ppi went
 * to SingStat table M212261 for it specifically because data.gov.sg does not
 * carry it, and specifically because it is published on the SAME 1Q2009 base
 * as HDB's — which is the only reason the two can share one scale.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ppi, hdbIndex } from '../lib/data/query.js';

const read = f => readFileSync(path.join(process.cwd(), f), 'utf8');
const strip = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

/**
 * THE SHARED SCALE IS THE WHOLE CLAIM. Rebasing either series here would
 * produce a picture of arithmetic rather than of two markets, and it would do
 * it invisibly — the chart would look exactly as convincing.
 */
test('both indices are published on the same base, unrebased', () => {
  const h = hdbIndex(), p = ppi();
  assert.ok(h?.base, 'the HDB index carries no base');
  assert.ok(p?.base, 'the private index carries no base');
  assert.strictEqual(h.base, p.base,
    `bases differ — HDB "${h.base}" against URA "${p.base}". They cannot share one scale.`);
});

test('the private index reaches the market page at all', () => {
  const route = strip('app/market/page.jsx');
  assert.match(route, /ppi\(\)/, '/market no longer reads the private index');
  assert.match(route, /privateSeries/, 'the aligned series is gone');
  assert.match(route, /priv=\{privateSeries\}/, 'MarketView is not given it');

  const view = strip('components/MarketView.jsx');
  assert.match(view, /compare=\{priv/, 'the chart is no longer given the second series');
});

/*
 * URA's series starts in 1975 and HDB's in 1990. Sending the whole of URA's
 * would put sixty quarters of private-only history into the payload and draw a
 * line over bars that do not exist.
 */
test('the private series is aligned to the quarters HDB covers', () => {
  const route = strip('app/market/page.jsx');
  assert.match(route, /idx\.points\.map\(p => \(\{ quarter: p\.quarter, index: privBy\.get\(p\.quarter\) \?\? null \}\)\)/,
    'the two series are no longer aligned quarter for quarter');
  const p = ppi(), h = hdbIndex();
  assert.ok(p.series.all.points[0].quarter < h.points[0].quarter,
    'the fixture changed — URA no longer starts earlier, so this alignment may be unnecessary');
});

/* Rule 6. Two series from two agencies is two claims, and one line naming
   both would leave a reader unable to check either. */
test('each index renders its own source', () => {
  const view = strip('components/MarketView.jsx');
  const provs = view.match(/className="prov"/g) || [];
  assert.ok(provs.length >= 2,
    `only ${provs.length} provenance line(s) in the index panel; there are two agencies`);
  assert.match(view, /privMeta\.source/, "the private index's source is not rendered");
  assert.match(view, /privMeta\.datasource/, 'URA is not named as the datasource behind SingStat');
});

/*
 * The panel used to be headed "HDB resale price index", so the compare tool
 * below it needed no label. Putting URA's index beside it took that context
 * away and left "+38.5%, 2021 Q2 to 2026 Q2" under two figures without saying
 * which one moved.
 */
test('the compare tool says which index it is comparing', () => {
  const view = strip('components/MarketView.jsx');
  assert.match(view, /Compare two quarters of the HDB resale index/,
    'the compare tool is unlabelled again, under two indices');
  assert.match(view, /HDB resale, \{qLabel\(a\.quarter\)\}/,
    'the compared span no longer names its index');
});

/* A quarter the second series does not cover must be a gap, not a straight
   line drawn across data that is not there. */
test('a missing quarter breaks the line rather than bridging it', () => {
  const chart = strip('components/Chart.jsx');
  assert.match(chart, /if \(v == null\)/, 'a null in the compare series is no longer a gap');
  assert.match(chart, /runs\.push\(run\)/, 'the line is drawn as one run again');
  assert.match(chart, /vals = points\.map\(p => p\.value\)\.concat\(cmpVals\)/,
    'the scale no longer spans both series, so they are drawn against different rulers');
});
