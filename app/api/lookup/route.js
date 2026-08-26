import { NextResponse } from 'next/server';
import { hdbLookup, privateLookup } from '../../../lib/data/query.js';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind') || 'HDB';
  const r = kind === 'HDB'
    ? hdbLookup(q.get('town'), q.get('flatType'))
    : privateLookup(q.get('district'), q.get('propertyType'));
  if (!r) return NextResponse.json({ error: 'No data for that selection.' }, { status: 404 });
  return NextResponse.json(r);
}
