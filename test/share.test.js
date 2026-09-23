/**
 * A calculator result as a link — lib/share.js, and /cost's use of it.
 *
 * The failures worth a test, each one a one-line change that looks harmless:
 *
 *  · The figures move from the fragment to the query string. Every purchase
 *    price, purchase month and named home then lands in the host's request
 *    log on every open. Nothing on screen changes, which is why it needs a
 *    test rather than a reviewer.
 *  · A link is trusted. A fragment is typed by anyone; a figure that fails
 *    validation must be named as unread, never clamped into a number the
 *    sender did not send.
 *  · The page rewrites a fragment it did not write, and #mop-style anchors
 *    stop working on the page that owns them.
 *  · The share event gains a field. Analytics is allowlisted precisely so
 *    that an extra property cannot put a figure in the events table.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COST_SHARE, COST_LABELS, PLAN_SHARE, PLAN_LABELS, PROGRESSIVE_SHARE, PROGRESSIVE_LABELS, BLINDSPOT_SHARE, BLINDSPOT_LABELS, blindspotShareInput, decodeShare, encodeShare } from '../lib/share.js';
import { EVENTS, sanitise } from '../lib/analytics.js';

const code = (...p) => readFileSync(path.join(process.cwd(), ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const sample = {
  price: 1_600_000, bought: '2021-06', type: 'PRIVATE', profile: 'SC', owned: 1,
  cashDown: 200_000, cpfDown: 200_000, cpfMonthly: 2_500, rate: 3.6, tenure: 30, held: 5, agent: 2,
};

test('a result survives the round trip exactly, including a named home', () => {
  const withHome = { ...sample, home: '/condo/normanton-park', label: "Normanton Park — St. Mary's", beds: '3' };
  for (const values of [sample, withHome]) {
    const got = decodeShare(COST_SHARE, '#' + encodeShare(COST_SHARE, values));
    assert.deepEqual(got.dropped, []);
    assert.deepEqual(got.values, values);
  }
});

test('an anchor, an empty hash or another version is not a share link', () => {
  for (const h of ['', '#', '#mop', '#transactions', 'mop', '#v=2&price=1600000', '#price=1600000']) {
    assert.equal(decodeShare(COST_SHARE, h), null, `${JSON.stringify(h)} decoded as a share link`);
  }
});

test('a link is untrusted: a bad field is named as unread, never clamped or guessed', () => {
  const got = decodeShare(COST_SHARE, '#' + new URLSearchParams({
    v: '1', price: '-5', bought: '2021-13', type: 'VILLA', tenure: '99', rate: '3.6abc',
    cashDown: '1e6', home: 'javascript:alert(1)', label: 'x'.repeat(81), beds: '6',
    held: '7', agent: '1.5',
  }).toString());
  assert.deepEqual(got.values, { held: 7, agent: 1.5 });
  assert.deepEqual(got.dropped.sort(),
    ['bought', 'beds', 'cashDown', 'home', 'label', 'price', 'rate', 'tenure', 'type'].sort());
  assert.ok(!('tenure' in got.values), 'tenure 99 was clamped into a figure the sender never typed');
  for (const bad of ['https://evil.example/x', '//evil.example', '/hdb/../../etc', '/HDB/Bishan', '/condo/a/b/c']) {
    assert.deepEqual(decodeShare(COST_SHARE, `#v=1&home=${encodeURIComponent(bad)}`).dropped, ['home'], bad);
  }
  for (const k of got.dropped) assert.ok(COST_LABELS[k], `no human name for ${k}, so the page cannot say which figure it dropped`);
});

test('a label cannot carry a line break or a control character into the page', () => {
  const got = decodeShare(COST_SHARE, '#' + new URLSearchParams({ v: '1', label: 'Blk 1\n\u0000Two\tThree  ' }));
  assert.equal(got.values.label, 'Blk 1 Two Three');
});

test('encoding never produces a link its own decoder refuses', () => {
  /* The sender's figures as the page holds them: an input's string, a slider's
     float, a cleared box. A link that opened with "your price could not be
     read" would be this function's fault, not the reader's. */
  const held = { ...sample, price: 1_600_000.4, rate: '3.60', agent: '2', tenure: '30', owned: '2', cashDown: '' };
  const hash = encodeShare(COST_SHARE, held);
  const got = decodeShare(COST_SHARE, '#' + hash);
  assert.deepEqual(got.dropped, []);
  assert.equal(got.values.price, 1_600_000);
  assert.equal(got.values.rate, 3.6);
  assert.equal(got.values.owned, 2);
  assert.ok(!('cashDown' in got.values), 'an empty field is left out, not sent as zero');
  assert.ok(!encodeShare(COST_SHARE, { ...sample, price: 0 }).includes('price='),
    'a value the decoder would refuse is left out at the source');
});

