import { ImageResponse } from 'next/og';

/**
 * Share cards.
 *
 * Every block and project gets an image carrying the figure, its source and —
 * the point of the exercise — his name and CEA registration number. A
 * screenshot of a number is anonymous; a share card is not. When someone
 * forwards a block page into a family WhatsApp group, his contact travels
 * with it.
 *
 * ── WHY THIS IS PNG NOW ────────────────────────────────────────────────────
 * It was SVG, hand-written, on the reasoning that this repo has three
 * dependencies and is better for it. The reasoning was sound and the outcome
 * was that the cards did not work: WhatsApp will not preview an SVG, and
 * WhatsApp is how a link travels in this market. Every share the site has
 * ever produced arrived as a bare link. A card nobody sees is not a card.
 *
 * It costs no dependency after all. `next/og` ships inside Next 15 — the same
 * renderer @vercel/og provides, already on disk — so this is one import from
 * a package the repo already has, not a fourth entry in package.json.
 *
 * ── AND WHY IT LOOKS DIFFERENT ─────────────────────────────────────────────
 * The old card was built to the design system that was retired on 29 Aug: a
 * near-white ground, Schibsted and DM Mono, and a comment reading "rule 2: no
 * rounded corners, even here" citing a rule that no longer exists. It had
 * quietly become the only surface still on the old look. This is the live
 * one — warm paper, the deep teal as structure, the figure largest.
 *
 * Type is the renderer's default face rather than Archivo and IBM Plex.
 * Fetching webfonts per render adds a failure mode that takes the whole card
 * with it, and a card that renders in the wrong face beats a card that does
 * not render. If the brand's type is settled later, this is the place.
 */
export const runtime = 'nodejs';
export const revalidate = 86400;

const cut = (s, n) => String(s ?? '').slice(0, n);

/* Only Commons, and only its image hosts: this route fetches the URL it is
   given, and a card generator that fetches anything is an open proxy. */
const COMMONS = /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//;

/** The photograph as a data URI, fetched with a user agent Wikimedia accepts. */
async function photo(src) {
  if (!COMMONS.test(src)) return null;
  try {
    const small = src.replace(/\/1280px-/, '/960px-');
    const res = await fetch(small, {
      headers: { 'user-agent': 'Truestorey/1.0 (https://truestorey.vercel.app; share cards)' },
      signal: AbortSignal.timeout(6000),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
    return `data:${type.split(';')[0]};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch { return null; }
}

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (q.get('a') === '1') {
    const img = await photo(String(q.get('img') || ''));
    if (img) return articleCard(q, img);
  }
  const title = cut(q.get('t') || 'Truestorey', 90);
  const value = cut(q.get('v') || '', 24);
  const unit = cut(q.get('u') || '', 12);
  const side = cut(q.get('s') || '', 120);
  const kicker = cut(q.get('k') || '', 40);
  const src = cut(q.get('src') || 'Filed transactions · data.gov.sg and URA Data Service', 150);

  const name = process.env.NEXT_PUBLIC_AGENT_NAME || '';
  const cea = process.env.NEXT_PUBLIC_CEA_REG || '';
  const agency = process.env.NEXT_PUBLIC_AGENCY || '';
  const legal = [name, cea && `CEA Reg. No. ${cea}`, agency].filter(Boolean).join('  ·  ');

  /* The live palette. --paper, --acc, --ink, --mute, --line. */
  const PAPER = '#F6F5F2', ACC = '#164F52', INK = '#111414', MUTE = '#666E6A', LINE = '#E2E0D9';
  const titleSize = title.length > 46 ? 40 : title.length > 30 ? 50 : 60;
  const valueSize = value.length > 9 ? 116 : 150;
  const rule = { height: 1, background: LINE, width: '100%' };

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: PAPER, color: INK, padding: '64px 72px',
        // The deep teal as structure, not decoration — the interface colour
        // doing the one job it has on every other surface.
        borderTop: `10px solid ${ACC}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>
            True<span style={{ color: ACC }}>storey</span>
          </div>
          {kicker ? <div style={{ fontSize: 20, letterSpacing: 2, color: MUTE }}>{kicker.toUpperCase()}</div> : null}
        </div>
        <div style={{ ...rule, marginTop: 22 }} />

        <div style={{
          display: 'flex', fontSize: titleSize, fontWeight: 700, letterSpacing: -1.5,
          marginTop: 34, lineHeight: 1.12, maxWidth: 1000,
        }}>{title}</div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <div style={{ fontSize: valueSize, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>{value}</div>
            {unit ? <div style={{ fontSize: 40, color: MUTE, marginLeft: 14 }}>{unit}</div> : null}
          </div>
          {side ? <div style={{ display: 'flex', fontSize: 26, color: '#48514F', marginTop: 14 }}>{side}</div> : null}
        </div>

        <div style={{ ...rule, marginTop: 30 }} />
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 19, color: MUTE, marginTop: 16, lineHeight: 1.5 }}>
          <div style={{ display: 'flex' }}>{src}</div>
          {legal ? <div style={{ display: 'flex' }}>{legal}</div> : null}
          <div style={{ display: 'flex' }}>Not a valuation or an offer.</div>
        </div>
      </div>
    ),
    {
      width: 1200, height: 630,
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable' },
    },
  );
}

/**
 * An article's card: its photograph on the left, its headline on the right,
 * and the photograph's credit printed on it. The legal line is the same as
 * every other card's — the registration travels with every share.
 */
function articleCard(q, img) {
  const title = cut(q.get('t') || 'Truestorey', 110);
  const side = cut(q.get('s') || '', 150);
  const kicker = cut(q.get('k') || '', 40);
  const credit = cut(q.get('cr') || '', 110);
  const name = process.env.NEXT_PUBLIC_AGENT_NAME || '';
  const cea = process.env.NEXT_PUBLIC_CEA_REG || '';
  const legal = [name, cea && `CEA Reg. No. ${cea}`].filter(Boolean).join('  ·  ');
  const PAPER = '#F6F5F2', ACC = '#164F52', INK = '#111414', MUTE = '#666E6A';
  const titleSize = title.length > 80 ? 36 : title.length > 55 ? 42 : 50;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: PAPER, color: INK }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 560, height: '100%', position: 'relative' }}>
          <img src={img} width={560} height={630} style={{ width: 560, height: 630, objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', padding: '10px 16px',
            background: 'rgba(17,20,20,0.62)', color: '#F2F2F0', fontSize: 15,
          }}>{credit}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '48px 52px 40px', borderTop: `10px solid ${ACC}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>
              True<span style={{ color: ACC }}>storey</span>
            </div>
          </div>
          {kicker ? <div style={{ display: 'flex', fontSize: 18, letterSpacing: 2, color: MUTE, marginTop: 26 }}>{kicker.toUpperCase()}</div> : null}
          <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.12, marginTop: 14 }}>{title}</div>
          {side ? <div style={{ display: 'flex', fontSize: 22, color: '#48514F', marginTop: 18, lineHeight: 1.35 }}>{side}</div> : null}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', fontSize: 16, color: MUTE, lineHeight: 1.5 }}>
            {legal ? <div style={{ display: 'flex' }}>{legal}</div> : null}
            <div style={{ display: 'flex' }}>Free to read · truestorey.vercel.app</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable' } },
  );
}
