/**
 * Rebuild the long pieces from data this site holds.
 *
 *   npm run analysis                      every topic in lib/editorial/analysis.js
 *   npm run analysis -- --topic=rents     one topic
 *   npm run analysis -- --dry             write and print, change nothing
 *
 * Each topic names the drafts it replaces. The first is rewritten IN PLACE —
 * same row, new title, text, figures and sources, still a draft — so /studio
 * shows it where the unpublishable version was. Any others are archived as
 * superseded. A topic no dataset can answer archives its drafts and records
 * why; it is never written from nothing.
 *
 * It never publishes. Publishing is Shervin's, from /studio.
 */
import { TOPICS } from '../lib/editorial/analysis.js';
import { write } from '../lib/editorial/write.js';
import { articlesBySlug, patchArticle, slugInUse, fetchFacts, refuseLocalhost } from '../lib/editorial/file.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { findCover, coverId, readCover } from '../lib/cover.js';
import { placeOf } from '../lib/place.js';
import { claude } from '../lib/ai/providers.js';
import { recentArticles } from '../lib/editorial/file.js';

const DRY = process.argv.includes('--dry');
const ONLY = (process.argv.find(a => a.startsWith('--topic=')) || '').slice(8);
const SITE = refuseLocalhost(DRY);

const all = await recentArticles(365) || [];
const avoid = new Set(all.map(a => coverId(a.header_image_url)).filter(Boolean));

for (const [id, topic] of Object.entries(TOPICS)) {
  if (ONLY && id !== ONLY) continue;
  console.log(`\n── ${id}`);
  const rows = await articlesBySlug(topic.replaces);
  const drafts = rows.filter(r => r.status === 'draft');
  if (!drafts.length && !DRY) { console.log('  nothing to replace: its drafts are gone or already published'); continue; }

  const pack = await topic.build({ site: SITE, fetchFacts });
  if (pack.none) {
    console.log(`  cannot be sourced: ${pack.none}`);
    for (const r of drafts) {
      if (DRY) { console.log(`  would archive ${r.slug}`); continue; }
      const res = await patchArticle(r.id, { status: 'archived' });
      console.log(`  ${res.ok ? 'archived' : `NOT archived (${res.error})`} ${r.slug}`);
    }
    continue;
  }

  const out = await write(pack, { log: console.log });
  if (out.error) { console.error(`  ${out.error}`); for (const p of out.problems || []) console.error(`    · ${p}`); continue; }
  const d = out.draft;
  console.log(`  "${d.title}"\n  ${d.excerpt}`);
  if (DRY) { console.log(d.content_html.replace(/<\/(p|h2|li)>/g, '\n').replace(/<h2>/g, '\n## ').replace(/<[^>]+>/g, '').slice(0, 1800)); continue; }

  const [keep, ...rest] = drafts;
  let slug = d.slug;
  if (await slugInUse(slug, keep.id)) slug = `${slug}-${new Date().toISOString().slice(0, 7)}`;

  /* A new photograph only when the old one was stock: the topic is the same
     but the piece is not, and a Commons cover chosen for it stays. */
  let header = {};
  if (!readCover(keep.header_image_url)) {
    const cover = await findCover({ title: d.title, slug, tags: d.tags, sources: d.source_urls },
      { placeOf, avoid, claude, log: console.log });
    if (cover.url) {
      avoid.add(coverId(cover.url));
      header = { header_image_url: cover.url, unsplash_photographer_name: null,
        unsplash_photographer_profile_url: null, unsplash_download_location: null };
    }
  }

  const res = await patchArticle(keep.id, {
    title: d.title, slug, excerpt: d.excerpt, category: d.category, tags: d.tags,
    content_html: sanitizeHtml(d.content_html), source_urls: d.source_urls, ...header,
  });
  console.log(`  ${res.ok ? 'rewritten in place' : `NOT saved (${res.error})`}: ${keep.slug} → ${slug}`);
  for (const r of rest) {
    const a = await patchArticle(r.id, { status: 'archived' });
    console.log(`  ${a.ok ? 'archived as superseded' : `NOT archived (${a.error})`}: ${r.slug}`);
  }
}
console.log('');
