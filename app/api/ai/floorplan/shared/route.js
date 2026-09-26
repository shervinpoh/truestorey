import { NextResponse } from 'next/server';
import { open, MAX_TOKEN } from '../../../../../lib/floorplan-share.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Check a shared floor plan report and hand it back to the page.
 *
 * The report lives in the link's fragment, which a browser never sends to a
 * server, so the page posts it here. It is checked against the signature the
 * reading route made, decompressed, cleaned under today's rules and returned.
 * Nothing is stored or logged. An altered link is refused.
 */
export async function POST(req) {
  const raw = await req.text();
  if (raw.length > MAX_TOKEN + 200) return NextResponse.json({ error: 'That link is too long.' }, { status: 413 });
  let token = '';
  try { token = String(JSON.parse(raw).token || ''); } catch { /* treated as empty */ }
  const out = open(token);
  return out.report
    ? NextResponse.json(out.report)
    : NextResponse.json({ error: out.error }, { status: 400 });
}
