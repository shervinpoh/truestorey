/**
 * /yield was 884KB. Every other page on the site is between 27 and 70.
 *
 * The route already trimmed the dataset before handing it over, and kept the
 * one field that was the bulk: `cohorts`, for all 1,441 projects, averaging
 * 2.7 each — a band, an area range, a bed count, two medians and a yield,
 * every one serialised into the RSC payload so that a COLLAPSED row could
 * print the word "3 sizes".
 *
 * That is the third instance of the failure CLAUDE.md records against /mop and
 * /market: passing a whole dataset because a component takes one field off it.
 * A trim that stops one field short is worse than none, because it looks like
 * the problem was dealt with.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { yields } from '../lib/data/query.js';

const strip = f => readFileSync(path.join(process.cwd(), f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

test('the project list carries a count, not the cohorts', () => {
  const route = strip('app/yield/page.jsx');
  assert.match(route, /sizes: p\.cohorts\?\.length/,
    'the list no longer sends a count');
  assert.doesNotMatch(route, /cohorts: p\.cohorts/,
    'every cohort of every project is in the page again');
});

/* The size the fix is worth, asserted against the real data rather than a
   remembered number, so a dataset that grows cannot quietly undo it. */
test('sending the cohorts would still be an order of magnitude worse', () => {
  const list = Object.values(yields().projects);
  const kb = o => JSON.stringify(o).length / 1024;
  const withCohorts = kb(list.map(p => ({ label: p.label, district: p.district, href: p.href,
                                          grossYield: p.grossYield, cohorts: p.cohorts })));
  const withCount = kb(list.map(p => ({ label: p.label, district: p.district, href: p.href,
                                        grossYield: p.grossYield, sizes: p.cohorts.length })));
  assert.ok(withCount < withCohorts * 0.4,
    `a count is ${Math.round(withCount)}KB against ${Math.round(withCohorts)}KB — the saving has gone`);
});

/**
 * A route that reads data/ at request time is invisible to the tracer, which
 * follows imports statically and cannot see path.join(cwd, 'data', f) with a
 * runtime f. Left out of the map it works perfectly in dev and returns nothing
 * for every project in production. CLAUDE.md says that has been forgotten
 * twice; this is the third route to need it.
 */
test('the cohort route is traced, or it returns nothing in production', () => {
  const cfg = readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');
  assert.match(cfg, /'\/api\/yield':\s*\['\.\/data\/yield\.json'\]/,
    '/api/yield is not in outputFileTracingIncludes');
});

/* Degrade, never break. A cohort table that cannot load is one disclosure off,
   not a broken page, and it must say so rather than spin. */
test('a failed cohort fetch says so and leaves the yield standing', () => {
  const view = strip('components/YieldView.jsx');
  assert.match(view, /'failed'/, 'a failed fetch is no longer distinguished from a pending one');
  assert.match(view, /could not be read/, 'the failure is silent');
  assert.match(view, /Reading the cohorts/, 'there is no pending state, so a slow fetch looks broken');
});
