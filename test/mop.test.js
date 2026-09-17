import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blockMop, buildMopFilings, mopCopy, namedMonth } from '../lib/mop.js';
import { hdbHref } from '../lib/name.js';
import config from '../next.config.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const source = { source: 'HDB Property Information (data.gov.sg)',
  resourceId: 'd_17f5382f26140b1fdae0ba2ef6239d2f', accessedAt: '2026-09-01T00:00:00Z' };
const rec = { kind: 'HDB', town: 'KALLANG/WHAMPOA', block: '10A', street: 'TEST RD',
  label: 'Blk 10A TEST RD', href: hdbHref('KALLANG/WHAMPOA', '10A', 'TEST RD') };
const block = (changes = {}) => ({ town: rec.town, block: rec.block, street: rec.street,
  yearCompleted: 2021, earliestMop: 2026, firstResaleSeen: '2024-07', ...changes });
const register = (blocks = [block(), block({ block: '9', yearCompleted: 2019, earliestMop: 2024 })]) => ({
  ...source, towns: { [rec.town]: { byYear: Object.fromEntries([...new Set(blocks.map(b => b.earliestMop))]
    .map(year => [year, { list: blocks.filter(b => b.earliestMop === year) }])) } },
});
const row = (month, changes = {}) => ({ town: rec.town, block: rec.block, street: rec.street, month, ...changes });
const input = rows => ({ ...source, source: 'HDB Resale Flat Prices (data.gov.sg)',
  resourceId: 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc', count: rows.length, rows });
const yearRows = (year = 2025) => Array.from({ length: 12 }, (_, m) => row(`${year}-${String(m + 1).padStart(2, '0')}`));
const result = (rows = yearRows(), mop = register()) => blockMop(rec, mop, buildMopFilings(input(rows)));

test('the join needs town, street and block suffix; the same block number is not an address', () => {
  const mop = register([
    block({ block: '10', yearCompleted: 2000, earliestMop: 2005 }),
    block({ street: 'OTHER RD', yearCompleted: 2001, earliestMop: 2006 }),
    block({ town: 'BISHAN', yearCompleted: 2002, earliestMop: 2007 }),
    block(),
  ]);
  assert.equal(result(yearRows(), mop).earliestYear, 2026);
  const lower = { ...rec, town: 'kallang/whampoa', block: '10a', street: 'test rd' };
  assert.equal(blockMop(lower, mop, null).earliestYear, 2026);
  assert.equal(blockMop({ ...rec, href: '/hdb/kallang-whampoa/10-test-rd' }, mop, null).earliestYear, null);
  assert.equal(blockMop({ ...rec, kind: 'PRIVATE' }, mop, null), null);
});

test('duplicate and absent register matches never borrow the first block’s date', () => {
  const duplicate = result(yearRows(), register([block(), block({ earliestMop: 2027, yearCompleted: 2022 })]));
  assert.equal(duplicate.status, 'ambiguous');
  assert.equal(duplicate.earliestYear, null);
  assert.equal(duplicate.comparison, null);
  assert.equal(result(yearRows(), register([])).status, 'unmatched');
  assert.equal(result(yearRows(), null).status, 'unavailable');
  assert.equal(result(yearRows(), { ...register(), source: null }).source, null);
});

test('completion year and observed resale month never become a confirmed MOP month', () => {
  const data = result();
  const copy = mopCopy(data, rec);
  assert.equal(data.earliestYear, 2026);
  assert.equal(data.firstMonth, '2025-01', 'use the fresh filing window, not stale firstResaleSeen');
  assert.match(copy.dateLabel, /MOP month unavailable/);
  assert.match(copy.dateNote, /not key-collection dates or a confirmed MOP month/);
  assert.match(copy.first, /Earliest filing held.*January 2025/);
  assert.match(copy.firstNote, /not the block’s first-ever sale or its MOP month/);
  assert.equal(result(yearRows(), register([block({ earliestMop: 2020 })])).earliestYear, null);
  assert.equal(namedMonth('2026-13'), null);
  assert.equal(namedMonth('2026'), null);
  assert.equal(namedMonth('2026-09'), 'September 2026');
});

test('the preceding cohort is the nearest earlier year in the same town, even with a gap', () => {
  const data = result(yearRows(), register([
    block(), block({ block: '9', yearCompleted: 2019, earliestMop: 2024 }),
    block({ block: '8', yearCompleted: 2017, earliestMop: 2022 }),
    block({ block: '7', town: 'BISHAN', yearCompleted: 2020, earliestMop: 2025 }),
    block({ block: '6' }), block({ block: '5', yearCompleted: 2022, earliestMop: 2027 }),
  ]));
  assert.equal(data.previousYear, 2024);
  assert.deepEqual(data.comparison.period, { from: '2025-01', to: '2025-12' });
  assert.match(mopCopy(data, rec).method, /completion-year proxy, not a dated MOP wave/);
});

test('block and inclusive town counts use the same following year and the full uncapped download', () => {
  const rows = [...yearRows(), ...Array.from({ length: 25 }, () => row('2025-06')),
    row('2025-06', { block: '10' }), row('2025-06', { street: 'OTHER RD' }),
    row('2025-06', { town: 'BISHAN' }), row('2024-12'), row('2026-01')];
  const data = result(rows);
  assert.equal(data.comparison.block, 37, 'identical-looking filings can be different units; never deduplicate them');
  assert.equal(data.comparison.town, 39);
  assert.equal(data.comparison.partial, false);
  assert.equal(data.firstMonth, '2024-12');
  const copy = mopCopy(data, rec);
  assert.equal(copy.rows[0].period, copy.rows[1].period);
  assert.match(copy.scope, /town total includes this block/);
});

test('a partial rolling window is labelled and never annualised or expanded to missing months', () => {
  const data = result([row('2025-09'), row('2025-10'), row('2025-11'), row('2025-12')]);
  assert.deepEqual(data.comparison.period, { from: '2025-09', to: '2025-12' });
  assert.equal(data.comparison.block, 4);
  assert.equal(data.comparison.partial, true);
  assert.match(mopCopy(data, rec).partial, /months outside this period have not been treated as zero/);
  assert.match(mopCopy(data, rec).lag, /latest month may be incomplete/);
});

test('a measured zero is distinct from a missing file, unheld year, unknown town or national gap', () => {
  const zero = result(yearRows().map(r => ({ ...r, block: '99' })));
  assert.equal(zero.comparison.block, 0);
  assert.equal(zero.comparison.town, 12);
  assert.equal(zero.firstMonth, null);
  const missing = [
    blockMop(rec, register(), null), result(yearRows(2026)),
    result(yearRows().map(r => ({ ...r, town: 'BISHAN' }))),
    result([row('2025-01'), row('2025-03')]),
    result(yearRows(), register([block()])),
    result(yearRows(), register([block({ earliestMop: 2030, yearCompleted: 2025 }),
      block({ block: '9', earliestMop: 2029, yearCompleted: 2024 }),
      block({ block: '8', earliestMop: 2024, yearCompleted: 2019 })])),
  ];
  for (const data of missing) {
    assert.equal(data.comparison, null);
    assert.deepEqual(mopCopy(data, rec).rows, []);
    assert.match(mopCopy(data, rec).unavailable, /unavailable/);
  }
  assert.equal(missing.at(-1).previousYear, 2029, 'do not skip an unheld wave to find a year with counts');
});

test('a malformed or unsourced download emits no count index, including a truncated row list', () => {
  for (const bad of [null, {}, input([]), { ...input(yearRows()), count: 100 },
    { ...input(yearRows()), source: null }, { ...input(yearRows()), accessedAt: null },
    input([row('2025-13')]), input([row('2025-01', { street: '' })])]) {
    assert.equal(buildMopFilings(bad), null);
  }
});

test('the rendered vocabulary stays factual and contains neither a valuation nor a selling prompt', () => {
  const copies = [result(), result([row('2025-10')]), result([], null),
    result(yearRows(), register([])), result(yearRows(), register([block(), block()]))]
    .map(data => JSON.stringify(mopCopy(data, rec))).join('\n');
  const component = read('components/BlockMop.jsx');
  const text = copies + component;
  assert.doesNotMatch(text, /undervalued|best deal|\bexpert\b|\bspecialist\b|prices are strong|just sold/i);
  assert.doesNotMatch(text, /should sell|sell now|time to sell|ready to sell|can (?:now )?sell|eligible to sell|your.*wait is up/i);
  assert.doesNotMatch(text, /your (?:flat|home|property).*worth|estimated value|valuation|S\$|psf|medianPrice|medianPsf|firstResaleSeen/i);
  assert.match(copies, /registered filings, not listings or distinct households/);
  assert.match(component, /<Source source=\{data.filingSource\} period=\{row.period\}/,
    'every count needs its source and period at the point of reading');
  assert.match(component, /<Source source=\{data.source\}/);
  assert.match(component, /aria-labelledby="block-mop-title"/);
});

test('real-data joins agree with raw rows and a block payload does not ship a register', () => {
  const mop = JSON.parse(read('data/mop.json'));
  const hdb = JSON.parse(read('data/hdb.json'));
  const index = buildMopFilings(hdb);
  const blocks = Object.values(mop.towns).flatMap(t => Object.values(t.byYear).flatMap(y => y.list));
  let checked = 0;
  for (const b of blocks.filter(b => b.earliestMop >= 2024 && b.earliestMop <= 2026).filter((_, i) => i % 20 === 0)) {
    const r = { ...b, kind: 'HDB', label: `Blk ${b.block} ${b.street}`, href: hdbHref(b.town, b.block, b.street) };
    const data = blockMop(r, mop, index);
    assert.equal(data.earliestYear, b.earliestMop);
    assert.ok(JSON.stringify(data).length < 1600, 'only the resolved context crosses the client boundary');
    if (!data.comparison) continue;
    const { from, to } = data.comparison.period;
    const rows = hdb.rows.filter(row => row.town === b.town && row.month >= from && row.month <= to);
    assert.equal(data.comparison.town, rows.length);
    assert.equal(data.comparison.block, rows.filter(row => row.block === b.block && row.street === b.street).length);
    checked++;
  }
  assert.ok(checked > 0, 'the current register should exercise a measured comparison');
});

test('long-tail HDB pages carry the small index through tracing and render the section without signup', () => {
  const includes = config.outputFileTracingIncludes['/hdb/*/*'];
  assert.ok(includes.includes('./data/mop.json'));
  assert.ok(includes.includes('./data/mop-filings.json'));
  assert.ok(config.outputFileTracingExcludes['**'].includes('./data/hdb.json'));
  assert.match(read('app/hdb/[town]/[block]/page.jsx'), /mop=\{mopFor\(rec\)\}/);
  assert.match(read('components/RecordPage.jsx'), /\{hdb && mop && <BlockMop data=\{mop\} rec=\{rec\} \/>\}/);
  assert.match(read('components/SectionNav.jsx'), /id: 'mop', label: 'MOP context'/);
});
