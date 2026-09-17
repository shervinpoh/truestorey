/**
 * `npm run stats -- all` read half the table and called it all.
 *
 * recentEvents asked for 20,000 rows in one request. PostgREST caps every
 * response at max-rows — 1,000 on Supabase — and says nothing, so the report
 * printed "1,000 events · 110 sessions" over a table of 2,043 events and 245
 * sessions. Every decision about which tool to build next was being read off
 * the newest half of the traffic.
 *
 * The fake server below does what Supabase does: honours `id=lt.` and
 * `order=id.desc`, and silently truncates at 1,000 whatever limit it is sent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentEvents } from '../lib/supabase/rest.js';

function fakeSupabase(total, { insertDuringRead = 0 } = {}) {
  let rows = Array.from({ length: total }, (_, i) => ({ id: i + 1, t: `t${i + 1}`, e: 'view', s: `s${i % 7}`, props: { p: '/' } }));
  let calls = 0;
  return {
    get calls() { return calls; },
    fetch: async url => {
      calls++;
      const q = new URL(url).searchParams;
      assert.equal(q.get('order'), 'id.desc', 'paging must be keyed on id, newest first');
      // A write lands between two pages. With offset paging this shifts the
      // boundary and one row is counted twice; keyed on id it cannot.
      if (calls === 2) for (let k = 0; k < insertDuringRead; k++) rows.push({ id: rows.length + 1, t: 'new', e: 'view', s: 'x', props: {} });
      const lt = q.get('id')?.replace(/^lt\./, '');
      const page = rows.filter(r => !lt || r.id < Number(lt)).sort((a, b) => b.id - a.id)
        .slice(0, Math.min(Number(q.get('limit')), 1000));
      return new Response(JSON.stringify(page), { status: 200 });
    },
  };
}

async function withFake(fake, fn) {
  const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  globalThis.fetch = fake.fetch;
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  try { return await fn(); } finally {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = saved.key;
  }
}

test('every event is read when the table is larger than one response', async () => {
  const fake = fakeSupabase(2043);
  const { rows, error } = await withFake(fake, () => recentEvents({ limit: 20000 }));
  assert.equal(error, null);
  assert.equal(rows.length, 2043, 'stats would report half the traffic as all of it');
  assert.ok(fake.calls >= 3, 'a table over 1,000 rows cannot be read in one response');
});

test('a write during the read is neither double-counted nor skipped', async () => {
  const fake = fakeSupabase(2500, { insertDuringRead: 5 });
  const { rows } = await withFake(fake, () => recentEvents({ limit: 20000 }));
  assert.equal(rows.length, 2500, 'rows written after the first page shifted the pages');
  assert.equal(new Set(rows.map(r => r.t)).size, 2500, 'a row was read twice');
});

test('the limit is still a limit, and the newest come first', async () => {
  const fake = fakeSupabase(2043);
  const { rows } = await withFake(fake, () => recentEvents({ limit: 1500 }));
  assert.equal(rows.length, 1500);
  assert.equal(rows[0].t, 't2043');
  assert.equal(rows.at(-1).t, 't544');
});
