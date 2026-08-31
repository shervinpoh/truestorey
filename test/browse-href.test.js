/**
 * Every project and street href is its base plus its slug.
 *
 * WHAT THIS CATCHES:
 *
 * /condo and /landed hand ProjectBrowse tuples rather than objects, because
 * the component is a client component and every row it can search has to be
 * serialised into the HTML — 2,980 of them on /condo, which as objects came to
 * 492KB of markup, more than twice the homepage. The href was the easiest
 * twenty bytes a row to drop, because it is `base + slug` every time.
 *
 * "Every time" is the assumption, and it is not enforced anywhere else. If the
 * data layer ever builds an href differently — a district in the path, a
 * disambiguating suffix for two projects that slugify the same, a rename that
 * keeps the old slug — the tiles keep rendering, the page keeps building, the
 * tests keep passing, and every link on the two browse pages goes to a 404.
 * Nothing about that failure is loud: the grid looks correct, the labels are
 * right, and the psf shading still works. You would find it from analytics, or
 * from someone telling you.
 *
 * So the assumption is asserted where it is cheap to assert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projects } from '../lib/data/query.js';

for (const ns of ['condo', 'landed']) {
  test(`${ns}: href is /${ns}/ + slug for every item`, () => {
    const list = projects(ns);
    assert.ok(list.length > 100, `expected a populated ${ns} list, got ${list.length}`);

    const wrong = list
      .filter(p => p.href !== `/${ns}/${p.slug}`)
      .slice(0, 5)
      .map(p => `${p.slug} -> ${p.href}`);

    assert.deepEqual(wrong, [],
      `ProjectBrowse builds its links as base + slug and would send these to a 404:\n${wrong.join('\n')}`);
  });

  test(`${ns}: no two items share a slug`, () => {
    // A collision would make one of the two unreachable from the browse grid,
    // and React would warn about the duplicate key rather than the real problem.
    const seen = new Map();
    const dupes = [];
    for (const p of projects(ns)) {
      if (seen.has(p.slug)) dupes.push(`${p.slug}: "${seen.get(p.slug)}" and "${p.label}"`);
      else seen.set(p.slug, p.label);
    }
    assert.deepEqual(dupes.slice(0, 5), [], `duplicate slugs in ${ns}`);
  });
}

/*
 * EVERY TOOL IN THE NAV MUST BE FINDABLE WITHOUT THE NAV.
 *
 * /tools is where somebody looks when they do not know what exists, and the
 * sitemap is where Google does. Four tools — Compare, Buying off the plan,
 * What a lease is worth, What the land cost — shipped without reaching either,
 * on a site whose whole strategy is being findable. A tool nobody can find is
 * a tool that does not exist.
 */
test('every tool in the nav is listed on /tools', async () => {
  const { NAV } = await import('../lib/nav.js');
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../app/tools/page.jsx', import.meta.url), 'utf8');
  const tools = NAV.find(g => /tool/i.test(g.group))?.items || [];
  assert.ok(tools.length > 5);
  for (const t of tools) {
    if (t.href === '/tools') continue;                 // the page itself
    assert.ok(page.includes(`href="${t.href}"`), `/tools does not link ${t.href}`);
  }
});

test('the sitemap is driven by the nav rather than a second list', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../app/sitemap.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\.\/lib\/nav\.js'/, 'the sitemap does not read the nav');
  assert.match(src, /navPaths\(\)/, 'the nav paths are not spread into the sitemap');
});
