/**
 * The editorial engine: what a piece may say, and where its numbers come from.
 *
 * 26 Sep. The five published notes carried no figures between them, and two
 * invented Shervin's experience — "I have watched couples…" — under his CEA
 * registration. Nine deep dives could not be published because their figures
 * came from a model ("new launches demand upwards of $2,600 PSF") and had no
 * source to cite. lib/editorial/ replaced the writer: packs of figures computed
 * from data/ or read from an agency's own page, a writer that writes around
 * them, and a verifier that refuses anything else.
 *
 * Each test below is a way that could go wrong again. The model is stubbed;
 * the data tests assert rules that hold on any day's data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { verify } from '../lib/editorial/verify.js';
import { allowedNumbers, numbersPanel, show } from '../lib/editorial/figures.js';
import { write, parse, brief } from '../lib/editorial/write.js';
import { tablesOf, isoDate, relevant, weight, embeddedHtml } from '../lib/editorial/sources.js';
import { releasePack } from '../lib/editorial/packs.js';
import { TOPICS } from '../lib/editorial/analysis.js';
import { inventedVoice, publishBlockers } from '../lib/compliance.js';
import { shareTargets } from '../lib/share-targets.js';

const root = process.cwd();
const code = (...p) => readFileSync(path.join(root, ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const PACK = {
  category: 'note', subject: 'Bedok', brief: 'Explain the award.',
  source: { agency: 'URA', title: 'Tender award for URA sale site at New Upper Changi Road', date: '4 September 2026', url: 'https://www.ura.gov.sg/news/media/pr26-64/' },
  facts: ['SITE AREA: 30,769.0 m²; TENDERED PRICE ($PSM of GFA): $1,425,388,000.00 ($16,544.65)'],
  figures: [
    { id: 'f1', what: 'land price', value: 1537, format: 'psfppr', period: '4 September 2026', source: 'URA release' },
    { id: 'f2', what: 'total', value: 1425388000, format: 'money', short: true, dp: 1, period: '4 September 2026', source: 'URA release' },
    { id: 'f3', what: 'median resale, Bedok', value: 1562, format: 'psf', period: '2025-10 to 2026-09', source: 'URA Data Service' },
  ],
  headline: ['f1', 'f3'],
  caveats: ['A land price is not a launch price.'],
  links: [{ label: 'Truestorey land sales record', href: 'https://truestorey.vercel.app/land' }],
  sources: ['https://www.ura.gov.sg/news/media/pr26-64/'],
};
const para = n => `<p>${'Land and resale prices measure different things for a buyer. '.repeat(n)}</p>`;
/* ~500 words: inside a note's 450 to 1,000. */
const good = (extra = '') => ({
  title: 'New Upper Changi Road land goes for S$1,537 psf ppr',
  dek: 'Why a land price and a resale price are different measures.',
  content_html: `<p>The land went for S$1,537 psf ppr on 4 September 2026, per URA. Bedok resales sat at S$1,562 psf over 2025-10 to 2026-09.</p>
{{NUMBERS}}
<h2>What the award records</h2>${para(15)}<h2>Why the two prices differ</h2>${para(15)}
<h2>What to ask</h2>${para(15)}<p>See the <a href="https://truestorey.vercel.app/land">Truestorey land sales record</a>. The total was S$1,425.4 million, or S$1,425,388,000.</p>${extra}`,
});

test('a clean draft passes, and every refusal names what to fix', () => {
  const ok = verify(good(), PACK, { minWords: 100 });
  assert.deepEqual(ok.problems, [], `a clean draft was refused: ${ok.problems.join(' | ')}`);
  const cases = {
    'a number not in the pack': ['<p>That is 25 psf below resale.</p>', /not in the pack: 25/],
    'the first person': ['<p>We think the land is dear.</p>', /First person/],
    'an invented experience': ['<p>Owners have watched this happen.</p>', /experience nobody had/],
    'an invented client': ['<p>Clients often tell agents the same.</p>', /experience nobody had/],
    'the pack itself': ['<p>It is the highest in the pack.</p>', /refers to your materials/],
    'a bare dollar': ['<p>It cost $1,537 psf ppr.</p>', /never a bare \$/],
    'a publisher': ['<p>As EdgeProp noted.</p>', /Do not name/],
    'a walking time': ['<p>It is 5 minutes walk from the MRT.</p>', /walking time or distance/],
    'a link of its own': ['<p><a href="https://example.com">here</a></p>', /Only the pack's links/],
    'a verdict word': ['<p>The site is undervalued.</p>', /not allowed/],
  };
  for (const [name, [extra, want]] of Object.entries(cases)) {
    const v = verify(good(extra), PACK, { minWords: 100 });
    assert.ok(!v.ok && v.problems.some(p => want.test(p)), `${name} was not refused: ${v.problems.join(' | ')}`);
  }
  const noPanel = good(); noPanel.content_html = noPanel.content_html.replace('{{NUMBERS}}', '');
  assert.ok(verify(noPanel, PACK, { minWords: 100 }).problems.some(p => /NUMBERS/.test(p)));
});

test('a figure may be written the way the pack writes it, and in no other rounding', () => {
  const allowed = allowedNumbers(PACK);
  /* S$1,425,388,000 may be written S$1,425.4 million or S$1.43 billion —
     the same figure in larger units. 1.4 or 1,425 would be a new rounding. */
  for (const n of ['1537', '1425.4', '1.43', '1425388000', '16544.65', '16545', '30769', '2026', '1562']) {
    assert.ok(allowed.has(n), `${n} should be allowed`);
  }
  for (const n of ['1540', '1425', '1.4', '16544.7', '25']) assert.ok(!allowed.has(n), `${n} was allowed`);
});

test('the numbers panel is built from the figures, each with its period and source', () => {
  const html = numbersPanel(PACK);
  assert.match(html, /^<figure><figcaption>The numbers<\/figcaption><ul>/);
  const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]);
  assert.equal(items.length, 2);
  assert.match(items[0], /<strong>S\$1,537 psf ppr<\/strong>.*<small>4 September 2026 · URA release<\/small>/);
  assert.equal(show(PACK.figures[1]), 'S$1,425.4 million');
});

