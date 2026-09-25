import { ImageResponse } from 'next/og';
import MarkPng from '../../../components/MarkPng.jsx';

/* The manifest's PNG icons. Android needs 192 and 512; the maskable one keeps
   the mark inside the safe zone so a round launcher does not crop the towers. */
const SIZES = new Set([192, 512]);

export async function GET(req, { params }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });
  const maskable = new URL(req.url).searchParams.get('maskable') === '1';
  return new ImageResponse(<MarkPng size={size} radius={maskable ? 0 : size * 0.22} inset={maskable ? size * 0.14 : 0} />,
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=604800, immutable' } });
}
