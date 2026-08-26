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
