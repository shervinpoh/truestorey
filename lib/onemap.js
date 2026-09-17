/**
 * OneMap — SLA's own address index — asked at request time, for one purpose:
 * when this site's search finds nothing, is what the reader typed a real
 * address, and which filed record does it belong to?
 *
 * ── WHY NOT scripts/lib/onemap.mjs ─────────────────────────────────────────
 * That client is for a 13,000-lookup batch: a disk cache, a pace shared by
 * three lanes, console output. A serverless request has a read-only disk, no
 * lanes and a reader waiting. What carries over is what it learned the hard
 * way, and both of those are kept below.
 *
 *  · RESULTS WIN OVER AN `error`. OneMap answers an unauthenticated search with
 *    { error: "Authentication token missing…", found, results: [...] }. The
 *    batch client once bailed on the error alone and quietly geocoded nothing.
 *  · IT THROTTLES HARD. Measured again on 18 Sep: three lookups a few hundred
 *    milliseconds apart and the fourth was a 429 — served as an HTML page, not
 *    JSON. On Vercel the egress addresses are shared with other customers, so
 *    this WILL happen. A throttled or unreadable answer is `unavailable`, is
 *    never cached (caching a blip bakes it in), and the search box says the
 *    address could not be checked rather than that it does not exist.
 *
 * ── WHAT OneMap IS TOLD ────────────────────────────────────────────────────
 * The query, from this server. Not the reader's address, IP or anything else
 * about them — OneMap sees Vercel. /privacy says so, because the page used to
 * say no government API was ever asked anything at request time.
 */

import { worthLooking } from './address.js';

const BASE = 'https://www.onemap.gov.sg/api/common/elastic/search';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED = 500;

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const cache = new Map();
function remember(key, value) {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export { worthLooking };

/**
 * @returns {Promise<{status:'ok', results:object[]} | {status:'none'} |
 *   {status:'unavailable', reason:string} | {status:'skipped'}>}
 */
export async function lookupAddress(q, { fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  if (!worthLooking(q)) return { status: 'skipped' };
  const key = norm(q);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const url = `${BASE}?searchVal=${encodeURIComponent(q.trim())}&returnGeom=N&getAddrDetails=Y&pageNum=1`;
  const token = process.env.ONEMAP_TOKEN;
  let res, body;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    body = await res.text();
  } catch (e) {
    return { status: 'unavailable', reason: e.name === 'TimeoutError' ? 'timed out' : 'unreachable' };
  }
  if (res.status === 429) return { status: 'unavailable', reason: 'throttled' };
  if (!res.ok) return { status: 'unavailable', reason: `HTTP ${res.status}` };

  let j;
  try { j = JSON.parse(body); } catch { return { status: 'unavailable', reason: 'unreadable answer' }; }
  const raw = Array.isArray(j?.results) ? j.results : [];
  const results = raw.slice(0, 5).map(r => ({
    blk: norm(r.BLK_NO) || null,
    road: norm(r.ROAD_NAME) || null,
    building: norm(r.BUILDING) && norm(r.BUILDING) !== 'NIL' ? norm(r.BUILDING) : null,
    postal: /^\d{6}$/.test(String(r.POSTAL)) ? String(r.POSTAL) : null,
  })).filter(r => r.road);

  if (results.length) return remember(key, { status: 'ok', results });
  /* ── `found: 0` IS AN ANSWER, EVEN BESIDE AN `error` ─────────────────────
     Checked against the live API on 18 Sep: an unauthenticated search for an
     address that does not exist is a 200 carrying the token advisory AND
     `found: 0`. The first version of this read any error as a refusal, and
     would have told a reader OneMap "could not be reached" for every address
     it had in fact searched and not found. `found` present means the search
     ran. An error with no count at all is the refusal — which is what the day
     OneMap starts enforcing a token will look like. */
  if (Number.isFinite(j?.found)) return remember(key, { status: 'none' });
  return { status: 'unavailable', reason: j?.error ? 'refused' : 'unreadable answer' };
}

/** For tests: the cache is module state. */
export const _clearOnemapCache = () => cache.clear();