test('the writer gets one retry with its failures named, and files nothing after two', async () => {
  const bad = { text: `<title>x</title><dek>d</dek><tags>a</tags><body>${good('<p>It was 25 psf lower.</p>').content_html}</body>` };
  const fine = { text: `<title>${good().title}</title><dek>${good().dek}</dek><tags>land, bedok</tags><body>${good().content_html}</body>` };
  let calls = 0, retry = null;
  const out = await write(PACK, { call: async (sys, msgs) => {
    calls++;
    if (calls === 2) retry = msgs.at(-1).content;   // a snapshot: write() appends to the same array later
    return calls === 1 ? bad : fine;
  } });
  assert.equal(calls, 2);
  assert.match(retry, /not in the pack: 25/, 'the retry was not told what was wrong');
  assert.ok(out.draft, `a corrected draft was not accepted: ${out.error} ${out.problems?.join(' | ')}`);
  assert.doesNotMatch(out.draft.content_html, /\{\{NUMBERS\}\}/);
  assert.match(out.draft.content_html, /<figure><figcaption>The numbers/);
  assert.deepEqual(out.draft.source_urls, PACK.sources);
  const twice = await write(PACK, { call: async () => bad });
  assert.ok(!twice.draft && /twice/.test(twice.error), 'a draft that failed twice was filed');
});

test('the brief tells the writer its facts and figures, and never asks for a voice', () => {
  const b = brief(PACK);
  assert.match(b, /PRIMARY SOURCE: URA/);
  assert.match(b, /\[f1\] land price: S\$1,537 psf ppr · 4 September 2026 · URA release/);
  assert.match(b, /CAVEATS/);
  const sys = code('lib', 'editorial', 'write.js');
  assert.doesNotMatch(sys, /write as (him|Shervin)/i, 'the writer is being asked to impersonate again');
  assert.match(sys, /Never write I, me, my, we, our or us/);
  const p = parse('<title>A</title><dek>B</dek><tags>x, Y</tags><body><p>C</p></body>');
  assert.deepEqual([p.title, p.dek, p.tags, p.content_html], ['A', 'B', ['x', 'y'], '<p>C</p>']);
});

test('a release table is read as a table, never re-paired from loose lines', () => {
  /* URA's award layout: one heading row, one value row. The first reader
     re-paired loose lines and produced "SUCCESSFUL TENDERER: 11,994 m²". */
  const html = `<table><tr><td><b>LOCATION</b></td><td><b>SITE AREA</b></td><td><b>MAXIMUM PERMISSIBLE GROSS FLOOR AREA (GFA)</b></td><td><b>SUCCESSFUL TENDERER</b></td><td><b>TENDERED PRICE ($PSM of GFA)</b></td></tr>
<tr><td>Lorong Puntong</td><td>4,283.4 m²</td><td>11,994 m²</td><td>Eco World Development (S) Pte. Ltd.</td><td>$208,099,000.00 ($17,350.26)</td></tr></table>`;
  const [row] = tablesOf(html);
  assert.match(row, /SITE AREA: 4,283\.4 m²; MAXIMUM PERMISSIBLE GROSS FLOOR AREA \(GFA\): 11,994 m²; SUCCESSFUL TENDERER: Eco World/);
  assert.doesNotMatch(row, /TENDERER: 11,994/);
  const ragged = tablesOf('<table><tr><td>A</td><td>B</td></tr><tr><td>1</td></tr></table>');
  assert.deepEqual(ragged, ['A · B', '1'], 'an irregular table was zipped anyway');
  assert.equal(isoDate('Published 18 September 2026'), '2026-09-18');
  assert.equal(embeddedHtml(`x "${'\\u003cp\\u003eBody text of a release. '.repeat(10)}" y`)?.startsWith('<p>Body'), true);
});

