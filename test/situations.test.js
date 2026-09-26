import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV, SITUATIONS, QUICK, situationTools, itemFor, runsOf, TOOL_GROUPS } from '../lib/nav.js';

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

test('every homepage path explains its sequence in three plain steps', () => {
  for (const s of SITUATIONS) {
    assert.equal(s.flow?.length, 3, `${s.id} does not have a three-step path`);
    for (const step of s.flow) {
      assert.doesNotMatch(step, JARGON, `${s.id} flow step: ${step}`);
    }
  }
});

test('every guided path makes one personal first move before offering alternatives', () => {
  const starts = new Set();
  for (const s of SITUATIONS) {
    assert.match(s.firstMove || '', /^I /, `${s.id} has no first-person starting rationale`);
    assert.ok(s.firstMove.length > 70, `${s.id} first move does not explain why it comes first`);
    assert.ok(s.primary[0], `${s.id} has no first tool`);
    starts.add(s.primary[0]);
  }
  assert.equal(starts.size, SITUATIONS.length,
    'two paths lead with the same tool, so one recommendation is probably generic');

  const page = readFileSync(new URL('../app/tools/[situation]/page.jsx', import.meta.url), 'utf8');
  assert.match(page, /My first move/, 'the personal recommendation is not rendered');
  assert.match(page, /primaryItems\.slice\(1\)/,
    'the first tool is repeated as an equal-weight option below its recommendation');
  assert.doesNotMatch(page, /<p className="lede"[^>]*>\{s\.intro\}/,
    'the path repeats its masthead summary before the first action');
  assert.match(page, /Open \{s\.primaryItems\[0\]\.label\}/,
    'the first button does not name the tool it opens');
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

test('Blindspot asks for listing figures only after a property is chosen', () => {
  const src = readFileSync(new URL('../components/BlindspotReport.jsx', import.meta.url), 'utf8');
  assert.match(src, /\{picked && \([\s\S]*?className="blindspot-listing"/,
    'asking price and floor area are front-loaded before the property step');
  assert.doesNotMatch(src, /Add the listing|Blindspot progress|Step 2/,
    'the form has regained a misleading upload step or unnecessary progress strip');
  assert.match(src, /sent to run the check; no listing is published/,
    'the asking-price step no longer explains what happens to the listing figures');
  assert.match(src, /placeholder="e\.g\. S\$1,250,000"/,
    'the blank asking-price field looks prefilled instead of showing an example');
  assert.match(src, /placeholder="e\.g\. 1,292"/,
    'the blank floor-area field looks prefilled instead of showing an example');
});

test('/tools does not promise that optional report email is absent', () => {
  const page = readFileSync(new URL('../app/tools/page.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /none of it asks for an email/i,
    'the tools index denies the optional report-email control rendered by the calculators');
  assert.match(page, /Every answer is free with no email required/,
    'the corrected copy stopped protecting the no-gate promise');
  assert.match(page, /emailed after you have read them/,
    'the optional copy is not distinguished from an email wall');
});

test('lead paragraphs are prose, not the retired homepage grid', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const rule = css.match(/\.lede\{([^}]*)\}/)?.[1] || '';
  assert.ok(rule, 'the shared lead paragraph has no style');
  assert.doesNotMatch(rule, /display\s*:\s*grid/,
    'ordinary lead paragraphs are split into the retired two-column homepage module');
  assert.doesNotMatch(rule, /border-(top|bottom)/,
    'ordinary lead paragraphs draw structural rules already supplied by their section');
  assert.match(rule, /max-width\s*:\s*70ch/,
    'lead paragraphs can run too wide to read comfortably');
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
  assert.match(sell.label, /when can i sell/i);
  assert.doesNotMatch(sell.get, /everything below/i);
  for (const q of QUICK) assert.ok(itemFor(`/tools?calc=${q.id}`).get, `${q.id} has no get:`);
});

/**
 * The link has to land ON the calculator.
 *
 * "When can I sell?" pointed at /tools?calc=sell, which dropped the reader at
 * the TOP of /tools — in front of "What are you trying to work out?" and the
 * three situation cards, one of which is /tools/owning, the page they had just
 * clicked from. It read as being sent back where they started, and that is
 * exactly how it was reported.
 */
test('a quick calculator link lands on the calculator, not the top of /tools', () => {
  for (const q of QUICK) {
    const href = itemFor(`/tools?calc=${q.id}`).href;
    assert.match(href, /#quick$/,
      `${q.id} drops the reader at the top of /tools, above the situation cards`);
    assert.match(href, new RegExp(`calc=${q.id}`), `${q.id} lost its tab`);
  }
  const page = readFileSync(new URL('../app/tools/page.jsx', import.meta.url), 'utf8');
  assert.match(page, /id="quick"/,
    'the anchor the links point at does not exist, so they land at the top anyway');
});

/**
 * /tools?calc=duty and /tools?calc=sell were byte-identical to /tools before
 * hydration, because the tab was read with useSearchParams inside a Suspense
 * boundary whose fallback WAS the server HTML. The page's own prose promises
 * you can "send someone straight to the stamp duty answer rather than to this
 * page"; for anyone whose JavaScript had not run, and for every crawler that
 * does not run it, that promise was not kept.
 */
test('the asked tab is resolved on the server', () => {
  const raw = readFileSync(new URL('../components/Tools.jsx', import.meta.url), 'utf8');
  /* Comments stripped: the note explaining the removal names the hook it
     removed, and an unfiltered search finds the explanation. Seventh
     source-reading test in this repo to match its own prose. */
  const view = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.doesNotMatch(view, /useSearchParams/,
    'Tools reads the URL itself again, which makes the whole section client-only');
  assert.match(raw, /function Tools\(\{ ratesReviewed, asked/,
    'Tools no longer takes the tab as a prop');
  const rawPage = readFileSync(new URL('../app/tools/page.jsx', import.meta.url), 'utf8');
  assert.match(rawPage, /await searchParams/, '/tools does not read calc on the server');
  /* Stripped for the same reason: the note above the route explains what a
     Suspense fallback did to this page, and naming it is how it explains. */
  const page = rawPage.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.doesNotMatch(page, /Suspense/, 'the Suspense fallback is the server HTML again');
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

test('no destination is offered in two menus', () => {
  /* Shervin, 26 Sep: "the menu drop down now have duplicated tools". Map, MOP
     and Rates were under Look up and again in the Tools grid, each under a
     different name. The header renders Look up and Read from NAV and Tools
     from TOOL_GROUPS; a page may be in one of them. */
  const seen = new Map();
  const add = (href, where) => {
    assert.ok(!seen.has(href), `${href} is in both ${seen.get(href)} and ${where}`);
    seen.set(href, where);
  };
  for (const g of NAV) if (!g.guided) for (const i of g.items) add(i.href, g.group);
  for (const run of TOOL_GROUPS) for (const i of run.items) add(i.href, `Tools › ${run.label}`);
});

test('no two tools in the menu open the same page', () => {
  /* Shervin, 26 Sep: "stamp duty on a price" and "when can I sell" "bring me
     to the same page". Both were /tools?calc=…, which opened the top of
     /tools for either. A query string or a fragment is not a different page
     to a reader; the path is. */
  const seen = new Map();
  for (const run of TOOL_GROUPS) for (const t of run.items) {
    const path = t.href.split(/[?#]/)[0];
    assert.ok(!seen.has(path), `${t.name} and ${seen.get(path)} both open ${path}`);
    seen.set(path, t.name);
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

test('every fallback site URL is the same, and is one that resolves', () => {
  // sitemap.js, robots.js and layout.jsx fell back to truestorey.sg while
  // send-digest.mjs fell back to the Vercel URL. Harmless while the variable
  // is set, and the moment it is not, robots.txt and every canonical point a
  // crawler at a domain that does not answer.
  const seen = new Set();
  for (const f of ['app/sitemap.js', 'app/robots.js', 'app/layout.jsx', 'scripts/send-digest.mjs']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const m = /NEXT_PUBLIC_SITE_URL \|\| '([^']+)'/.exec(src);
    assert.ok(m, `${f} has no fallback for NEXT_PUBLIC_SITE_URL`);
    seen.add(m[1]);
  }
  assert.equal(seen.size, 1, `four files, ${seen.size} different fallbacks: ${[...seen].join(', ')}`);
});

/* ── the watch loop has somewhere to go ────────────────────────────────────── */

test('the confirmation page can link back to the block it confirmed', () => {
  // It knew the block's NAME and not its href, so it could say "Blk 242
  // Bishan St 22" in bold and could not send anybody there. Two links to
  // somewhere else, and none to the thing they had just subscribed to.
  const route = readFileSync(new URL('../app/api/watch/confirm/route.js', import.meta.url), 'utf8');
  assert.match(route, /h=\$\{encodeURIComponent\(data\.href/, 'the confirm redirect drops the href');
  const page = readFileSync(new URL('../app/watch/confirmed/page.jsx', import.meta.url), 'utf8');
  assert.match(page, /Back to \{block\}/, 'no link back to the confirmed block');
  // An href out of a query string, rendered as a link, is an open redirect
  // unless it is checked.
  assert.match(page, /\^\\\/\[a-z0-9\/-\]\*\$/i, 'the href from the query string is not validated');
});

test('a local watch note never claims to be the subscription', () => {
  // The server holds the subscriptions; the browser holds a note. They can
  // disagree in both directions, and a page that implied otherwise would have
  // someone "unsubscribe" by tidying a list.
  for (const f of ['components/WatchList.jsx', 'components/WatchBlock.jsx', 'lib/watching.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(src, /this (browser|device)/i, `${f} does not say the note is per-device`);
  }
  const list = readFileSync(new URL('../components/WatchList.jsx', import.meta.url), 'utf8');
  assert.match(list, /not the subscription/i);
  assert.match(list, /Forget /, 'the local remove must not be worded as an unsubscribe');
  assert.doesNotMatch(list, />\s*Stop\s*</, '"Stop" would read as an unsubscribe');
});

test('every localStorage call is wrapped, so a private window still works', () => {
  // A browser set to refuse site data throws on the ACCESSOR, not on the read,
  // so an unguarded call takes the whole component down rather than degrading.
  // Only the functions that touch storage directly need the guard —
  // isWatching() delegates to watching(), which has one.
  const src = readFileSync(new URL('../lib/watching.js', import.meta.url), 'utf8');
  for (const fn of src.split('export ').slice(1)) {
    if (!/localStorage/.test(fn)) continue;
    assert.match(fn, /try\s*\{[\s\S]*catch/,
      `unguarded localStorage in: ${fn.split('\n')[0].slice(0, 50)}`);
  }
  // And the whole file must never assume window exists — it is imported by a
  // client component that React also renders on the server.
  // Module scope means column zero. The earlier version of this allowed
  // leading whitespace and so matched a guarded read INSIDE a function.
  assert.doesNotMatch(src, /^(const|let)\s+\w+\s*=\s*localStorage/m,
    'localStorage read at module scope would run during SSR');
});

test('the homepage does not promise a refresh cadence the data does not keep', () => {
  // It read "last refreshed · daily" beside a date that was five days old,
  // because the DAILY thing is the check, not the data: each dataset refreshes
  // on the cadence its source publishes at. Transactions were weekly then and
  // are daily now — both feeds carry current-month rows, so a weekly pull was
  // hiding about 370 filed HDB resales between runs. The claim still has to be
  // about the CHECK rather than the data, because most datasets are not daily
  // and never will be: the price indices are quarterly. On a site whose whole
  // argument is that every figure shows its source and period, the homepage is
  // the worst place to be loose.
  const src = readFileSync(new URL('../app/page.jsx', import.meta.url), 'utf8');
  const line = /<dt>\{refreshed[^<]*<\/dt><dd>([^<]*)<\/dd>/.exec(src);
  assert.ok(line, 'the refreshed figure moved — check this test still describes it');
  assert.doesNotMatch(line[1], /^last refreshed · daily$/,
    'this claims every figure is a day old; the price indices are quarterly');
  assert.match(line[1], /checked daily|weekly/i, 'say which cadence is being claimed');
});

/* ── the refusals ──────────────────────────────────────────────────────────── */

test('every refusal is checkable and carries its reason', async () => {
  // The page is only worth having if a sceptic can go and read the code. An
  // entry without a file to point at is a marketing claim.
  const { ALL } = await import('../lib/refusals.js');
  assert.ok(ALL.length >= 12, `only ${ALL.length} refusals — the page needs to be worth the click`);
  for (const r of ALL) {
    assert.ok(r.what && r.what.length > 12, 'a refusal with no subject');
    assert.ok(r.asked && r.asked.length > 20, `${r.what} — does not say who asked for it`);
    assert.ok(r.why && r.why.length > 80, `${r.what} — the reason is too thin to be one`);
    assert.ok(r.rule, `${r.what} — no rule or basis named`);
    assert.ok(r.where, `${r.what} — nothing to check it against`);
  }
});

test('every file a refusal points at actually exists', async () => {
  // A citation that 404s is worse than none, and these are paths in a repo
  // that moves. This is the test that makes the page checkable rather than
  // merely claiming to be.
  const { existsSync } = await import('node:fs');
  const { ALL } = await import('../lib/refusals.js');
  for (const r of ALL) {
    const p = new URL(`../${r.where}`, import.meta.url);
    assert.ok(existsSync(p), `${r.what} cites ${r.where}, which does not exist`);
  }
});

test('the refusals page is reachable and in the sitemap', async () => {
  const { NAV } = await import('../lib/nav.js');
  const hrefs = NAV.flatMap(g => g.items).map(i => i.href);
  assert.ok(hrefs.includes('/refused'), '/refused is not in the nav, so it is not in the sitemap either');
  const { default: sitemap } = await import('../app/sitemap.js');
  assert.ok(sitemap().some(e => e.url.endsWith('/refused')));
});