const TOOLS = [
  ['components/Ledger.jsx', 'COST_SHARE', 'COST_LABELS', 'cost'],
  ['components/Planner.jsx', 'PLAN_SHARE', 'PLAN_LABELS', 'plan'],
  ['components/Progressive.jsx', 'PROGRESSIVE_SHARE', 'PROGRESSIVE_LABELS', 'progressive'],
];

test('the figures stay in the fragment and never reach a query string, on every tool', () => {
  const hook = code('components', 'useShareLink.js');
  assert.match(hook, /decodeShare\(schema, window\.location\.hash\)/, 'a shared link is no longer read from the fragment');
  assert.match(hook, /url: \(\) => `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}#\$\{shareHash\}`/,
    'the copied link is not pathname + # + fragment');
  for (const f of ['components/useShareLink.js', ...TOOLS.map(t => t[0])]) {
    const src = code(...f.split('/'));
    assert.doesNotMatch(src, /useSearchParams|URLSearchParams\(window\.location\.search|\?\$\{shareHash\}/,
      `${f} puts share state in, or reads it from, the query string — those reach the server log on every open`);
  }
});

test('every tool uses the one hook, with its own schema, labels and share button', () => {
  /* Three copies of the read-and-sync logic is how one of them ends up
     overwriting anchors or trusting a link while the other two do not. */
  for (const [f, schema, labels, tool] of TOOLS) {
    const src = code(...f.split('/'));
    assert.match(src, new RegExp(`useShareLink\\(${schema},`), `${f} does not read its link through useShareLink`);
    assert.doesNotMatch(src, /decodeShare\(|replaceState\(/, `${f} carries its own copy of the link logic`);
    assert.match(src, new RegExp(`<OpenedFromLink fromLink=\\{fromLink\\} labels=\\{${labels}\\} />`),
      `${f} opens a link without saying so, or without naming what it could not read`);
    assert.match(src, new RegExp(`<ShareResult tool="${tool}" title="[^"]+" url=\\{shareUrl\\} />`), `${f} has no share button`);
  }
});

test('the hook only rewrites a fragment it wrote, and a page at its start carries none', () => {
  const hook = code('components', 'useShareLink.js');
  assert.match(hook, /const ours = decodeShare\(schema, hash\) !== null;/);
  assert.match(hook, /if \(ours\) window\.history\.replaceState/, 'a fragment is cleared without checking it is a share link');
  assert.match(hook, /\(ours \|\| !hash\)/, 'an anchor somebody linked to is overwritten');
  assert.match(hook, /if \(start\.current === null\) start\.current = shareHash;/);
  assert.match(hook, /if \(shareHash === start\.current\)/,
    'the page compares against fixed defaults, so /plan opened from a block page gets a fragment nobody made');
});

test('/plan and /progressive links survive the round trip, on/off and numbered choices included', () => {
  const plan = { price: 720_000, type: 'EC_RESALE', hdbLoan: false, a1: 6200, g1: 34, a2: 0, g2: 32,
    debts: 800, cash: 80_000, cpf: 120_000, profile: 'SPR', owned: 2, loans: 1 };
  const p = decodeShare(PLAN_SHARE, '#' + encodeShare(PLAN_SHARE, plan));
  assert.deepEqual(p.dropped, []);
  assert.deepEqual(p.values, plan, 'false and 0 must survive — a falsy value is still a value');

  const prog = { price: 2_100_000, ltv: 0.55, fee: 0.1, rate: 2.85, tenure: 30, profile: 'FOREIGNER', owned: 3 };
  const g = decodeShare(PROGRESSIVE_SHARE, '#' + encodeShare(PROGRESSIVE_SHARE, prog));
  assert.deepEqual(g.dropped, []);
  assert.deepEqual(g.values, prog);

  const bad = decodeShare(PROGRESSIVE_SHARE, '#v=1&ltv=0.6&fee=0.10&price=1500000');
  assert.deepEqual(bad.dropped, ['ltv'], '0.6 is not a loan-to-value tier and must not be accepted as one');
  assert.equal(bad.values.fee, 0.1, '"0.10" is the 10% booking fee, written another way');
  assert.deepEqual(decodeShare(PLAN_SHARE, '#v=1&hdbLoan=true&loans=2').dropped, ['hdbLoan', 'loans']);
});

test('a Blindspot link restores the exact property and listing inputs, never a posted score', () => {
  const inputs = { home: '/hdb/bishan/242-bishan-st-22', price: 1_200_000, area: 1292, floor: 12 };
  const hash = '#' + encodeShare(BLINDSPOT_SHARE, inputs);
  assert.deepEqual(blindspotShareInput(hash), { values: inputs });
  assert.ok(!hash.includes('points='), 'a score belongs to the rubric, not the link');
  assert.equal(blindspotShareInput('#v=1&home=%2Fhdb%2Fbishan%2F242-bishan-st-22&price=1200000').error.length > 0, true,
    'a missing area must not silently become a default home size');
  assert.match(blindspotShareInput('#v=1&home=javascript%3Aalert%281%29&price=1200000&area=1292').error,
    /could not be read/, 'an invalid property must not be fetched');
  assert.match(blindspotShareInput('#v=1&home=%2Fhdb%2Fbishan%2F242-bishan-st-22&price=abc&area=1292').error,
    /could not be read/, 'a changed asking price must not be guessed');
  assert.equal(blindspotShareInput('#how-to-read'), null, 'an ordinary anchor is not a shared check');
  for (const key of Object.keys(BLINDSPOT_SHARE.fields)) assert.ok(BLINDSPOT_LABELS[key]);
});

test('Blindspot shares the completed inputs, not a stale form or generated summary', () => {
  const src = code('components', 'BlindspotReport.jsx');
  assert.match(src, /price: r\.input\.askPrice/);
  assert.match(src, /area: r\.input\.areaSqft/);
  assert.match(src, /home: r\.record\.href/);
  assert.match(src, /blindspotShareInput\(window\.location\.hash\)/);
  assert.match(src, /setReport\(null\);\s*setState\('idle'\)/,
    'editing an input leaves an old answer below the new asking price');
  assert.doesNotMatch(src, /[?]v=1&home=/, 'shared inputs moved into a server-visible query string');
});

test('every field a link can carry has a name the page can say', () => {
  for (const [schema, labels] of [[COST_SHARE, COST_LABELS], [PLAN_SHARE, PLAN_LABELS], [PROGRESSIVE_SHARE, PROGRESSIVE_LABELS], [BLINDSPOT_SHARE, BLINDSPOT_LABELS]]) {
    const missing = Object.keys(schema.fields).filter(k => !labels[k]);
    assert.deepEqual(missing, [], `${schema.tool}: a dropped field would be named by its code, not in words`);
  }
});

test('/plan applies a linked type without clamping the linked price', () => {
  /* chooseType pulls the price down to the new type's slider ceiling. A link
     carrying a S$2m EC resale must open at S$2m, not at whatever the slider
     tops out at. */
  const src = code('components', 'Planner.jsx');
  const apply = /useShareLink\(PLAN_SHARE,[\s\S]*?\}\);/.exec(src)?.[0] || '';
  assert.match(apply, /type: setType/);
  assert.doesNotMatch(apply, /chooseType/);
});

test('the share event can carry the tool and the method, and nothing else', () => {
  const src = code('lib', 'analytics.js');
  assert.match(src, /\[EVENTS\.SHARE\]:\s*\['tool', 'how'\]/);
  const out = sanitise({ e: EVENTS.SHARE, s: 'abc123', tool: 'cost', how: 'copy', price: 1_600_000, url: '/cost#v=1&price=1600000' });
  assert.deepEqual(Object.keys(out).sort(), ['e', 'how', 's', 't', 'tool']);
});

test('the share control says where the figures go, and builds the link at the click', () => {
  const src = code('components', 'ShareResult.jsx');
  assert.match(src, /never sends to a server/, 'the note about where the figures go is gone');
  assert.match(src, /Anyone you\s+send it to sees the same figures/, 'the note stopped saying the recipient sees the figures');
  assert.match(src, /const link = url\(\);/, 'the link is built before the click, so a fast click copies a stale result');
  assert.match(src, /track\(EVENTS\.SHARE, \{ tool, how: 'copy' \}\)/);
});
