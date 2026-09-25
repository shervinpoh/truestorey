/**
 * Build the share-card URL for a record.
 *
 * Kept out of the page files so the card and the page can never disagree
 * about what the headline figure is — both read the same record, through one
 * function.
 */
import { titleCase } from './name.js';
import { NAV } from './nav.js';

const q = o => Object.entries(o)
  .filter(([, v]) => v != null && v !== '')
  .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

/**
 * The homepage card.
 *
 * Every block and project page generated one; the homepage — the link people
 * actually paste into a chat — had none, so it shared as a bare grey rectangle
 * with a URL under it. The figures are the ones the page already leads on, so
 * the card cannot promise something the page does not show.
 */
export function ogForHome({ pages, index } = {}) {
  return '/og?' + q({
    t: 'Every block in Singapore, in filed numbers',
    v: pages ? Number(pages).toLocaleString('en-SG') : null,
    u: pages ? 'pages' : null,
    s: 'Filed HDB resale and private transactions, by block and by project. Free, no sign-up.',
    k: index?.latest ? `HDB resale price index ${index.latest.index.toFixed(1)} · ${index.latest.quarter}` : null,
    src: index?.source || null,
  });
}

export function ogForRecord(rec) {
  if (!rec) return null;
  return '/og?' + q({
    t: titleCase(rec.label),
    v: Number(rec.medianPsf).toLocaleString('en-SG'),
    u: 'psf',
    s: `S$${Number(rec.minPsf).toLocaleString('en-SG')} — S$${Number(rec.maxPsf).toLocaleString('en-SG')} psf · ${rec.n} filed`,
    k: rec.kind === 'HDB' ? rec.town : `District ${rec.district}`,
    src: `${rec.source} · ${rec.period?.from} to ${rec.period?.to}`,
  });
}

export function ogForPost(post) {
  if (!post) return null;
  return '/og?' + q({
    t: post.title,
    v: post.date,
    u: '',
    s: post.summary,
    k: post.kind === 'deep' ? 'Deep dive' : 'Note',
    src: 'Written against the filed data · truestorey.sg',
  });
}

/**
 * The card for every page that has nothing more specific to show.
 *
 * Twenty-nine pages — every tool, every index, every page a share button
 * points at — had no og:image, so a link to /cost or /blindspot pasted into
 * WhatsApp arrived as a grey box. Set once in app/layout.jsx, so a page added
 * later is never the grey box either.
 */
export function ogDefault() {
  return '/og?' + q({
    t: 'Singapore property, in filed numbers',
    s: 'What was actually paid, block by block — with the source beside every figure. Free, no sign-up.',
    k: 'Truestorey',
    src: 'HDB via data.gov.sg · URA Data Service',
  });
}

const GROUP_KICKER = { Tools: 'Free tool', 'Look up': 'Look up', Read: 'Read' };

/**
 * Open Graph and Twitter metadata for a page in the menu, from the menu entry
 * itself: the plain-English question a tool answers ("What will this home cost
 * me to hold?") as the headline, and what the reader gets as the line beneath.
 * One source of wording, so the card can never describe a different page from
 * the menu that links to it. Spread into a page's `metadata`.
 */
export function shareCard(href) {
  let item = null, group = null;
  for (const g of NAV) {
    const hit = (g.items || []).find(i => i.href === href);
    if (hit) { item = hit; group = g.group; break; }
  }
  const url = item ? '/og?' + q({
    t: item.plain || item.label,
    s: item.get || item.blurb,
    k: item.plain ? item.label : (GROUP_KICKER[group] || 'Truestorey'),
    src: 'Filed transactions and published rates · free, no sign-up',
  }) : ogDefault();
  const image = { url, width: 1200, height: 630 };
  return {
    openGraph: { siteName: 'Truestorey', locale: 'en_SG', type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', images: [url] },
  };
}
