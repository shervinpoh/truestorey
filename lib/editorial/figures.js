/**
 * A figure, as the writer is handed it and as a reader sees it.
 *
 * Every number in a Truestorey article is one of these before it is a word.
 * It carries what it measures, the period, the agency and a link, and it is
 * displayed in exactly one way — "S$907 psf", "11.8%", "3,222" — so the check
 * in verify.js can tell a figure that was copied from one that was made up.
 */

const num = (n, dp = 0) => Number(n).toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * @param f { id, what, value, format, period, source, url, dp }
 *   format: 'money' | 'psf' | 'psfppr' | 'psm' | 'pct' | 'pts' | 'count' | 'index' | 'sqm' | 'text'
 */
export function show(f) {
  const v = f.value;
  switch (f.format) {
    case 'money': return Math.abs(v) >= 1e6 && f.short
      ? `S$${num(v / 1e6, f.dp ?? 1)} million` : `S$${num(v, f.dp ?? 0)}`;
    case 'psf': return `S$${num(v, f.dp ?? 0)} psf`;
    case 'psfppr': return `S$${num(v, f.dp ?? 0)} psf ppr`;
    case 'psm': return `S$${num(v, f.dp ?? 0)} psm`;
    case 'pct': return `${num(v, f.dp ?? 1)}%`;
    case 'pts': return `${num(v, f.dp ?? 1)} points`;
    case 'index': return num(v, f.dp ?? 1);
    case 'sqm': return `${num(v, f.dp ?? 0)} sqm`;
    case 'count': return num(v, 0);
    case 'text': return String(v);
    default: return num(v, f.dp ?? 0);
  }
}

/** One line of the pack, as the writer reads it. */
export const line = f => `[${f.id}] ${f.what}: ${show(f)} · ${f.period} · ${f.source}`;

/**
 * The numbers a piece may contain, as normalised strings: "907", "11.8",
 * "2026". Taken from every display string, period and fact in the pack, so a
 * number is allowed exactly when the pack already says it.
 */
export function numbersIn(text) {
  return [...String(text ?? '').matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map(m => normalise(m[0])).filter(Boolean);
}

export function normalise(token) {
  let s = String(token).replace(/,/g, '');
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace(/^0+(?=\d)/, '');
}

export function allowedNumbers(pack) {
  const out = new Set();
  const add = t => { for (const n of numbersIn(t)) out.add(n); };
  for (const f of pack.figures || []) {
    add(show(f)); add(f.period); add(f.what);
    /* A large sum may be written in millions: "S$208.1 million" for
       S$208,099,000. Both forms are the same figure; any other rounding is a
       different one. */
    if (f.format === 'money' && Math.abs(f.value) >= 1e6) {
      add((f.value / 1e6).toFixed(1)); add((f.value / 1e6).toFixed(2));
      if (Math.abs(f.value) >= 1e9) add((f.value / 1e9).toFixed(2));
    }
  }
  for (const x of pack.facts || []) {
    add(x);
    /* "$17,350.26" in a release may be written "S$17,350". */
    for (const n of numbersIn(x)) if (n.includes('.')) out.add(String(Math.round(Number(n))));
  }
  /* The brief is written by code from measured values (a finding's claim
     carries its own percentages), so its numbers are the pack's too. */
  for (const x of [pack.subject, pack.brief, pack.angle, pack.source?.title, pack.source?.date,
    ...(pack.caveats || []), ...(pack.links || []).map(l => l.label)]) add(x);
  return out;
}

/** The key-numbers panel, built from the figures and never by a model. */
export function numbersPanel(pack) {
  const ids = pack.headline?.length ? pack.headline : (pack.figures || []).slice(0, 3).map(f => f.id);
  const figs = ids.map(id => (pack.figures || []).find(f => f.id === id)).filter(Boolean).slice(0, 4);
  if (!figs.length) return '';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<figure><figcaption>The numbers</figcaption><ul>${figs.map(f =>
    `<li><strong>${esc(show(f))}</strong> ${esc(f.what)} <small>${esc(f.period)} · ${esc(f.source)}</small></li>`).join('')}`
    + '</ul></figure>';
}
