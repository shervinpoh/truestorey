import { getIndex, hdbIndex, sora, mop } from './data/query.js';

/**
 * What a hand-written note was written FROM.
 *
 * ── THE GAP THIS CLOSES ────────────────────────────────────────────────────
 * A pipeline article carries `source_urls` and renders a "What this was
 * written from" panel. A note Shervin writes himself carried nothing, so the
 * audit that flags an unsourced article would flag every one of his too — and
 * it would be right to, because the page showed no provenance.
 *
 * But a note is not less sourced than a pipeline article. It is sourced
 * DIFFERENTLY, and better: a shortcode reads this site's own filed data at
 * build time, so `{{index}}` is not a number somebody typed, it is the current
 * HDB resale price index with its quarter and its agency. That is stronger
 * provenance than a link to somebody's write-up of the same figure, and it was
 * simply not being credited.
 *
 * ── WHY IT SCANS THE BODY ──────────────────────────────────────────────────
 * Rather than asking the renderer to report back. A shortcode that fails to
 * resolve renders nothing, and a provenance line naming a dataset the reader
 * cannot see would be worse than none — so `used()` is intersected with what
 * actually resolved before anything is claimed. Scanning keeps that decision
 * in one place instead of threading state through the markdown renderer.
 */

/** Every shortcode name a body uses, in the order they first appear. */
export function shortcodesIn(body) {
  const out = [];
  for (const m of String(body || '').matchAll(/\{\{\s*([a-z]+)(?::[^}]*)?\s*\}\}/gi)) {
    const name = m[1].toLowerCase();
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * The dataset behind each shortcode, with the agency and period as filed.
 * Returns only the ones that can actually be described right now — a dataset
 * missing from the build produces no line rather than an unbacked claim.
 */
export function datasetsFor(body) {
  const used = shortcodesIn(body);
  if (!used.length) return [];

  const idx = getIndex();
  const out = [];
  const add = (label, source, period) => {
    if (!source) return;
    if (out.some(o => o.source === source)) return;   // one line per dataset
    out.push({ label, source, period: period || null });
  };

  for (const name of used) {
    if (name === 'index') {
      const i = hdbIndex();
      if (i) add('HDB resale price index', i.source, i.latest?.quarter);
    } else if (name === 'sora') {
      const s = sora();
      if (s) add('SORA', s.source, s.latest?.date);
    } else if (name === 'mop') {
      const m = mop();
      if (m) add('Flats reaching their minimum occupation period', m.source, m.generatedForYear ? String(m.generatedForYear) : null);
    } else if (name === 'block' || name === 'record' || name === 'town') {
      /* Both read the filed transaction record — the same source line every
         block page prints. Named once however many blocks a note quotes. */
      const h = idx.hdb;
      if (h?.source) add('Filed transactions', h.source, h.period ? `${h.period.from} to ${h.period.to}` : null);
    }
  }
  return out;
}

/**
 * Everything a post can show as provenance: the URLs it names, plus the
 * datasets it read. Either kind counts — an article with neither is the thing
 * the audit exists to catch.
 */
export function provenanceOf(post) {
  const urls = Array.isArray(post?.sources) ? post.sources.filter(Boolean) : [];
  const datasets = post?.html ? [] : datasetsFor(post?.body);
  return { urls, datasets, any: urls.length > 0 || datasets.length > 0 };
}
