import fs from 'node:fs';
import path from 'node:path';
import { frontmatter, readingMinutes } from './md.js';
import { slugify } from './slug.js';

const DIR = () => path.join(process.cwd(), 'content', 'insights');

/**
 * Editorial posts, read from disk at build time.
 *
 * Frontmatter contract:
 *   title    required
 *   date     required, YYYY-MM-DD — posts dated in the future are drafts and
 *            are never listed or routed
 *   kind     note | deep. Omit and it is inferred from length.
 *   summary  one line, used on the index and as the meta description
 *   image    /images/… — header image, optional
 *   imageAlt required whenever image is set. See public/images/README.md.
 *   towns    [TENGAH, TAMPINES] — drives the reverse map onto town pages
 *   blocks   [/hdb/tengah/123-plantation-cres] — hrefs, drives block pages
 *   tags     free labels, shown as topics
 *
 * TWO KINDS, ONE FEED.
 *
 *   note — a short dated entry. What changed, in his own words, two or three
 *          sentences. These are what make the site look alive between the
 *          long pieces, and they are what `npm run note` scaffolds.
 *   deep — the weekly long piece. The thing people share.
 *
 * They share a feed rather than living in separate sections, because the
 * honest reading order is chronological — a note published after a deep dive
 * may well supersede it. The index lets you filter to one kind; it does not
 * pretend they are different publications.
 *
 * `kind` is inferred at 450 words when frontmatter does not say. That is a
 * default, not a rule: set it explicitly whenever the length would mislead.
 */
const DEEP_WORDS = 450;
let _all = null;

export function allInsights({ includeDrafts = false } = {}) {
  if (_all) return includeDrafts ? _all : _all.filter(p => !p.draft);

  const dir = DIR();
  if (!fs.existsSync(dir)) { _all = []; return _all; }
  const today = new Date().toISOString().slice(0, 10);

  _all = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(file => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data, body } = frontmatter(raw);
      const slug = data.slug || file.replace(/\.md$/, '');
      const date = String(data.date || '').slice(0, 10);
      const words = body.trim().split(/\s+/).filter(Boolean).length;
      const kind = /^deep$/i.test(String(data.kind || '')) ? 'deep'
        : /^(note|short)$/i.test(String(data.kind || '')) ? 'note'
        : words >= DEEP_WORDS ? 'deep' : 'note';
      return {
        slug,
        href: `/insights/${slug}`,
        title: data.title || slug,
        date,
        kind,
        words,
        summary: data.summary || '',
        image: data.image || null,
        imageAlt: data.imageAlt || '',
        towns: (Array.isArray(data.towns) ? data.towns : []).map(t => String(t).toUpperCase()),
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        tags: Array.isArray(data.tags) ? data.tags : [],
        minutes: readingMinutes(body),
        // A scaffold from `npm run note` has a blank title on purpose. Dating
        // it today must not therefore publish an empty post — an untitled
        // entry is an unfinished one, whatever its date says.
        draft: !date || date > today || !String(data.title || '').trim(),
        body,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

  return includeDrafts ? _all : _all.filter(p => !p.draft);
}

export function insight(slug) {
  return allInsights().find(p => p.slug === slug) || null;
}

/** Posts that reference a town, newest first. Drives "related reading". */
export function insightsForTown(townSlug) {
  return allInsights().filter(p => p.towns.some(t => slugify(t) === townSlug));
}

/** Posts that reference a specific record href. */
export function insightsForBlock(href) {
  return allInsights().filter(p => p.blocks.includes(href));
}

/** The two neighbours of a post in date order, for prev/next at the foot of a piece. */
export function around(slug) {
  const all = allInsights();
  const i = all.findIndex(p => p.slug === slug);
  if (i < 0) return { newer: null, older: null };
  return { newer: all[i - 1] || null, older: all[i + 1] || null };
}

/** Every topic actually in use, commonest first. */
export function topics() {
  const c = new Map();
  for (const p of allInsights()) for (const t of p.tags) c.set(t, (c.get(t) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => ({ name, n }));
}
