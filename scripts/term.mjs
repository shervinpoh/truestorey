/**
 * Shared terminal formatting for the consult CLIs.
 *
 * Extracted when `wrap` was about to be pasted into a second script. It is
 * presentation and not a calculation, so it is not the failure the "two
 * implementations is the bug" note is about — but two copies of a formatter
 * still drift, and one of them ends up wrapping at a different width for no
 * reason anybody can reconstruct.
 */

/** Wrap prose to a width, so a paragraph does not become one long line. */
export function wrap(text, width = 70) {
  const out = [];
  let line = '';
  for (const w of String(text).split(/\s+/)) {
    if ((line + ' ' + w).trim().length > width) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

/** A section divider. */
export const rule = (t = '') =>
  console.log(`\n\x1b[2m${'─'.repeat(3)}\x1b[0m ${t} \x1b[2m${'─'.repeat(Math.max(0, 74 - t.length))}\x1b[0m`);

/** Money, without a currency prefix — callers add S$ where it belongs. */
export const f = n => Number(n).toLocaleString('en-SG', { maximumFractionDigits: 0 });

/** A signed percentage from a ratio. */
export const pc = n => `${n > 0 ? '+' : ''}${(100 * n).toFixed(1)}%`;
