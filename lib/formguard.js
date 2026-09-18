/**
 * The three guards every public POST on this site needs, in one place.
 *
 * app/api/lead/route.js grew them first — a body cap, a per-IP throttle and a
 * honeypot — and NEXT.md §8.2 says the report route is "worth inheriting them
 * either way". Inheriting, not copying: two copies is how one of them ends up
 * with a different window, and this repo already pays for one duplicated
 * implementation (lib/calc/proceeds.js).
 *
 * The throttle is in memory, so it resets on redeploy and is per-instance on
 * serverless. That makes it a speed bump rather than a security boundary, and
 * it is meant to be: the thing it protects against is a loop, not an attacker.
 */

export const MAX_BODY = 8 * 1024;   // a form post is ~1KB; larger is not a form

export const ipOf = req =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

/**
 * Read a JSON body without trusting its size.
 * @returns {{ body: object } | { error: string, status: number }}
 */
export async function readJson(req, { max = MAX_BODY } = {}) {
  const raw = await req.text();
  if (raw.length > max) return { error: 'That request was too large.', status: 413 };
  try { return { body: JSON.parse(raw) }; }
  catch { return { error: 'Could not read that form.', status: 400 }; }
}

/**
 * A counter per key, over a rolling window. Each caller keeps its own, so the
 * lead form's five an hour and the report's limits cannot drift into each
 * other.
 */
export function makeThrottle({ windowMs, max, cap = 5000 }) {
  const hits = new Map();
  return function throttled(key) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (hits.size > cap) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
    return list.length > max;
  };
}

/** A hidden field only an automated submitter fills. */
export const isBot = body => Boolean(body?.website);
