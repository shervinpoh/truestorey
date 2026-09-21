/**
 * The reading list. Three bugs it shipped with, and the rules that hold them.
 *
 * Everything here is text from outside this repo — it is data, never
 * instruction — and all three failures were about rendering that data as
 * though it were trustworthy and well-formed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, SOURCES } from '../lib/consult/reading.js';

const feed = items => `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
const item = (o = {}) => `<item>
  <title>${o.title ?? 'A headline'}</title>
  <link>${o.link ?? 'https://www.edgeprop.sg/property-news/a-story'}</link>
  <pubDate>Sat, 20 Sep 2026 10:00:00 +0800</pubDate>
  <description>${o.description ?? 'A summary.'}</description>
  ${o.creator ? `<dc:creator>${o.creator}</dc:creator>` : ''}
</item>`;

test('escaped markup is decoded and then stripped, not the other way round', () => {
  /* The shipped bug. EdgeProp escapes its own HTML, so there was no literal
     angle bracket for the tag strip to find, and the decode that ran
     afterwards turned the escaped markup into VISIBLE markup. Every EdgeProp
     summary in the panel was a wall of div tags. */
  const escaped = '&lt;div class=&quot;field&quot;&gt;Property Type:&amp;nbsp;Landed&lt;/div&gt;';
  const [it] = parseFeed(feed(item({ description: escaped })));
  assert.ok(!/<[a-z/]/i.test(it.summary), `markup survived: ${it.summary}`);
  assert.match(it.summary, /Property Type: Landed/);
});

test('markup escaped twice does not leave a layer showing', () => {
  /* A feed that escapes once can escape twice. One pass would decode the
     outer layer and print the inner one. */
  const twice = '&amp;lt;b&amp;gt;Bold&amp;lt;/b&amp;gt; text';
  const [it] = parseFeed(feed(item({ description: twice })));
  assert.ok(!/<[a-z/]/i.test(it.summary), `markup survived: ${it.summary}`);
  assert.match(it.summary, /Bold text/);
});

test('numeric entities decode to their characters, not to a space', () => {
  const [it] = parseFeed(feed(item({ description: 'It&#8217;s &#36;1,323 &#x2014; a record' })));
  assert.match(it.summary, /It’s \$1,323 — a record/);
});

test('a byline that is an email address or a phone number is not printed', () => {
  /* The feed carried `bernardtkc@gmail.com` and `92201825` as authors and the
     panel rendered both. Printing a stranger's email and mobile is not a
     formatting problem, and no byline beats the wrong kind of one. */
  for (const junk of ['bernardtkc@gmail.com', '92201825', '+65 9220 1825', '   ']) {
    const [it] = parseFeed(feed(item({ creator: junk })));
    assert.equal(it.author, null, `"${junk}" was printed as an author`);
  }
  const [ok] = parseFeed(feed(item({ creator: 'Timothy Tay' })));
  assert.equal(ok.author, 'Timothy Tay');
});

test('a source that mixes news with things that are not news declares a path filter', () => {
  /* EdgeProp publishes no news-only feed — every candidate URL 404s — so the
     frontpage feed is used and filtered. The filter is on the URL PATH, never
     on words in the title, because keyword matching silently drops real
     stories whenever a headline contains the wrong word. */
  const edge = SOURCES.find(s => s.key === 'edgeprop');
  assert.ok(edge.keep instanceof RegExp, 'EdgeProp must carry a path filter');
  assert.ok(edge.keepWhy, 'a filter that drops items must say why it exists');
  assert.ok(edge.keep.test('/property-news/four-room-flat-dawson-sets-record'));
  for (const junk of ['/overseas/malaysia/landed/estuari-greens',
                      '/living/discover/castlery-launches-autumnwinter-furniture',
                      '/event/atria-property-exhibition']) {
    assert.ok(!edge.keep.test(junk), `${junk} would still be admitted`);
  }
});

test('the filter never matches on the headline, only the path', () => {
  /* A guard on the guard: if someone later "improves" this into a keyword
     rule, a story about a furniture-maker buying a site disappears. */
  const edge = SOURCES.find(s => s.key === 'edgeprop');
  assert.ok(edge.keep.test('/property-news/castlery-buys-a-site-for-furniture-showroom'));
});
