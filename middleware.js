import { NextResponse } from 'next/server';

/**
 * HTTP Basic on /studio and its API.
 *
 * /studio lists unpublished drafts and can put them on a public site under a
 * CEA registration number, so it cannot be a page that is merely hard to
 * guess. Basic auth over HTTPS is enough for one user and costs no dependency,
 * no session store and no login page.
 *
 * It is NOT an account system and should not grow into one. If more than one
 * person ever needs in, that is the moment to use Supabase Auth rather than to
 * add a second password here.
 *
 * With STUDIO_PASSWORD unset the route is closed, not open. A misconfigured
 * deploy must never be the one that publishes.
 */
export function middleware(req) {
  const expected = process.env.STUDIO_PASSWORD;
  if (!expected) {
    return new NextResponse('Studio is not configured on this deployment.', { status: 503 });
  }

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const [, pass] = atob(header.slice(6)).split(':');
      // Constant-time-ish: compare full length rather than bailing on the
      // first wrong character.
      if (pass && pass.length === expected.length) {
        let diff = 0;
        for (let i = 0; i < pass.length; i++) diff |= pass.charCodeAt(i) ^ expected.charCodeAt(i);
        if (diff === 0) return NextResponse.next();
      }
    } catch { /* malformed header — fall through to the challenge */ }
  }

  return new NextResponse('Not authorised.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Truestorey studio", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/studio/:path*', '/api/studio/:path*'] };
