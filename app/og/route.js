/**
 * Share cards.
 *
 * Every block and project gets an image that carries the figure, its source
 * and — the point of the exercise — his name and CEA registration number. A
 * screenshot of a number is anonymous; a share card is not. When someone
 * forwards a block page into a family WhatsApp group, his contact travels
 * with it. That was the watermark decision, applied to the thing people
 * actually share rather than only to charts.
 *
 * Drawn as SVG rather than through @vercel/og, for three reasons: this repo
 * has three dependencies and is better for it, SVG is what the design already
 * is (hairlines and type, no photography), and it renders identically
 * everywhere without a WASM font rasteriser.
 *
 *   /og?t=Blk+275A+Bishan+St+24&v=1,099&u=psf&s=$919+—+$1,263+psf&k=Bishan
 *
 * WhatsApp and iMessage will not preview an SVG, so the route serves PNG when
 * asked and SVG otherwise — see toPng() below for why that is currently a
 * documented limitation rather than a conversion.
 */
export const runtime = 'nodejs';
export const revalidate = 86400;

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').slice(0, 160);

/** Rough advance width so long block names can be stepped down instead of overflowing. */
const fits = (text, size, max) => String(text).length * size * 0.55 <= max;
function shrink(text, start, min, max) {
  let s = start;
  while (s > min && !fits(text, s, max)) s -= 2;
  return s;
}

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const title = q.get('t') || 'Truestorey';
  const value = q.get('v') || '';
  const unit = q.get('u') || '';
  const side = q.get('s') || '';
  const kicker = q.get('k') || '';
  const src = q.get('src') || 'Filed transactions · data.gov.sg and URA Data Service';

  const a = {
    name: process.env.NEXT_PUBLIC_AGENT_NAME || '',
    cea: process.env.NEXT_PUBLIC_CEA_REG || '',
    agency: process.env.NEXT_PUBLIC_AGENCY || '',
  };

  const W = 1200, H = 630, M = 72;
  const titleSize = shrink(title, 60, 34, W - M * 2);
  const valueSize = value.length > 9 ? 150 : 190;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<style>
 text{font-family:"Schibsted Grotesk","Helvetica Neue",Helvetica,Arial,sans-serif;fill:#101112}
 .mono{font-family:"DM Mono","SFMono-Regular",Menlo,Consolas,monospace}
 .lab{font-size:17px;letter-spacing:2.4px;fill:#8B9095}
 .mk{font-size:27px;font-weight:800;letter-spacing:-1.3px}
 .t{font-weight:700;letter-spacing:-2.2px}
 .v{font-weight:700;letter-spacing:-7px}
 .u{font-size:44px;font-weight:500;fill:#8B9095;letter-spacing:-1px}
 .s{font-size:26px;fill:#3D4145}
 .f{font-size:19px;fill:#8B9095;letter-spacing:.4px}
</style>
<rect width="${W}" height="${H}" fill="#FDFDFC"/>
<!-- rule 2: no rounded corners, even here -->
<rect x="0" y="0" width="${W}" height="6" fill="#101112"/>
<text class="mk" x="${M}" y="${M + 22}">Truestorey<tspan fill="#8B9095" font-weight="400"> / sg</tspan></text>
${kicker ? `<text class="mono lab" x="${W - M}" y="${M + 20}" text-anchor="end">${esc(kicker.toUpperCase())}</text>` : ''}
<line x1="${M}" y1="${M + 52}" x2="${W - M}" y2="${M + 52}" stroke="#E3E5E6" stroke-width="1"/>

<text class="t" x="${M}" y="252" font-size="${titleSize}">${esc(title)}</text>

<line x1="${M}" y1="300" x2="${W - M}" y2="300" stroke="#101112" stroke-width="1"/>
<text class="v" x="${M}" y="${300 + valueSize * 0.78}" font-size="${valueSize}">${esc(value)}<tspan class="u" dx="14">${esc(unit)}</tspan></text>
${side ? `<text class="mono s" x="${M}" y="${300 + valueSize * 0.78 + 64}">${esc(side)}</text>` : ''}

<line x1="${M}" y1="${H - 108}" x2="${W - M}" y2="${H - 108}" stroke="#E3E5E6" stroke-width="1"/>
<text class="mono f" x="${M}" y="${H - 74}">${esc(src)}</text>
<text class="mono f" x="${M}" y="${H - 44}">${esc([a.name, a.cea && `CEA Reg. No. ${a.cea}`, a.agency].filter(Boolean).join('  ·  '))}</text>
<text class="mono f" x="${M}" y="${H - 16}">Not a valuation or an offer.</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
    },
  });
}
