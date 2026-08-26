/**
 * Every image has alt text, and nothing is absurdly large.
 *
 *   npm run images
 *
 * An image without alt text is invisible to a screen reader and to Google —
 * on a site whose whole traffic model is search, the second of those is not a
 * nicety. This fails rather than warns, so a missing alt cannot ship.
 */
import fs from 'node:fs';
import path from 'node:path';
import { allInsights } from '../lib/insights.js';

const ROOT = process.cwd();
let bad = 0, warn = 0;

for (const p of allInsights({ includeDrafts: true })) {
  if (!p.image) { console.log(`·  ${p.slug} — no image`); continue; }
  const file = path.join(ROOT, 'public', p.image.replace(/^\//, ''));
  if (!fs.existsSync(file)) { bad++; console.log(`✗  ${p.slug} — image not found: ${p.image}`); continue; }
  if (!p.imageAlt.trim()) { bad++; console.log(`✗  ${p.slug} — image has no imageAlt`); continue; }
  const kb = Math.round(fs.statSync(file).size / 1024);
  if (kb > 400) { warn++; console.log(`⚠  ${p.slug} — ${kb}KB, worth compressing`); }
  else console.log(`✓  ${p.slug} — ${kb}KB`);
}

const loose = fs.existsSync(path.join(ROOT, 'public', 'images'))
  ? fs.readdirSync(path.join(ROOT, 'public', 'images')).filter(f => /\.(png|jpe?g|webp|avif)$/i.test(f))
  : [];
const used = new Set(allInsights({ includeDrafts: true }).map(p => p.image && path.basename(p.image)).filter(Boolean));
const unused = loose.filter(f => !used.has(f));
if (unused.length) console.log(`\n${unused.length} file(s) in public/images not referenced by any post: ${unused.join(', ')}`);

console.log(bad ? `\n${bad} problem(s).` : `\nImages fine.${warn ? ` ${warn} worth compressing.` : ''}`);
process.exit(bad ? 1 : 0);
