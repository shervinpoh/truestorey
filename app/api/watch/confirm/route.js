import { confirmWatch, configured } from '../../../../lib/supabase/rest.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The second half of the double opt-in, reached from a link in an email.
 *
 * A GET, and a redirect rather than JSON, because the only thing that ever
 * follows this link is a person clicking it in a mail client. They should land
 * on a page that says what happened, not on a body of braces.
 */
export async function GET(req) {
  const to = p => Response.redirect(new URL(p, req.url), 302);
  if (!configured()) return to('/watch/confirmed?state=off');

  const token = new URL(req.url).searchParams.get('t');
  if (!token) return to('/watch/confirmed?state=bad');

  const { data, error } = await confirmWatch(token);
  if (error) return to('/watch/confirmed?state=error');
  if (!data) return to('/watch/confirmed?state=bad');
  return to(`/watch/confirmed?state=ok&b=${encodeURIComponent(data.label || '')}`);
}
