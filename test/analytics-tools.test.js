import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { EVENTS, sanitise } from '../lib/analytics.js';
import { NAV } from '../lib/nav.js';

/**
 * Measuring which tools are used, without measuring the people using them.
 *
 * The privacy contract in lib/analytics.js is the reason this site has no
 * cookie banner, and a tool-use event is the first thing added since that was
 * written which could plausibly carry something personal — a price, an
 * address, a floor area. These tests exist to make sure it never does.
 */

test('a tool run carries the tool and nothing else', () => {
  // What somebody is working out about their own home is theirs. The
  // allowlist is what makes that a guarantee rather than an intention.
  const kept = sanitise({
    e: EVENTS.TOOL_RUN, s: 'abc123', tool: 'cost',
    price: 1_875_000, href: '/condo/normanton-park', q: '242 bishan', beds: 3,
  });
  assert.deepEqual(Object.keys(kept).sort(), ['e', 's', 't', 'tool'].sort());
  assert.equal(kept.tool, 'cost');
});

test('a situation carries the id and nothing else', () => {
  const kept = sanitise({ e: EVENTS.SITUATION, s: 'abc123', id: 'buying', p: '/tools/buying', ip: '1.2.3.4' });
  assert.deepEqual(Object.keys(kept).sort(), ['e', 'id', 's', 't'].sort());
});

test('every tool page records that it was used', () => {
  // A tool missing its marker is invisible in the report, and would then look
  // like a tool nobody uses — which is the exact judgement this data exists
  // to inform. Silence must not read as evidence of disuse.
  const tools = NAV.find(g => /tool/i.test(g.group)).items
    .map(i => i.href).filter(h => h !== '/tools');
  for (const href of tools) {
    const p = new URL(`../app${href}/page.jsx`, import.meta.url);
    assert.ok(existsSync(p), `${href} has no page`);
    const src = readFileSync(p, 'utf8');
    assert.match(src, /<ToolUse\b/, `${href} does not record that it was used`);
    assert.match(src, new RegExp(`id="${href.slice(1)}"`), `${href}'s ToolUse id does not match its route`);
  }
});

test('the nav is not counted as using the tool it sits on', () => {
  // The search box and the menu are on every page. Typing an address into the
  // masthead while standing on /plan would otherwise record a use of /plan,
  // and the whole count would become an interaction count.
  const src = readFileSync(new URL('../components/ToolUse.jsx', import.meta.url), 'utf8');
  assert.match(src, /gnav/, 'events from the nav must be ignored');
  assert.match(src, /closest/, 'the guard has to walk up from the target');
});

test('arriving is not using', () => {
  // A pageview already records arrival. If arriving counted, every tool would
  // look used and the number would answer nothing.
  const src = readFileSync(new URL('../components/ToolUse.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /toolRun\(id\);\s*\n\s*\}, \[id\]\)/, 'ToolUse fires on mount');
  assert.match(src, /addEventListener/);
});

test('a tool run is reported outside the lead funnel', async () => {
  // Somebody who used a calculator and left satisfied is not a leak. Lining
  // tool use up as a funnel step would make the funnel read as leakier than
  // it is every time the site did its job.
  const { FUNNEL } = await import('../lib/analytics.js');
  assert.ok(!FUNNEL.some(s => s.key === EVENTS.TOOL_RUN));
});
