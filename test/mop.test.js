import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blockMop, buildMopFilings, mopCopy, mopRelevant, namedMonth } from '../lib/mop.js';
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

test('the previous wave is counted at its own blocks, beside the inclusive town total', () => {
  /* The first version counted THIS block and the town. Neither is the previous
     wave, and this block's row was zero by construction whenever the counted
     year came before its own fifth year. */
  const at9 = (month = '2025-06') => row(month, { block: '9' });
  const rows = [...yearRows().map(r => ({ ...r, block: '9' })), ...Array.from({ length: 25 }, () => at9()),
    row('2025-06'), row('2025-06', { block: '10' }), row('2025-06', { street: 'OTHER RD' }),
    row('2025-06', { town: 'BISHAN' }), row('2024-12'), row('2026-01')];
  const data = result(rows);
  assert.equal(data.comparison.year, 2025);
  assert.equal(data.comparison.cohortBlocks, 1);
  assert.equal(data.comparison.cohort, 37, 'identical-looking filings can be different units; never deduplicate them');
  assert.equal(data.comparison.town, 40);
  assert.equal(data.comparison.partial, false);
  assert.equal(data.firstMonth, '2024-12');
  const copy = mopCopy(data, rec);
  assert.ok(copy.rows.every(r => r.period === copy.rows[0].period), 'every row must share one period');
  assert.match(copy.scope, /town total includes the blocks above/);
  assert.match(copy.rows[0].label, /previous wave’s 1 block$/);
});

test('this block is never counted for a year before its own fifth year', () => {
  /* 26 of 278 real pages printed "0 filings" at the block beside the town's
     total, for flats whose five years had not run. A null with a reason is
     the truth; a zero reads as a measurement. */
  const early = result([...yearRows(), row('2025-06')]);
  assert.equal(early.earliestYear, 2026);
  assert.equal(early.comparison.block, null);
  const copy = mopCopy(early, rec);
  assert.ok(!copy.rows.some(r => r.label.startsWith('At ')), 'a block row printed for a year it could not have filed in');
  assert.match(copy.blockNote, /not counted for 2025: its earliest possible fifth year is 2026/);

  const due = result([...yearRows(), row('2025-06')], register([
    block({ yearCompleted: 2020, earliestMop: 2025 }), block({ block: '9', yearCompleted: 2019, earliestMop: 2024 })]));
  assert.equal(due.comparison.year, 2025);
  assert.equal(due.comparison.block, 13, 'a block whose fifth year has arrived is counted');
  assert.equal(mopCopy(due, rec).blockNote, null);
  assert.ok(mopCopy(due, rec).rows.some(r => r.label === 'At Blk 10A Test Rd'));
});

test('the section shows only where MOP is current, and never goes silent on an unknown', () => {
  const window = buildMopFilings(input(yearRows(2024)));
  const at = (changes, r = rec) => mopRelevant(blockMop(r, register([block(changes),
    block({ block: '9', yearCompleted: 2019, earliestMop: 2024 })]), window), r);
  assert.equal(at({}), true, 'fifth year 2026 against a window from 2024');
  assert.equal(at({ yearCompleted: 2019, earliestMop: 2024 }), true, 'a fifth year inside the window');
  assert.equal(at({ yearCompleted: 1976, earliestMop: 1981 }), false, 'a 1981 fifth year is not MOP context');
  const unmatched = r => mopRelevant(blockMop(r, register([]), window), r);
  assert.equal(unmatched({ ...rec, leaseCommence: 1978 }), false, 'an unmatched 1978 block is still a 1978 block');
  assert.equal(unmatched({ ...rec, leaseCommence: 2021 }), true);
  assert.equal(unmatched({ ...rec }), true, 'with no year from anywhere, the could-not-match note is what shows');
  assert.equal(mopRelevant(null, rec), false);
  assert.match(read('lib/data/query.js'), /return mopRelevant\(data, rec\) \? data : null;/,
    'mopFor stopped gating, so the nav and the section appear on every block page again');
});

test('a partial rolling window is labelled and never annualised or expanded to missing months', () => {
  const data = result([row('2025-09'), row('2025-10'), row('2025-11'), row('2025-12')]);
  assert.deepEqual(data.comparison.period, { from: '2025-09', to: '2025-12' });
  assert.equal(data.comparison.town, 4, 'counted over the four held months only');
  assert.equal(data.comparison.partial, true);
  assert.match(mopCopy(data, rec).partial, /months outside this period have not been treated as zero/);
  assert.match(mopCopy(data, rec).lag, /latest month may be incomplete/);
});

test('a measured zero is distinct from a missing file, unheld year, unknown town or national gap', () => {
  const zero = result(yearRows().map(r => ({ ...r, block: '99' })));
  assert.equal(zero.comparison.cohort, 0, 'a held year with no filings at the wave is a measured zero');
  assert.equal(zero.comparison.block, null, 'and this block is not counted before its fifth year');
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
    const wave = new Set(blocks.filter(w => w.town === b.town && w.earliestMop === data.previousYear
      && w.earliestMop === w.yearCompleted + 5).map(w => `${w.block}|${w.street}`));
    assert.equal(data.comparison.cohortBlocks, wave.size);
    assert.equal(data.comparison.cohort, rows.filter(row => wave.has(`${row.block}|${row.street}`)).length);
    if (b.earliestMop > data.comparison.year) assert.equal(data.comparison.block, null);
    else assert.equal(data.comparison.block, rows.filter(row => row.block === b.block && row.street === b.street).length);
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
