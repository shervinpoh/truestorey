import { NextResponse } from 'next/server';
import { recordByHref } from '../../../lib/data/query.js';
export const dynamic = 'force-dynamic';

/** Records are addressed by their public href — the same string that is the URL. */
export async function GET(req) {
  const href = new URL(req.url).searchParams.get('href');
  if (!href) return NextResponse.json({ error: 'Missing href.' }, { status: 400 });
  const r = recordByHref(href);
  if (!r) return NextResponse.json({ error: 'No record at that path.' }, { status: 404 });
  return NextResponse.json(r);
}
