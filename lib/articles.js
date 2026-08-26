import { allInsights } from './insights.js';
import { publishedArticles, articleBySlug, configured } from './supabase/rest.js';
import { textOf } from './sanitize.js';

/**
 * One feed, two sources.
 *
 * Shervin's own dated notes live as markdown in content/insights/ and are what
 * `npm run note` scaffolds. The pipeline files finished HTML into Supabase.
 * Both are editorial, both belong in the same chronological feed, and the
 * honest reading order is by date — a note published after a deep dive may
 * well supersede it.
 *
 * Migrating the markdown into the database was the alternative and it would
 * have been worse: the files are versioned with the repo, they render with no
 * network, and they are the thing he actually writes in.
 *
 * A row from the database gets `source: 'pipeline'` so a page can say where a
 * piece came from. That is not a disclaimer, it is provenance — the same
 * standard every figure on this site is held to.
 */

const MINUTES = words => Math.max(1, Math.round(words / 220));

function fromRow(row) {
  const text = textOf(row.content_html);
  const words = text.split(/\s+/).filter(Boolean).length;
  const date = String(row.published_at || row.created_at || '').slice(0, 10);
  return {
    slug: row.slug,
    href: `/insights/${row.slug}`,
    title: row.title,
    date,
    kind: row.category === 'deep_dive' ? 'deep' : 'note',
    category: row.category,
    words,
    minutes: MINUTES(words),
    summary: row.excerpt || text.slice(0, 200),
    image: row.header_image_url || null,
    imageAlt: row.unsplash_photographer_name ? `Photograph by ${row.unsplash_photographer_name}` : '',
    credit: row.unsplash_photographer_name
      ? {
          name: row.unsplash_photographer_name,
          // Unsplash require the UTM parameters on both links back.
          profile: withUtm(row.unsplash_photographer_profile_url),
          unsplash: withUtm('https://unsplash.com/'),
        }
      : null,
    towns: [],
    blocks: [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    sources: Array.isArray(row.source_urls) ? row.source_urls : [],
    html: row.content_html,
    source: 'pipeline',
    draft: false,
  };
}

function withUtm(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'true_storey');
    u.searchParams.set('utm_medium', 'referral');
    return u.toString();
  } catch { return url; }
}

/** Everything publishable, newest first. Falls back to files alone if the database is down. */
export async function feed() {
  const files = allInsights().map(p => ({ ...p, source: 'file', html: null }));
  if (!configured()) return files;

  const rows = await publishedArticles();
  const merged = [...files, ...rows.map(fromRow)];
  // A slug can only appear once. Files win, because a file is something a
  // person wrote deliberately and a row is something a pipeline produced.
  const seen = new Set();
  return merged
    .filter(p => (seen.has(p.slug) ? false : seen.add(p.slug)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
}

/** One piece by slug, from whichever source has it. Files first, same reason. */
export async function piece(slug) {
  const file = allInsights().find(p => p.slug === slug);
  if (file) return { ...file, source: 'file', html: null };
  if (!configured()) return null;
  const row = await articleBySlug(slug);
  return row ? fromRow(row) : null;
}
