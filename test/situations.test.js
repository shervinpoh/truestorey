import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV, SITUATIONS, QUICK, situationTools, itemFor, runsOf } from '../lib/nav.js';

/**
 * The guided layer, held to the thing it was built for.
 *
 * The complaint was not that the site lacked tools. It was that a first-time
 * visitor had to understand Truestorey's own taxonomy before choosing a
 * question — twelve destinations in one menu, named after mechanisms. These
 * tests guard the two properties that fix stays fixed by: FEW choices at the
 * doorway, and NO jargon in them. Both are easy to lose one well-meaning
 * addition at a time, which is exactly how the menu got to twelve.
 */

/* Words that are accurate, load-bearing in the detail layer, and fatal in a
 * doorway. Someone who knows what TDSR stands for does not need a guided path;
 * someone who does not is the entire audience for one. */
const JARGON = /\b(TDSR|MSR|LTV|CPF|MOP|GLS|ABSD|BSD|SSD|psf|GFA|SORA|OTP|QP|REALIS|RSA)\b/;

const everySituationItem = () =>
  SITUATIONS.flatMap(s => {
    const r = situationTools(s.id);
    return [...r.primaryItems, ...r.moreItems];
  });

/* ── few choices ───────────────────────────────────────────────────────────── */

test('the doorway offers three situations, not twelve tools', () => {
  assert.equal(SITUATIONS.length, 3,
    'a fourth situation is a fourth thing to read before being helped — argue it in NEXT.md first');
});

test('no situation reveals more than three recommended starts', () => {
  // A situation that opens onto eight tools has reproduced the original
  // problem one level down, which is the failure mode worth a test.
  for (const s of SITUATIONS) {
    assert.ok(s.primary.length <= 3,
      `${s.id} recommends ${s.primary.length} starting points; the cap is three`);
    assert.ok(s.primary.length >= 1, `${s.id} recommends nothing`);
  }
});

/* ── no jargon in the choosing path ────────────────────────────────────────── */

test('a situation can be chosen without knowing a property acronym', () => {
  for (const s of SITUATIONS) {
    assert.doesNotMatch(s.label, JARGON, `situation label: ${s.label}`);
    assert.doesNotMatch(s.sub, JARGON, `situation sub: ${s.sub}`);
  }
});

test('every tool offered inside a situation has a plain name', () => {
  for (const i of everySituationItem()) {
    const name = i.plain || i.label;
    assert.ok(i.plain, `${i.href} appears in a situation with no plain: label — it would show "${i.label}"`);
    assert.doesNotMatch(name, JARGON, `${i.href} is offered as "${name}"`);
  }
});

/* ── the promise made before the first input ───────────────────────────────── */

test('every tool says what it is for, what it needs and what it gives', () => {
  // Acceptance criterion 7. A calculator that opens straight onto inputs asks
  // the reader to work out what it does by using it.
  const tools = NAV.find(g => /tool/i.test(g.group)).items.filter(t => t.href !== '/tools');
  for (const t of tools) {
    for (const field of ['plain', 'use', 'need', 'get']) {
      assert.ok(t[field], `${t.href} has no ${field}:`);
      assert.ok(t[field].length > 12, `${t.href} ${field}: is too short to say anything`);
    }
  }
});

test('a claim in a plain label is not stronger than the tool', () => {
  // The handoff proposed "What rent does this price imply?" for /yield. The
  // tool reports a GROSS return from filed rents over filed prices; it implies
  // no rent and computes no net figure — test/yield.test.js guards the latter.
  // Plain language is allowed to simplify and is not allowed to promise more.
  const yieldTool = itemFor('/yield');
  assert.doesNotMatch(yieldTool.plain, /\bnet\b/i);
  assert.match(yieldTool.get, /gross/i, '/yield must say gross where it says anything');
  assert.match(yieldTool.get, /never a net/i);

  // Blindspot scores; it never values. Rule 2.
  assert.match(itemFor('/blindspot').get, /never a valuation/i);
});

/* ── nothing is lost ───────────────────────────────────────────────────────── */

test('every route in the nav is still reachable, situations or not', () => {
  // Criterion 9: the guided layer ADDS a path. It must not remove one. A tool
  // that no situation recommends still lives in the full index and the footer.
  const all = NAV.flatMap(g => g.items).map(i => i.href);
  assert.ok(all.length >= 22, `the nav lost entries: ${all.length}`);
  for (const h of ['/plan', '/cost', '/progressive', '/blindspot', '/compare', '/floors',
                   '/yield', '/lease', '/land', '/floorplan', '/neighbourhood'])
    assert.ok(all.includes(h), `${h} has fallen out of the nav`);
});

test('a quick calculator resolves to its own words, not to the tools index', () => {
  // Without this, "When can I sell?" would open /tools and describe itself as
  // "Everything below, in one place".
  const sell = itemFor('/tools?calc=sell');
  assert.equal(sell.href, '/tools?calc=sell');
  assert.match(sell.label, /when can i sell/i);
  assert.doesNotMatch(sell.get, /everything below/i);
  for (const q of QUICK) assert.ok(itemFor(`/tools?calc=${q.id}`).get, `${q.id} has no get:`);
});

test('every quick calculator id is one the tools page actually renders', () => {
  // A deep link to a tab that does not exist opens the default tab and looks
  // like the link was ignored.
  const src = readFileSync(new URL('../components/Tools.jsx', import.meta.url), 'utf8');
  for (const q of QUICK)
    assert.match(src, new RegExp(`tab === '${q.id}'`),
      `QUICK lists "${q.id}" but Tools.jsx renders no such tab`);
});

