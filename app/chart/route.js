export const runtime = 'nodejs';
export const revalidate = 86400;

/**
 * The data graphic that goes inside an article.
 *
 * ── WHY IT IS A ROUTE AND NOT INLINE SVG ───────────────────────────────────
 * lib/sanitize.js strips <svg> from article HTML, deliberately — it is an XSS
 * vector and article HTML arrives over a webhook. <img> survives the
 * allowlist, so the graphic is served from here and referenced, exactly the
 * arrangement /og already uses for share cards.
 *
 * ── WHY THE VALUES ARE IN THE URL ──────────────────────────────────────────
 * A chart that recomputed from live data would drift away from the prose
 * beside it: the article says a town moved 11.8% in 2026-Q2 and the picture
 * would quietly become last quarter's. The article is about a dated finding,
 * so the picture is fixed to that finding. Its source line is in the URL too,
 * for the same reason every figure on this site carries one.
 *
 * ── WHY SVG AND NOT AN IMAGE ───────────────────────────────────────────────
 * It is bars and text. SVG is a tenth the bytes, stays sharp on any screen,
 * and needs no rendering runtime. Share cards are PNG because social scrapers
 * will not take SVG; nothing in an article page has that constraint.
 */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = 720, PAD = 18, ROW = 30, LABEL = 168;
/* Room for the value that sits at the END of a bar. Without it the longest bar
   runs to the canvas edge and its own label falls off — "907 psf" rendered as
   "9(" on the first live chart. The longest bar is by definition the one the
   chart is about, so the clipped label was always the one that mattered. */
const VALUE = 92;

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const title = (q.get('t') || '').slice(0, 90);
  const source = (q.get('s') || '').slice(0, 160);
  const unit = (q.get('u') || '').slice(0, 12);
  const hi = q.get('hi') || '';

  /* label:value pairs. Anything unparseable is dropped rather than drawn as
     zero — a bar of length nothing reads as a measured nothing. */
  const rows = (q.get('d') || '').split(',').map(pair => {
    const i = pair.lastIndexOf(':');
    if (i < 1) return null;
    const value = Number(pair.slice(i + 1));
    return Number.isFinite(value) ? { label: pair.slice(0, i).slice(0, 28), value } : null;
  }).filter(Boolean).slice(0, 14);

  if (!rows.length) {
    return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      { status: 400, headers: { 'content-type': 'image/svg+xml' } });
  }

  /* A shared baseline at zero, so bar lengths are comparable. Negative values
     are drawn from the axis in the other direction rather than by their
     magnitude, because a fall of 3% and a rise of 3% are not the same fact. */
  const max = Math.max(...rows.map(r => Math.abs(r.value)));
  const anyNeg = rows.some(r => r.value < 0);
  const track = W - PAD * 2 - LABEL - VALUE;
  const zero = PAD + LABEL + (anyNeg ? track / 2 : 0);
  const scale = (anyNeg ? track / 2 : track) / (max || 1);

  const head = title ? 34 : 0;
  const foot = source ? 30 : 0;
  const H = head + rows.length * ROW + foot + PAD;

  const bars = rows.map((r, i) => {
    const y = head + i * ROW + 6;
    const len = Math.abs(r.value) * scale;
    const x = r.value < 0 ? zero - len : zero;
    const on = hi && r.label.toLowerCase() === hi.toLowerCase();
    return `
      <text x="${PAD + LABEL - 10}" y="${y + 12}" text-anchor="end"
        font-family="IBM Plex Mono, ui-monospace, monospace" font-size="12"
        fill="${on ? '#164F52' : '#6B7573'}" ${on ? 'font-weight="600"' : ''}>${esc(r.label)}</text>
      <rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, len).toFixed(1)}" height="17" rx="2"
        fill="${on ? '#164F52' : '#C3D2D2'}"/>
      <text x="${(x + len + 8).toFixed(1)}" y="${y + 12}"
        font-family="IBM Plex Mono, ui-monospace, monospace" font-size="12"
        fill="${on ? '#11201F' : '#6B7573'}" ${on ? 'font-weight="600"' : ''}>${esc(r.value)}${esc(unit)}</text>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  ${title ? `<text x="${PAD}" y="20" font-family="Archivo, system-ui, sans-serif" font-size="14" font-weight="600" fill="#11201F">${esc(title)}</text>` : ''}
  ${anyNeg ? `<line x1="${zero}" y1="${head}" x2="${zero}" y2="${head + rows.length * ROW}" stroke="#D9DEDC"/>` : ''}
  ${bars}
  ${source ? `<text x="${PAD}" y="${H - 10}" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="10" fill="#8A9391">${esc(source)}</text>` : ''}
</svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, immutable',
    },
  });
}
