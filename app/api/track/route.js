import { NextResponse } from 'next/server';
import { sanitise } from '../../../lib/analytics.js';
import { insertEvent, configured } from '../../../lib/supabase/rest.js';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/**
 * Event sink.
 *
 * SUPABASE WHERE THERE IS ONE, A LOCAL FILE WHERE THERE IS NOT.
 *
 * This used to append to data/events.jsonl and nothing else. That is correct
 * on a long-running Node server and silently wrong on serverless: the write
 * succeeds, the route returns 204, the container is recycled, and the events
 * are gone. Nothing anywhere reports a problem — the endpoint looks perfectly
 * healthy while losing every visit, which is the worst failure available,
 * because you only find out by noticing the numbers were never plausible.
 *
 * So the file path is now the FALLBACK, kept because it is genuinely right for
 * local development where nobody wants a database round trip per page view.
 * When Supabase is configured, that is the sink.
 *
 * The privacy contract has not moved. lib/analytics.js is still the boundary
 * and still the only place that decides what may be stored: no cookies, no IP
 * even hashed, no user agent, no free text from the lead form. This route
 * deliberately does NOT read x-forwarded-for. Do not add it — that single line
 * would turn the table into personal data and the site into one that needs a
 * consent notice.
 */

const LOG = () => path.join(process.cwd(), 'data', 'events.jsonl');
const MAX_BODY = 2 * 1024;
const MAX_LOG_BYTES = 50 * 1024 * 1024;   // stop before a runaway fills the disk

let warned = false;
const warnOnce = msg => { if (!warned) { console.warn(msg); warned = true; } };

function appendToFile(line) {
  const p = LOG();
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > MAX_LOG_BYTES) {
      warnOnce('events.jsonl over 50MB — rotate or archive it');
      return;
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, line + '\n');
  } catch (e) {
    warnOnce('analytics write failed: ' + e.message);
  }
}

export async function POST(req) {
  // Always 204, whatever happens. A visitor must never see an analytics error,
  // and a bot must learn nothing from the response.
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return new NextResponse(null, { status: 204 });
    const ev = sanitise(JSON.parse(raw));
    if (!ev) return new NextResponse(null, { status: 204 });

    if (configured()) {
      // Awaited on purpose. A serverless function may be frozen the moment it
      // responds, so a fire-and-forget insert is a coin toss — which is the
      // same class of silent loss this change exists to end. insertEvent caps
      // itself at 2.5s so a slow database cannot hold the page open.
      const { error } = await insertEvent(ev);
      if (error) warnOnce('analytics insert failed: ' + error);
    } else {
      appendToFile(JSON.stringify(ev));
    }
  } catch { /* swallow */ }
  return new NextResponse(null, { status: 204 });
}
