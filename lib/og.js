/**
 * Build the share-card URL for a record.
 *
 * Kept out of the page files so the card and the page can never disagree
 * about what the headline figure is — both read the same record, through one
 * function.
 */
import { titleCase } from './name.js';

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
    s: `$${Number(rec.minPsf).toLocaleString('en-SG')} — $${Number(rec.maxPsf).toLocaleString('en-SG')} psf · ${rec.n} filed`,
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
