import { NextResponse } from 'next/server';
import { sanitise } from '../../../lib/analytics.js';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/**
 * Event sink.
 *
 * ⚠ WRITES TO A LOCAL FILE. That is correct for local and for a long-running
 * Node server, and WRONG for serverless — on Vercel and friends the filesystem
 * is ephemeral, so events written here vanish. When the site is deployed
 * somewhere serverless, swap the body of `append` for a real sink (the CRM
 * sheet, a database, a log service). The rest of the pipeline stays as is.
 *
 * Privacy contract lives in lib/analytics.js. The `sanitise` call is the
 * boundary — anything not whitelisted there never reaches disk. In particular
 * this route deliberately does NOT read x-forwarded-for. Do not add it.
 */

const LOG = () => path.join(process.cwd(), 'data', 'events.jsonl');
const MAX_BODY = 2 * 1024;
const MAX_LOG_BYTES = 50 * 1024 * 1024;   // stop before a runaway fills the disk

let warned = false;

function append(line) {
  const p = LOG();
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > MAX_LOG_BYTES) {
      if (!warned) { console.warn('events.jsonl over 50MB — rotate or archive it'); warned = true; }
      return;
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, line + '\n');
  } catch (e) {
    if (!warned) { console.warn('analytics write failed:', e.message); warned = true; }
  }
}

export async function POST(req) {
  // Always 204, whatever happens. A visitor must never see an analytics error,
  // and a bot must learn nothing from the response.
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return new NextResponse(null, { status: 204 });
    const ev = sanitise(JSON.parse(raw));
    if (ev) append(JSON.stringify(ev));
  } catch { /* swallow */ }
  return new NextResponse(null, { status: 204 });
}
