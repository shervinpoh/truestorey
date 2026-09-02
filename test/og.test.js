import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ogForRecord, ogForPost } from '../lib/og.js';

/**
 * The share card.
 *
 * It carries the figure, its source and a CEA registration number into
 * whatever someone forwards the link into. For a year it did none of that in
 * practice, because it was an SVG and WhatsApp will not preview one — which
 * in this market is most of the point.
 */
const src = readFileSync(new URL('../app/og/route.jsx', import.meta.url), 'utf8');
/* Comments explain what was retired and therefore NAME it. Palette checks run
 * against the code alone, or this file fails on its own documentation. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the card is a raster image, because WhatsApp will not preview SVG', () => {
  assert.match(src, /ImageResponse/, 'the card must render to PNG');
  assert.doesNotMatch(src, /image\/svg\+xml/, 'an SVG content type has come back');
  assert.doesNotMatch(src, /<svg/, 'the card is hand-drawn SVG again');
});

test('it costs no new dependency', () => {
  // next/og ships inside Next 15 — the same renderer @vercel/og provides,
  // already on disk. Three npm dependencies is the architecture.
  assert.match(src, /from 'next\/og'/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['next', 'react', 'react-dom']);
});

test('the registration travels with the card', () => {
  // The whole reason for having one: a screenshot of a number is anonymous
  // and a share card is not. CEA PG 02-11 s7.1 wants the particulars, and a
  // forwarded card is exactly where they matter.
  assert.match(src, /NEXT_PUBLIC_CEA_REG/);
  assert.match(src, /NEXT_PUBLIC_AGENT_NAME/);
  assert.match(src, /Not a valuation or an offer/);
});

test('it is drawn in the live palette, not the retired one', () => {
  // It had quietly become the last surface on the design that was dropped on
  // 29 Aug: near-white ground, Schibsted, DM Mono, and a comment citing "no
  // rounded corners" — a rule that no longer exists.
  assert.match(code, /#F6F5F2/, 'warm paper');
  assert.match(code, /#164F52/, 'the deep teal');
  for (const dead of ['Schibsted', 'DM Mono', '#FDFDFC', '#00C2CC'])
    assert.doesNotMatch(code, new RegExp(dead), `${dead} was retired on 29 Aug`);
});

test('every parameter the helper sends is one the card reads', () => {
  // A card that silently drops a field shows a blank where a figure should
  // be, and nothing in a build would catch it.
  const sent = new Set();
  for (const url of [
    ogForRecord({ label: 'X', medianPsf: 1, minPsf: 1, maxPsf: 2, n: 3, kind: 'HDB', town: 'BISHAN', source: 's', period: { from: 'a', to: 'b' } }),
    ogForPost({ title: 'T', date: 'd', summary: 's', kind: 'deep' }),
  ]) for (const [k] of new URLSearchParams(url.split('?')[1])) sent.add(k);

  for (const k of sent)
    assert.match(src, new RegExp(`q\\.get\\('${k}'\\)`), `the card ignores ?${k}=`);
});
