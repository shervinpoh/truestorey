import { deleteWatch, configured } from '../../../../lib/supabase/rest.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Withdrawing consent, in one click and with no reply to anybody.
 *
 * GET AND POST BOTH, and that is not belt-and-braces. The body link is a GET
 * that a person clicks. The List-Unsubscribe-Post header tells Gmail and Yahoo
 * they may POST here on the reader's behalf when they press their own
 * unsubscribe button — the one in the mail client's chrome, which is the
 * button most people actually use. Supporting only GET means that button
 * silently fails and the reader marks the mail as spam instead.
 *
 * The row is deleted, not flagged. PDPA s16 says stop using the data; the only
 * way to be certain is for it not to be there.
 */
async function drop(req) {
  if (!configured()) return null;
  const token = new URL(req.url).searchParams.get('t');
  if (!token) return null;
  const { data } = await deleteWatch(token);
  return data;
}

export async function GET(req) {
  const data = await drop(req);
  return Response.redirect(
    new URL(data ? `/watch/stopped?b=${encodeURIComponent(data.label || '')}` : '/watch/stopped?state=bad', req.url),
    302);
}

/* One-click from the mail client. It wants a 200 and reads no body. */
export async function POST(req) {
  await drop(req);
  return new Response(null, { status: 200 });
}
