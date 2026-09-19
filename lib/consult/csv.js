/**
 * One CSV reader.
 *
 * Extracted when a third was about to be written. scripts/find.mjs and
 * scripts/ingest-realis.mjs each had their own, and they had already drifted:
 * one stripped surrounding quotes and skipped `#` comment lines, the other
 * hunted for a header row past a preamble. Both behaviours are wanted, neither
 * file had both, and the repo has a standing note about what two
 * implementations of one thing cost.
 *
 * No dependency: three npm dependencies is the architecture, and a flat export
 * is quoted fields separated by commas.
 */

/** Split one line, honouring quoted fields that contain commas. */
function splitLine(l) {
  const out = [];
  let cur = '', q = false;
  for (const ch of l) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim().replace(/^"|"$/g, ''));
}

/** Lower-cased and stripped, so "Unit Price ($ PSF)" and "unit_price_psf"
 *  collapse to one key. Every alias table is written in this form. */
export const norm = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * @param text     the file
 * @param known    optional alias groups — when given, the header is the first
 *                 row matching at least `minHits` of them, so a REALIS-style
 *                 title preamble is skipped rather than read as column names.
 * @returns { head, rows, skippedPreamble } — head is null when no header was
 *          recognised, which the caller must report rather than treating as
 *          an empty file.
 */
export function parseCsv(text, { known = null, minHits = 3, comments = true } = {}) {
  const lines = String(text).split(/\r?\n/)
    .filter(l => l.trim() && !(comments && l.trimStart().startsWith('#')));
  if (!lines.length) return { head: null, rows: [], skippedPreamble: 0 };

  let headIdx = 0;
  if (known) {
    headIdx = -1;
    const groups = Object.values(known);
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      const cells = splitLine(lines[i]).map(norm);
      if (groups.filter(as => as.some(a => cells.includes(a))).length >= minHits) { headIdx = i; break; }
    }
    if (headIdx < 0) return { head: null, rows: [], skippedPreamble: 0 };
  }

  const head = splitLine(lines[headIdx]);
  /* Rows whose width does not match the header are dropped — a ragged row is
     a quoting bug and silently shifting its columns would misfile every field
     after the break. */
  const rows = lines.slice(headIdx + 1).map(splitLine).filter(r => r.length === head.length);
  return { head, rows, skippedPreamble: headIdx, ragged: lines.length - 1 - headIdx - rows.length };
}

/** Map a header row onto fields via an alias table. Returns the column index
 *  per field and every header it could not place — a column quietly ignored
 *  is the failure mode of every CSV importer ever written. */
export function mapColumns(head, aliases) {
  const col = {};
  const used = new Set();
  head.forEach((h, i) => {
    const n = norm(h);
    for (const [field, list] of Object.entries(aliases)) {
      if (col[field] === undefined && list.includes(n)) { col[field] = i; used.add(i); }
    }
  });
  return { col, unmapped: head.filter((_, i) => !used.has(i)) };
}

export const num = v => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