/* ── the promise is actually on the page ───────────────────────────────────── */

test('every tool page renders its own introduction', () => {
  // Metadata nobody renders is metadata that quietly rots. Read from source
  // for the same reason test/motion.test.js does: Node does not strip JSX, and
  // a transform would cost more than the three-dependency rule is worth.
  const routes = NAV.find(g => /tool/i.test(g.group)).items
    .filter(t => t.href !== '/tools')
    .map(t => t.href.slice(1));
  for (const r of routes) {
    const src = readFileSync(new URL(`../app/${r}/page.jsx`, import.meta.url), 'utf8');
    assert.match(src, /<ToolIntro\b/, `/${r} has no <ToolIntro>`);
    assert.match(src, new RegExp(`href="/${r}"`), `/${r}'s ToolIntro points somewhere else`);
  }
});

test('a calculator that opens on prefilled figures says they are an example', () => {
  // Criterion 6. An unlabelled specific answer reads as THE answer, and a
  // reader who does not notice the inputs are illustrative can carry a
  // stranger's S$1.6m away as their own.
  for (const r of ['plan', 'cost', 'progressive']) {
    const src = readFileSync(new URL(`../app/${r}/page.jsx`, import.meta.url), 'utf8');
    assert.match(src, /<ToolIntro[^>]*\bexample=/, `/${r} opens on defaults with no example label`);
  }
});

/* ── how many choices are offered at once ──────────────────────────────────── */

test('no menu offers more than four equally weighted choices in one run', () => {
  // The criterion says "equally weighted", not "items". Look up holds six
  // entries and they are not six of a kind: four are ways into the transaction
  // data and two are about the market rather than any address. The fix was to
  // stop rendering a flatness that was not there — not to hide two of them,
  // which would have cost a tap on the site's main content to satisfy a count.
  for (const g of NAV) {
    if (g.guided) continue;               // renders SITUATIONS, asserted above
    for (const run of runsOf(g))
      assert.ok(run.items.length <= 4,
        `${g.group} offers ${run.items.length} choices in one run` +
        (run.label ? ` under "${run.label}"` : ' with no label to divide them'));
  }
});

test('a run label describes its run and is not itself a destination', () => {
  const hrefs = new Set(NAV.flatMap(g => g.items).map(i => i.href));
  for (const g of NAV)
    for (const run of runsOf(g)) {
      if (!run.label) continue;
      assert.ok(run.label.length > 3, `${g.group} has a run label too short to help`);
      assert.ok(!hrefs.has(`/${run.label.toLowerCase().replace(/ /g, '-')}`),
        `"${run.label}" collides with a real route — a reader will try to click it`);
    }
});

test('every item still belongs to exactly one run', () => {
  // runsOf() is what the menu renders. If it ever dropped an item the footer
  // would still list it and the menu quietly would not, which is the
  // nav-in-two-places failure this file exists to prevent.
  for (const g of NAV) {
    const flat = runsOf(g).flatMap(r => r.items);
    assert.deepEqual(flat.map(i => i.href), g.items.map(i => i.href),
      `${g.group} loses or reorders items when split into runs`);
  }
});

/* ── the menu must lead somewhere different each time ──────────────────────── */

test('every situation has its own route, and no two share one', () => {
  // They were anchors into a single page that showed all three cards at once,
  // so all three menu items landed on the same screen — and on a desktop the
  // cards were already above the fold, so the anchor did not even scroll.
  // Three choices, one outcome.
  const hrefs = SITUATIONS.map(s => s.href);
  for (const s of SITUATIONS) {
    assert.ok(s.href, `${s.id} has no route`);
    assert.doesNotMatch(s.href, /#/, `${s.id} is an anchor, not a page`);
  }
  assert.equal(new Set(hrefs).size, hrefs.length, 'two situations share a route');
});

test('each situation route is a real page that renders that situation', () => {
  const src = readFileSync(new URL('../app/tools/[situation]/page.jsx', import.meta.url), 'utf8');
  assert.match(src, /generateStaticParams/, 'the three routes must be prerendered');
  assert.match(src, /dynamicParams = false/, 'an unknown situation must 404, not render empty');
  for (const s of SITUATIONS)
    assert.equal(s.href, `/tools/${s.id}`, `${s.id}'s route does not match its param`);
});

test('a situation page says something of its own', () => {
  // A title and an opening paragraph per situation, or the three pages are
  // the same page with a different list on it.
  const seen = new Set();
  for (const s of SITUATIONS) {
    assert.ok(s.title && s.title.length > 20, `${s.id} has no page title`);
    assert.ok(s.intro && s.intro.length > 80, `${s.id} has no opening paragraph`);
    assert.doesNotMatch(s.title, JARGON, `${s.id} title: ${s.title}`);
    seen.add(s.intro);
  }
  assert.equal(seen.size, SITUATIONS.length, 'two situations share an opening paragraph');
});

test('the situation pages are in the sitemap', async () => {
  // The Tools menu no longer lists the tools, so these three pages ARE the
  // guided route into the site. Absent from the sitemap they are invisible to
  // a crawler — the same failure that once left every calculator out of it.
  const { default: sitemap } = await import('../app/sitemap.js');
  const urls = sitemap().map(e => e.url);
  for (const s of SITUATIONS)
    assert.ok(urls.some(u => u.endsWith(s.href)), `${s.href} is not in the sitemap`);
});
