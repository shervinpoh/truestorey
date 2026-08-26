import { NextResponse } from 'next/server';
import { catalogue } from '../../../lib/data/query.js';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json(catalogue()); }
