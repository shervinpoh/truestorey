/**
 * Structured data makes claims, and a claim in markup is a claim.
 *
 * Thirty-nine routes carried metadata and not one carried a line of ld+json,
 * so an answer engine could read what the pages were called and nothing about
 * what they contained. The fix is worth having and it arrives with a specific
 * temptation: the schema types that earn rich results are exactly the ones
 * that would break the rules the pages obey.
 *
 * A Product with an Offer puts a single price on a property. An
 * AggregateRating is a verdict on one. A RealEstateListing says something is
 * for sale. None of those is true here and all three are what a search
 * plugin would add by default.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { organisation, dataset, article, faq, breadcrumbs, ldJson } from '../lib/schema.js';

/* Rules 2 and 7, in markup. */
const FORBIDDEN = ['Product', 'Offer', 'AggregateRating', 'Review', 'RealEstateListing',
                   'priceRange', 'lowPrice', 'highPrice'];

test('no schema type asserts a price or a verdict on a property', () => {
  const built = [
    organisation({ name: 'A', cea: 'R1', agency: 'B' }),
    dataset({ name: 'n', description: 'd', href: '/x', n: 5, source: 's', from: '2020-01', to: '2026-01' }),
    article({ title: 't', href: '/y', published: '2026-01-01', author: { name: 'A', cea: 'R1' } }),
    faq([{ q: 'q', a: 'a' }]),
    breadcrumbs([{ name: 'Home', href: '/' }, { name: 'X', href: '/x' }]),
  ];
  const json = JSON.stringify(built);
  for (const t of FORBIDDEN) {
    assert.doesNotMatch(json, new RegExp(`"${t}"`),
      `${t} appears in the structured data; it asserts a price or a verdict the pages never make`);
  }
});

/*
 * The builders are one half. The other is that nobody adds a raw block to a
 * page later — comments stripped first, because lib/schema.js explains the
 * forbidden types by naming them.
 */
test('no route hand-rolls a forbidden schema type', () => {
  const walk = d => readdirSync(d).flatMap(f => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : (/\.(jsx?|mjs)$/.test(f) ? [p] : []);
  });
  for (const f of [...walk('app'), ...walk('components'), ...walk('lib')]) {
    const code = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    if (!/@type/.test(code)) continue;
    for (const t of FORBIDDEN) {
      assert.doesNotMatch(code, new RegExp(`'@type':\\s*'${t}'`),
        `${f} declares @type ${t}`);
    }
  }
});

/*
 * A Dataset that declares a period it does not have is the markup version of
 * a figure with no source line, which is the thing rule 6 exists to stop.
 */
test('a dataset omits what it does not know rather than guessing', () => {
  const bare = dataset({ name: 'n', description: 'd', href: '/x' });
  assert.strictEqual(bare.temporalCoverage, undefined, 'a period was invented');
  assert.strictEqual(bare.size, undefined, 'a count was invented');
  assert.strictEqual(bare.isBasedOn, undefined, 'a source was invented');

  const full = dataset({ name: 'n', description: 'd', href: '/x', n: 27,
                         source: 'HDB Resale Flat Prices (data.gov.sg)', from: '2023-09', to: '2026-09' });
  assert.strictEqual(full.temporalCoverage, '2023-09/2026-09');
  assert.strictEqual(full.isBasedOn.name, 'HDB Resale Flat Prices (data.gov.sg)',
    'the originating agency no longer travels with the citation');
});

/* The one authority signal on this site a reader can independently check. */
test('the CEA registration travels as an identifier, not decoration', () => {
  const o = organisation({ name: 'Shervin Poh', cea: 'R066925H', agency: 'Huttons Asia Pte Ltd' });
  const org = o['@graph'].find(x => x['@type'] === 'Organization');
  assert.strictEqual(org.founder.identifier.value, 'R066925H');
  assert.match(org.founder.identifier.propertyID, /CEA/);
  assert.match(org.founder.identifier.description, /Council for Estate Agencies/,
    'the issuer is unnamed, so the number is unverifiable');
});

/*
 * JSON inside a script tag ends at the first </script>, wherever it appears.
 * A block label or a project name carrying a < would close the tag early and
 * spill the rest as markup. Same class of problem as the sanitiser note.
 */
test('a stray angle bracket cannot close the script tag', () => {
  const out = ldJson({ name: '</script><img src=x onerror=alert(1)>' });
  assert.doesNotMatch(out.__html, /<\/script/i, 'the block can be closed from inside its own data');
  assert.match(out.__html, /\\u003c/, 'the escape is gone');
});

/* A hand-written llms.txt goes stale the first time a tool is added, and a
   stale map sends a reader to a route that moved. */
test('llms.txt is generated from the nav, not typed out', () => {
  const src = readFileSync(path.join(process.cwd(), 'app/llms.txt/route.js'), 'utf8');
  assert.match(src, /import \{ NAV \} from/, 'llms.txt no longer reads the nav');
  assert.match(src, /catalogue\(\)/, 'the source and period are hardcoded again');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  /* Rule 7. An answer engine quoting this file is republishing it. */
  for (const w of ['undervalued', 'best deal', 'expert', 'specialist', 'guaranteed']) {
    assert.doesNotMatch(code.toLowerCase(), new RegExp(`\\b${w}\\b`),
      `llms.txt uses "${w}", which rule 7 forbids on any page`);
  }
});
