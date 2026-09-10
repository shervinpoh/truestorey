/**
 * A card that renders a headline and drops the photograph.
 *
 * /insights lays out a lead, two seconds beside it, and a river below. The
 * lead had an image and the river had an image; the seconds had a kind, a
 * title, a summary and a date, and no image element at all. Nothing was
 * broken — the column was simply never given one — so with five published
 * articles the page showed three photographs and looked as though two of
 * them had failed to load.
 *
 * The backfill that put a photograph on all fourteen articles reported
 * success, because it had. The database was right and the page was wrong,
 * which is the pairing no green run catches.
 *
 * Node does not strip JSX, so these read the source. Comments are stripped
 * first: the prose above quotes the class names it is explaining, and an
 * unfiltered search finds the explanation rather than the markup. That
 * mistake has been made four times in this repo.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const strip = f =>
  readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const page = strip('app/insights/page.jsx');
const between = (from, to) => {
  const a = page.indexOf(from);
  assert.notStrictEqual(a, -1, `${from} is gone from /insights — this test is now guarding nothing`);
  const b = page.indexOf(to, a);
  return page.slice(a, b === -1 ? undefined : b);
};

test('every card on /insights has somewhere to put a photograph', () => {
  const lead = between('className="edlead"', 'edseconds');
  assert.match(lead, /lead\.image/, 'the lead article stopped rendering its photograph');
  assert.match(lead, /<img/, 'the lead has no image element');

  const seconds = between('className="edseconds"', '</section>');
  assert.match(seconds, /\bp\.image\b/,
    'the two seconds are back to rendering a headline with no photograph');
  assert.match(seconds, /<img/, 'the seconds have no image element');

  const feed = strip('components/Feed.jsx');
  assert.match(feed, /\bp\.image\b/, 'the river stopped rendering photographs');
});

/*
 * A photograph with no alt attribute is worse than no photograph: a screen
 * reader announces the file name. articles.js builds imageAlt from the
 * photographer's name, so an image that ships without it is reading a field
 * that no longer exists rather than one that happens to be empty.
 */
test('every photograph on /insights carries alt text', () => {
  for (const tag of page.match(/<img[\s\S]*?\/>/g) || []) {
    assert.match(tag, /alt=/, `an image on /insights has no alt attribute:\n${tag}`);
  }
  assert.match(strip('lib/articles.js'), /imageAlt:/,
    'articles.js no longer builds imageAlt, so every alt above resolves to undefined');
});

/*
 * The thumb is a flex row, so the text beside it needs a wrapper. Without
 * .edsectxt the kind, title, summary and date each become their own flex
 * item and lay out in a line across the card.
 */
test('the seconds thumbnail has the layout it needs', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.edseconds a\{[^}]*display:flex/,
    '.edseconds a is not a flex row; the thumbnail will sit above the text and unbalance the grid');
  assert.match(css, /\.edsectxt\{/, '.edsectxt is gone — the card body will lay out in a line');
  assert.match(css, /\.edsecimg\{/, '.edsecimg is gone — the thumbnail has no size');
  /* The img tag carries width/height attributes to reserve its box, and a used
     height from an attribute beats aspect-ratio. Drop height:auto and the thumb
     renders 120 wide by 360 tall. The build does not mind in the slightest. */
  assert.match(css, /\.edsecimg\{[^}]*height:auto/,
    '.edsecimg lost height:auto; the height attribute will win and the thumb becomes a sliver');
  assert.match(page, /className="edsectxt"/, 'the card body lost its flex wrapper');
});
