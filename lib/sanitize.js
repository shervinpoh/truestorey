/**
 * An allowlist sanitiser for article HTML.
 *
 * The pipeline writes finished HTML and the site renders it with
 * dangerouslySetInnerHTML. That is the correct design — the point is that the
 * formatting survives — and it is also the moment a leaked webhook secret
 * stops being an embarrassment and becomes stored XSS on every visitor, on
 * every page, for as long as the row exists.
 *
 * ALLOWLIST, NOT BLOCKLIST. A blocklist is a list of the attacks someone
 * thought of. Anything not named below is removed, including tags that look
 * harmless: style can position an invisible overlay across the viewport, base
 * rewrites every relative link on the page, and form posts wherever it likes.
 * None of them appears in a property article.
 *
 * This is not a full HTML parser and does not pretend to be. It is a strict
 * filter over a narrow, known input — HTML this project's own pipeline
 * produces — and it fails closed: anything it cannot confidently parse is
 * dropped rather than passed through.
 */

const TAGS = new Set([
  'p', 'br', 'hr',
  'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'mark',
  'ul', 'ol', 'li',
  'blockquote', 'figure', 'figcaption', 'cite',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
  'code', 'pre', 'span', 'div', 'small', 'time',
]);

/* h1 is deliberately absent: the page supplies it, and a second one breaks both
   the document outline and the heading order a screen reader announces. */

const ATTRS = {
  a: ['href', 'title', 'rel', 'target'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  time: ['datetime'],
  th: ['scope', 'colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  ol: ['start'],
};

/* Empty on purpose. Every on-handler is excluded by never being listed. */
const GLOBAL_ATTRS = [];

const VOID = new Set(['br', 'hr', 'img']);

/* Space, tab, newline and the C0 controls. Built from escapes rather than
   written as a literal range so the source stays plain ASCII. */
const CONTROL = new RegExp('[\\u0000-\\u0020]+', 'g');

/** http(s), mailto, and same-site paths only. */
function safeUrl(value, { allowData = false } = {}) {
  const v = String(value || '').trim();
  // A tab inside "java<TAB>script:" defeats a naive prefix check, so the
  // control characters come out before the scheme is examined.
  const flat = v.replace(CONTROL, '').toLowerCase();
  if (flat.startsWith('javascript:') || flat.startsWith('vbscript:')) return null;
  if (flat.startsWith('data:')) {
    return allowData && /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(v) ? v : null;
  }
  if (/^https?:\/\//i.test(v) || /^mailto:/i.test(v) || v.startsWith('/') || v.startsWith('#')) return v;
  return null;
}

const escapeText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Parse an attribute list without trusting the quoting to be tidy. */
function attrsOf(raw) {
  const out = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>=`]+))/g;
  let m;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  return out;
}

export function sanitizeHtml(input, { allowDataImages = false } = {}) {
  if (typeof input !== 'string' || !input) return '';

  // Elements whose CONTENT is dangerous too, removed inners and all.
  const html = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|base|form|input|button|link|meta)\b[^>]*\/?>/gi, '');

  const open = [];
  let out = '';
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { out += escapeText(html.slice(i)); break; }
    out += escapeText(html.slice(i, lt));

    const gt = html.indexOf('>', lt);
    if (gt < 0) { out += escapeText(html.slice(lt)); break; }   // unterminated: fail closed

    const inner = html.slice(lt + 1, gt);
    i = gt + 1;

    const isClose = inner.startsWith('/');
    const m = /^\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(inner);
    // Not a tag at all — "5 < 10 and 10 > 5" reaches here. Escape it back into
    // the text. Dropping it would silently delete everything between a stray
    // angle bracket and the next one, which is data loss disguised as safety.
    if (!m) { out += escapeText(`<${inner}>`); continue; }
    const tag = m[1].toLowerCase();
    // Not allowed: drop the TAG but keep the text it wrapped. Removing the
    // content too would silently eat paragraphs over one stray element.
    if (!TAGS.has(tag)) continue;

    if (isClose) {
      const at = open.lastIndexOf(tag);
      if (at < 0) continue;                            // stray close tag
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }

    const raw = attrsOf(inner.slice(m[0].length));
    const kept = [];
    let dropTag = false;
    for (const name of [...(ATTRS[tag] || []), ...GLOBAL_ATTRS]) {
      if (!(name in raw)) continue;
      let value = raw[name];
      if (name === 'href' || name === 'src') {
        value = safeUrl(value, { allowData: allowDataImages && name === 'src' });
        // An img with no usable src is a broken icon; an a with none is fine
        // as plain text. Neither keeps the attribute.
        if (!value) { if (tag === 'img') dropTag = true; continue; }
      }
      if (name === 'target') value = '_blank';
      if (name === 'rel') continue;                    // set below, never taken from input
      kept.push(`${name}="${String(value).replace(/"/g, '&quot;')}"`);
    }
    if (dropTag) continue;

    // A target=_blank link without this hands window.opener to wherever it points.
    if (tag === 'a' && kept.some(k => k.startsWith('target='))) kept.push('rel="noopener noreferrer"');
    if (tag === 'img' && !kept.some(k => k.startsWith('loading='))) kept.push('loading="lazy"');

    const attrs = kept.length ? ' ' + kept.join(' ') : '';
    if (VOID.has(tag) || inner.trimEnd().endsWith('/')) { out += `<${tag}${attrs}>`; continue; }
    open.push(tag);
    out += `<${tag}${attrs}>`;
  }

  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** Plain text, for excerpts and length checks. */
export function textOf(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