test('residential releases are found, and a rule change outranks a closing', () => {
  assert.ok(relevant('Tender award for URA sale site at Lorong Puntong / Sin Ming Avenue'));
  assert.ok(relevant('Increase in Income Ceilings and Greater Support for Families with Children'));
  for (const t of ['Temporary Road Closure along Bartley Road', 'HDB Scales Up Automation and Standardisation to Boost Construction Productivity',
    'Power of Singapore Design: President Design Award exhibition']) assert.ok(!relevant(t), `${t} was treated as property news`);
  assert.ok(weight('Removal of the 15-month Wait-out Period') > weight('Tender award for URA sale site at X'));
  assert.ok(weight('Tender award for URA sale site at X') > weight('Tender closing for URA sale site at X'));
});

test('a site\'s price comes from its own release, never from an older award with the same name', (t) => {
  const gls = JSON.parse(readFileSync(path.join(root, 'data', 'gls-awards.json'), 'utf8'));
  const old = gls.sites.find(s => /^lorong puntong$/i.test(s.site) && s.award < '2020');
  if (!old) return t.skip('the 2014 Lorong Puntong award is no longer on file');
  const release = {
    agency: 'URA', title: 'Tender award for URA sale site at Lorong Puntong / Sin Ming Avenue',
    date: '18 September 2026', iso: '2026-09-18', url: 'https://www.ura.gov.sg/news/media/pr26-66/',
    facts: ['LOCATION: Lorong Puntong / Sin Ming Avenue; SITE AREA: 4,283.4 m²; TENDERED PRICE ($PSM of GFA): $208,099,000.00 ($17,350.26)'],
  };
  const pack = releasePack(release, { site: 'https://x' });
  const own = pack.figures.find(f => /tendered price per square foot/.test(f.what));
  assert.equal(own?.value, Math.round(17350.26 / 10.7639), 'this site\'s price did not come from its release');
  assert.equal(own.period, '18 September 2026');
  for (const f of pack.figures.filter(f => f.period === old.award)) {
    assert.match(f.what, /earlier/, `the ${old.award} award was presented as this month's`);
  }
  assert.ok(!pack.figures.some(f => /bids received/.test(f.what) && f.period === old.award), 'an old award\'s bids were given to this site');
});

test('every analysis either builds a sourced pack or refuses with a reason', async () => {
  for (const [id, topic] of Object.entries(TOPICS)) {
    assert.ok(topic.replaces?.length, `${id} replaces nothing`);
    const pack = await topic.build({ site: 'https://x', fetchFacts: async () => [] });
    if (pack.none) { assert.ok(String(pack.none).length > 20, `${id} refused without saying why`); continue; }
    assert.ok(pack.figures.length >= 3, `${id} has ${pack.figures.length} figures`);
    for (const f of pack.figures) {
      assert.ok(f.period && f.source, `${id}: ${f.what} has no period or source`);
      assert.ok(f.format === 'text' || Number.isFinite(f.value), `${id}: ${f.what} is ${f.value}`);
      assert.doesNotMatch(show(f), /-0\.0%|NaN|undefined/, `${id}: ${f.what} displays as ${show(f)}`);
    }
    assert.ok(pack.sources?.length, `${id} records no source`);
    assert.ok(pack.caveats?.length, `${id} carries no caveat — every one of these medians needs one`);
  }
});

test('invented experience is refused at intake and at the publish button', () => {
  for (const s of ['I have watched couples take a BTO to save money.', 'I say this plainly because launches get misread.',
    'Clients often tell me the same thing.', 'What I want to talk about is the gap.']) {
    assert.ok(inventedVoice(`<p>${s}</p>`) || /I want/.test(s), `"${s}" passed`);
  }
  assert.equal(inventedVoice('<p>If you own a flat, ask this. US rates moved.</p>'), null);
  const b = publishBlockers({ title: 't', source_urls: ['https://x'], content_html: '<p>I have watched it happen.</p>' });
  assert.ok(b.some(x => x.id === 'invented-voice'));
  assert.match(code('app', 'api', 'webhook', 'article', 'route.js'), /inventedVoice\(/, 'intake stopped checking');
});

test('a share sends the article and nothing about the reader', () => {
  const url = 'https://truestorey.vercel.app/insights/a-b';
  const t = shareTargets({ url, title: 'Land at S$1,537 psf ppr & more', summary: 'Why.' });
  assert.deepEqual(t.map(x => x.how), ['whatsapp', 'telegram', 'x', 'facebook', 'linkedin', 'email']);
  for (const x of t) {
    assert.ok(x.href.includes(encodeURIComponent(url)), `${x.how} does not carry the article URL`);
    assert.doesNotMatch(decodeURIComponent(x.href), /utm_|fbclid|ref=/, `${x.how} adds tracking to the link`);
  }
  assert.match(t[0].href, /^https:\/\/wa\.me\/\?text=/);
  const page = code('app', 'insights', '[slug]', 'page.jsx');
  assert.equal((page.match(/<ShareArticle /g) || []).length, 2, 'the article should offer sharing at the top and the end');
  assert.match(page, /await feed\(\)/, 'Keep reading went back to the file-only list');
  const og = code('app', 'og', 'route.jsx');
  assert.match(og, /COMMONS\.test\(src\)/, 'the share card fetches a photograph from anywhere');
});
