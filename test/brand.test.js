/**
 * The mark exists in three places — the header's SVG (components/Logo.jsx),
 * the favicon (app/icon.svg) and the shapes next/og draws the PNG icons from
 * (lib/mark.js). A change to one that is not made to the others gives the
 * site one logo in the tab and another on the phone's home screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARK_SHAPES } from '../lib/mark.js';

const rects = src => [...src.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
  .map(m => m.slice(1, 5).map(Number).join(','));

test('the header mark, the favicon and the app icons are the same drawing', () => {
  const logo = rects(readFileSync(new URL('../components/Logo.jsx', import.meta.url), 'utf8'));
  const icon = rects(readFileSync(new URL('../app/icon.svg', import.meta.url), 'utf8'));
  const png = MARK_SHAPES.map(s => [s.x, s.y, s.w, s.h].join(','));
  assert.deepEqual(icon, logo, 'app/icon.svg and components/Logo.jsx have drifted apart');
  assert.deepEqual(png, logo, 'lib/mark.js (the PNG icons) and components/Logo.jsx have drifted apart');
});

test('the lit storey is the only use of the selected-data teal, and there is one', () => {
  const logo = readFileSync(new URL('../components/Logo.jsx', import.meta.url), 'utf8');
  assert.equal((logo.match(/var\(--acc-lit\)/g) || []).length, 1);
});

test('a phone can install the site, and the manifest points at icons that exist', async () => {
  const { default: manifest } = await import('../app/manifest.js');
  const m = manifest();
  assert.equal(m.display, 'standalone');
  const sizes = m.icons.map(i => i.sizes);
  for (const need of ['192x192', '512x512']) assert.ok(sizes.includes(need), `no ${need} icon`);
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'no maskable icon — Android will crop the towers');
  const route = readFileSync(new URL('../app/pwa-icon/[size]/route.jsx', import.meta.url), 'utf8');
  assert.match(route, /new Set\(\[192, 512\]\)/);
});
