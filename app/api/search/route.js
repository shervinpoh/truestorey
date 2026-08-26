import { NextResponse } from 'next/server';
import { search } from '../../../lib/data/query.js';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const results = search(q.get('q') || '', {
    kind: q.get('kind') || null,
    limit: Math.min(Number(q.get('limit')) || 12, 30),
  });
  return NextResponse.json({ results });
}
