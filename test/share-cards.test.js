/**
 * Every page shares as a card, not a grey box.
 *
 * On 25 Sep, 29 pages had no og:image — every tool and index page, which are
 * exactly the pages the share buttons send people to. A link to /cost pasted
 * into WhatsApp arrived as a blank rectangle and a URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { shareCard, ogDefault, ogForRecord } from '../lib/og.js';
import { NAV } from '../lib/nav.js';

const root = process.cwd();
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8');

test('the layout gives every page a card by default', () => {
  const src = read('app', 'layout.jsx');
  assert.match(src, /images: \[\{ url: ogDefault\(\), width: 1200, height: 630 \}\]/,
    'a page without its own card shares as a grey box again');
  assert.match(ogDefault(), /^\/og\?t=/);
});

test('every page in the menu carries its own card, for its own route', () => {
  const routes = NAV.flatMap(g => g.items || []).map(i => i.href)
    .filter(h => /^\/[a-z-]+$/.test(h) && existsSync(path.join(root, 'app', h.slice(1), 'page.jsx')));
  assert.ok(routes.length > 20, `only ${routes.length} menu routes found`);
  for (const h of routes) {
    const src = read('app', h.slice(1), 'page.jsx');
    assert.match(src, new RegExp(`\\.\\.\\.shareCard\\('${h}'\\)`), `${h} shares as the generic card, or as another page's`);
  }
});

test('a tool card leads with the question the tool answers', () => {
  const card = shareCard('/cost');
  const url = new URL(card.openGraph.images[0].url, 'https://x');
  const cost = NAV.flatMap(g => g.items || []).find(i => i.href === '/cost');
  assert.equal(url.searchParams.get('t'), cost.plain, 'the card headline drifted from the menu wording');
  assert.equal(card.twitter.card, 'summary_large_image');
  assert.equal(card.openGraph.siteName, 'Truestorey', 'a page card dropped the site name the layout sets');
});

test('record cards print S$, as the pages do', () => {
  const url = ogForRecord({ label: 'Blk 1 Test Rd', medianPsf: 600, minPsf: 500, maxPsf: 700, n: 9,
    kind: 'HDB', town: 'BISHAN', source: 'HDB', period: { from: '2023-09', to: '2026-09' } });
  const s = new URL(url, 'https://x').searchParams.get('s');
  assert.match(s, /^S\$500 — S\$700 psf/);
});
