/**
 * Search falling back to OneMap (SLA) when nothing filed matches.
 *
 * The failures each test here describes:
 *  · OneMap's advisory `error` is read as a refusal. Unauthenticated, every
 *    answer carries "Authentication token missing" — beside real results, and
 *    beside `found: 0` for an address that does not exist. Read wrongly, the
 *    box tells a reader SLA "could not be reached" for every typo, or finds
 *    nothing at all (the batch geocoder's own recorded failure).
 *  · A throttle is cached. OneMap 429s after a few requests and serves the 429
 *    as HTML. Cache that and the address stays "unreachable" for a day.
 *  · A block number is matched without its road, and "22" finds the wrong 22.
 *  · The fetcher is bundled into the browser, or asked on every keystroke.
 *  · /privacy goes on saying no government API is asked anything at request
 *    time — or, as happened with the share event, lists an event with a blank.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lookupAddress, _clearOnemapCache } from '../lib/onemap.js';
import { resolveAddresses, roadKey, worthLooking, emptyLine } from '../lib/address.js';
import { searchEntries } from '../lib/data/query.js';
import { EVENTS } from '../lib/analytics.js';

const code = (...p) => readFileSync(path.join(process.cwd(), ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

function server(body, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}
const ADVISORY = 'Authentication token missing. Please create an account and generate or renew your API Token.';

test('OneMap’s token advisory is not a refusal, beside results or beside found: 0', async () => {
  _clearOnemapCache();
  const withResults = server({ error: ADVISORY, found: 1,
    results: [{ BLK_NO: '22', ROAD_NAME: 'CASHEW CRESCENT', BUILDING: 'CASHEW VILLAS', POSTAL: '679767' }] });
  const a = await lookupAddress('22 cashew crescent', withResults);
  assert.equal(a.status, 'ok');
  assert.deepEqual(a.results[0], { blk: '22', road: 'CASHEW CRESCENT', building: 'CASHEW VILLAS', postal: '679767' });

  const notFound = server({ error: ADVISORY, found: 0, totalNumPages: 0, pageNum: 1, results: [] });
  assert.equal((await lookupAddress('88 nonexistent garden road', notFound)).status, 'none',
    'an address OneMap searched and did not find was reported as OneMap being unreachable');

  const refused = server({ error: 'Unauthorised' });
  assert.deepEqual(await lookupAddress('some refused street', refused), { status: 'unavailable', reason: 'refused' });
});

test('a throttle or an unreadable answer is unavailable and is never cached', async () => {
  _clearOnemapCache();
  const html = server('<html><head><title>429 Too Many Requests</title></head></html>', 429);
  assert.equal((await lookupAddress('throttled street one', html)).status, 'unavailable');
  await lookupAddress('throttled street one', html);
  assert.equal(html.calls.length, 2, 'a 429 was cached, so the address would stay unreachable for a day');

  const htmlAs200 = server('<html>maintenance</html>');
  assert.deepEqual(await lookupAddress('maintenance road', htmlAs200), { status: 'unavailable', reason: 'unreadable answer' });

  const down = { fetchImpl: async () => { throw Object.assign(new Error('boom'), { name: 'TimeoutError' }); } };
  assert.deepEqual(await lookupAddress('slow road here', down), { status: 'unavailable', reason: 'timed out' });
});

test('an answer is cached; a query not worth asking never leaves the server', async () => {
  _clearOnemapCache();
  const s = server({ found: 0, results: [] });
  await lookupAddress('cached avenue', s);
  await lookupAddress('CACHED  Avenue!', s);
  assert.equal(s.calls.length, 1, 'the same address was asked twice');

  for (const q of ['ab', '5601', '12345', '1234567', 'bt 2']) {
    assert.equal(worthLooking(q), false, `"${q}" would spend a OneMap request`);
    assert.equal((await lookupAddress(q, s)).status, 'skipped');
  }
  assert.equal(worthLooking('679767'), true, 'a full postal code is worth asking');
  assert.equal(s.calls.length, 1);
});

test('a token, when set, is sent', async () => {
  _clearOnemapCache();
  const saved = process.env.ONEMAP_TOKEN;
  process.env.ONEMAP_TOKEN = 'tok123';
  try {
    const s = server({ found: 0, results: [] });
    await lookupAddress('token check road', s);
    assert.equal(s.calls[0].init.headers.Authorization, 'tok123');
  } finally {
    if (saved === undefined) delete process.env.ONEMAP_TOKEN; else process.env.ONEMAP_TOKEN = saved;
  }
});

test('an OneMap address reaches the right filed record, and only that one', () => {
  const entries = searchEntries();
  const hdbBishan = entries.find(e => /^Blk \S+ BISHAN ST 11$/.test(e.n));
  assert.ok(hdbBishan, 'no Bishan St 11 block in the index to test against');
  const blk = hdbBishan.n.split(' ')[1];

  const { hits, addresses } = resolveAddresses([
    { blk: '22', road: 'CASHEW CRESCENT', building: 'CASHEW VILLAS', postal: '679767' },
    { blk: '570', road: 'ANG MO KIO AVENUE 3', building: 'CHENG SAN COURT', postal: '560570' },
    { blk, road: 'BISHAN STREET 11', building: null, postal: null },
    { blk: '1', road: 'NORMANTON PARK', building: 'NORMANTON PARK', postal: null },
    { blk: '9', road: 'NO FILED SALE CLOSE', building: null, postal: '999999' },
  ], entries);
  const by = Object.fromEntries(addresses.map(a => [a.address, a]));
  assert.equal(by['22 Cashew Crescent, Cashew Villas, Singapore 679767'].href, '/landed/cashew-crescent');
  assert.equal(by['22 Cashew Crescent, Cashew Villas, Singapore 679767'].via, 'street');
  assert.equal(by['570 Ang Mo Kio Avenue 3, Cheng San Court, Singapore 560570'].href, '/hdb/ang-mo-kio/570-ang-mo-kio-ave-3',
    'AVENUE and AVE are the same road');
  assert.equal(addresses[2].href, hdbBishan.h, 'STREET did not meet HDB’s ST');
  assert.equal(by['1 Normanton Park, Normanton Park'].via, 'building');
  assert.equal(by['9 No Filed Sale Close, Singapore 999999'].href, null,
    'an address with no filed record must come back as a known address with nothing filed, not be dropped');
  assert.equal(hits.length, 4);
});

test('a block number never matches on another road, and a shared name matches nothing', () => {
  const entries = searchEntries();
  const r = resolveAddresses([{ blk: '570', road: 'BISHAN STREET 11', building: null, postal: null }], entries, { kind: 'HDB' });
  assert.ok(!r.hits.some(h => h.entry.h === '/hdb/ang-mo-kio/570-ang-mo-kio-ave-3'), 'a block matched on its number alone');

  const twins = [
    { h: '/condo/the-gardens-a', n: 'THE GARDENS', t: 'P' },
    { h: '/condo/the-gardens-b', n: 'THE GARDENS', t: 'P' },
  ];
  assert.equal(resolveAddresses([{ blk: '1', road: 'X ROAD', building: 'THE GARDENS', postal: null }], twins).hits.length, 0,
    'a building name two records share picked one of them');

  assert.equal(roadKey("ST. GEORGE'S LANE"), 'ST GEORGE S LANE', 'Saint was expanded or collapsed');
  const landedOnly = resolveAddresses([{ blk: '22', road: 'CASHEW CRESCENT', building: null, postal: null }], entries, { kind: 'HDB' });
  assert.equal(landedOnly.hits.length, 0, 'an HDB-only search returned a landed street');
});

test('the route asks OneMap only when asked to, and only after nothing filed matched', () => {
  const src = code('app', 'api', 'search', 'route.js');
  assert.match(src, /if \(results\.length \|\| p\.get\('resolve'\) !== '1'\) return NextResponse\.json\(\{ results \}\);\s*\n\s*const found = await lookupAddress\(q\);/,
    'OneMap is reachable without resolve=1 or when the local index already answered');
});

test('the search box asks only after a pause, and never bundles the fetcher', () => {
  const src = code('components', 'Search.jsx');
  assert.doesNotMatch(src, /lib\/onemap\.js/, 'the OneMap client is imported into a browser component');
  assert.match(src, /if \(results\.length \|\| !worthLooking\(term\)\) return settle\(results\);/);
  assert.match(src, /pause = setTimeout\(\(\) => \{\s*fetch\(`\/api\/search\?q=\$\{encodeURIComponent\(term\)\}&limit=8&resolve=1`/,
    'resolve=1 is sent without waiting for the reader to pause');
  assert.match(src, /clearTimeout\(pause\)/, 'a pending OneMap request survives the next keystroke');
  assert.match(src, /\{emptyLine\(resolved\)\}/, 'the box no longer says which kind of empty it is');
});

test('three different empties say three different things', () => {
  const known = emptyLine({ status: 'ok', addresses: [{ address: '9 Quiet Close, Singapore 123456', href: null }] });
  assert.match(known, /knows 9 Quiet Close, Singapore 123456, but no sale there is in the filed transactions/);
  assert.match(emptyLine({ status: 'none' }), /does not recognise it as an address/);
  assert.match(emptyLine({ status: 'unavailable', reason: 'throttled' }), /could not be reached to check the address/);
  assert.match(emptyLine(null), /^Nothing matching that\./);
  const lines = new Set([known, emptyLine({ status: 'none' }), emptyLine({ status: 'unavailable' }), emptyLine(null)]);
  assert.equal(lines.size, 4, 'two different outcomes read the same — "unreachable" and "no such address" are not the same news');
});

test('/privacy says when OneMap is asked, and describes every analytics event', () => {
  const src = readFileSync(path.join(process.cwd(), 'app', 'privacy', 'page.jsx'), 'utf8');
  assert.match(src, /OneMap/, '/privacy still says no government API is asked anything at request time');
  assert.match(src, /not your IP address/);
  const described = new Set([...src.matchAll(/^\s{2}([A-Z_]+):\s*'/gm)].map(m => m[1]));
  const missing = Object.keys(EVENTS).filter(k => !described.has(k));
  assert.deepEqual(missing, [], 'these events show as a blank row on /privacy — the share event shipped that way');
});

test('a landed street page says it is not a page about one house', () => {
  const src = code('components', 'RecordPage.jsx');
  assert.match(src, /\{rec\.landed && \(\s*<p className="note">\s*<b>Filed by street, not by house\.<\/b>/,
    'search now lands "22 Cashew Crescent" on the street page, and the page no longer says it cannot speak for house 22');
});
