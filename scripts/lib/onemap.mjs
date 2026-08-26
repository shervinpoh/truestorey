/**
 * OneMap geocoding, with a cache that makes the whole thing resumable.
 *
 * OneMap's search endpoint is public and needs no key or token. It is also
 * the authoritative Singapore address index — SLA's own — which matters here
 * because we are geocoding HDB blocks by block-and-street, a form no general
 * geocoder handles well.
 *
 * THE CACHE IS THE POINT. 13,000 lookups is roughly three quarters of an hour
 * of polite requests. If that dies at lookup 9,000 — laptop sleeps, wifi
 * drops, someone hits Ctrl+C — nobody should have to start again. Every
 * answer, including a definite "no match", is written to data/geocache.json
 * as it arrives, so a re-run picks up exactly where it stopped and costs
 * nothing for work already done. The cache is also shared with the amenity
 * ingest, which geocodes schools and preschools by postal code through the
 * same client.
 *
 * On confidence: a wrong coordinate is worse than a missing one. A block
 * placed on the wrong street would put a school in the wrong band and quietly
 * publish a false answer to the one question this feature exists to answer.
 * So every result carries how it was matched, and the join drops anything
 * below `good` rather than showing it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://www.onemap.gov.sg/api/common/elastic/search';
const CACHE = path.join(process.cwd(), 'data', 'geocache.json');

/* --------------------------------------------------------------- cache */

let cache = null;
let dirty = 0;

export async function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(await fs.readFile(CACHE, 'utf8')); }
  catch { cache = {}; }
  await loadPace();
  return cache;
}

/* The geocoder runs three lanes at once and any of them can decide to flush.
   Two overlapping write-then-rename cycles on the same temp path will corrupt
   the cache — which, an hour into a run, is the most expensive thing that
   could go wrong here. Serialise them onto one chain. */
let saving = Promise.resolve();

export function saveCache({ force = false } = {}) {
  saving = saving.then(async () => {
    if (!cache || (!dirty && !force)) return;
    await fs.mkdir(path.dirname(CACHE), { recursive: true });
    // Write-then-rename, so a Ctrl+C mid-write cannot leave a truncated cache
    // behind and cost the entire run.
    const tmp = CACHE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(cache));
    await fs.rename(tmp, CACHE);
    dirty = 0;
    await savePace();
  }).catch(e => { console.error(`  cache write failed: ${e.message}`); });
  return saving;
}

export const cacheSize = () => Object.keys(cache || {}).length;

/* ---------------------------------------------------------------- fetch */

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * HDB and OneMap write the same street differently. HDB's own dataset says
 * "ANG MO KIO AVE 10"; OneMap says "ANG MO KIO AVENUE 10". Compared raw, the
 * road test never fires, every block grades `good` instead of `exact`, and
 * the grade stops meaning anything — a correct block number on the WRONG road
 * would score identically to a correct one. Expanding both sides first is
 * what makes the check real.
 *
 * Deliberately absent: "ST" → "STREET". HDB uses it both ways ("BISHAN ST 11"
 * but also "ST. GEORGE'S RD"), and guessing wrong would manufacture a false
 * exact match, which is worse than the honest `good` those few roads get now.
 */
const ROAD_WORDS = {
  AVE: 'AVENUE', RD: 'ROAD', DR: 'DRIVE', CRES: 'CRESCENT', CTRL: 'CENTRAL',
  LOR: 'LORONG', JLN: 'JALAN', BT: 'BUKIT', TG: 'TANJONG', KG: 'KAMPONG',
  NTH: 'NORTH', STH: 'SOUTH', UPP: 'UPPER', TER: 'TERRACE', PL: 'PLACE',
  CL: 'CLOSE', LK: 'LINK', WK: 'WALK', GDNS: 'GARDENS', HTS: 'HEIGHTS',
  PK: 'PARK', MKT: 'MARKET', IND: 'INDUSTRIAL', EST: 'ESTATE', CTR: 'CENTRE',
  CTRE: 'CENTRE', SQ: 'SQUARE', BLVD: 'BOULEVARD', HWY: 'HIGHWAY',
  CWEALTH: 'COMMONWEALTH', 'C WEALTH': 'COMMONWEALTH',
};
const normRoad = s => norm(s).split(' ').map(w => ROAD_WORDS[w] || w).join(' ');

/* ------------------------------------------------------- the rate limiter */
/**
 * ONE GLOBAL PACE, SHARED BY EVERY LANE.
 *
 * The first version of this had a per-request backoff and nothing else, which
 * is not a rate limit at all: three lanes each politely backing off still
 * meant three lanes hammering, and OneMap started returning 429 after about
 * a hundred lookups. Backing off after being told off is too late — the point
 * is not to get there.
 *
 * OneMap publishes a limit around 250 calls a minute, so the floor below is
 * ~240/min and every request in the process passes through one gate. On a 429
 * the gate pauses EVERYTHING, then widens the gap permanently-ish and lets it
 * creep back down only if requests keep succeeding. Sustained 429s stop the
 * run rather than grinding through 13,000 failures.
 */
/**
 * OneMap publishes a limit near 250 calls a minute. Measured against the real
 * thing on 22 Aug 2026 over a full 13,243-record run, anonymous callers get
 * nothing like that: the pace settled around 1,500ms — roughly 50/min — and
 * every attempt to creep back was met with another 429.
 *
 * So the gap is PERSISTED. Starting each run at 250ms means spending the first
 * few minutes being told off before rediscovering the same answer, which is
 * both slower and worse manners. The next run starts where the last one
 * settled, and can still creep down if OneMap is feeling generous.
 */
const MIN_GAP = 250;
const MAX_GAP = 2500;
const PACE = path.join(process.cwd(), 'data', '.onemap-pace.json');
let gap = MIN_GAP;
let nextAt = 0;
let pausedUntil = 0;
let streak429 = 0;
let served = 0;
let announced = false;

export async function loadPace() {
  try {
    const j = JSON.parse(await fs.readFile(PACE, 'utf8'));
    if (Number.isFinite(j?.gap)) gap = Math.min(Math.max(j.gap, MIN_GAP), MAX_GAP);
  } catch { /* first run */ }
  return gap;
}

export async function savePace() {
  try {
    await fs.mkdir(path.dirname(PACE), { recursive: true });
    await fs.writeFile(PACE, JSON.stringify({ gap: Math.round(gap), learnedAt: new Date().toISOString().slice(0, 10) }));
  } catch { /* never worth failing a run over */ }
}

/** Set by the caller so a sustained block stops the run instead of grinding. */
export class RateLimited extends Error {}

async function gate() {
  for (;;) {
    const now = Date.now();
    const wait = Math.max(pausedUntil - now, nextAt - now, 0);
    if (wait <= 0) break;
    await sleep(Math.min(wait, 2000));
  }
  nextAt = Date.now() + gap;
}

function on429(retryAfterSec) {
  streak429++;
  const pause = retryAfterSec ? retryAfterSec * 1000 : Math.min(10000 * streak429, 60000);
  pausedUntil = Math.max(pausedUntil, Date.now() + pause);
  gap = Math.min(Math.round(gap * 1.35), MAX_GAP);
  if (!announced) {
    announced = true;
    console.log(`\n  OneMap is throttling — pausing ${Math.round(pause / 1000)}s and easing off to ${gap}ms between requests.`);
    console.log('  This is normal and self-correcting; the pace is remembered for next time.');
  }
}

function onOk() {
  streak429 = 0;
  served++;
  // Creep back toward full speed, but only after a clean run of requests.
  if (served % 60 === 0 && gap > MIN_GAP) gap = Math.max(MIN_GAP, Math.round(gap * 0.94));
}

/** Requests per minute we are currently sustaining — used for the ETA. */
export const currentRate = () => 60000 / gap;

/**
 * One raw search, through the gate. Retries transport errors and 5xx; a 429
 * pauses every lane rather than just this one.
 */
async function rawSearch(q, { attempt = 0 } = {}) {
  const url = `${BASE}?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  await gate();
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'truestorey/0.1 (+personal research)' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after')) || null;
      on429(ra);
      if (streak429 > 10) {
        throw new RateLimited('OneMap has been throttling for a while. Stopping so the run does not burn through every remaining record as a failure. Everything geocoded so far is saved — re-run in ten minutes or so and it will carry on.');
      }
      if (attempt < 6) return rawSearch(q, { attempt: attempt + 1 });
      return { results: [], error: 'HTTP 429' };
    }
    if (res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retry: true });
    if (!res.ok) { onOk(); return { results: [], error: `HTTP ${res.status}` }; }
    const j = await res.json();
    onOk();
    return { results: Array.isArray(j?.results) ? j.results : [] };
  } catch (e) {
    if (e instanceof RateLimited) throw e;
    if ((e.retry || e.name === 'TimeoutError' || /fetch failed|ECONN|ENOTFOUND/i.test(e.message)) && attempt < 4) {
      await sleep(1500 * Math.pow(2, attempt));
      return rawSearch(q, { attempt: attempt + 1 });
    }
    return { results: [], error: e.message };
  }
}

/**
 * Cache-only mode. `--regrade` re-scores work already done after a change to
 * the matching rules; it must never reach for the network, or a regrade on a
 * half-finished run turns into a fresh 13,000-record fetch.
 */
let cacheOnly = false;
export const setCacheOnly = v => { cacheOnly = v; };

/** Cached search. Returns the raw OneMap result list. */
/* Same key asked for by two lanes at once: share the one request rather than
   paying for it twice. */
const inflight = new Map();

export async function search(q) {
  await loadCache();
  const key = norm(q);
  if (key in cache) return cache[key];
  if (cacheOnly) return { results: [], error: 'not cached', uncached: true };
  if (inflight.has(key)) return inflight.get(key);
  const p = doSearch(q, key).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function doSearch(q, key) {
  const { results, error } = await rawSearch(q);   // RateLimited throws through
  // A transport error is NOT cached — caching it would bake a wifi blip into
  // the dataset permanently. Only a real answer, including a real empty one.
  if (error) return { results: [], error, uncached: true };
  const slim = results.slice(0, 6).map(r => ({
    name: r.SEARCHVAL, blk: r.BLK_NO, road: r.ROAD_NAME, building: r.BUILDING,
    address: r.ADDRESS, postal: r.POSTAL,
    lat: Number(r.LATITUDE), lon: Number(r.LONGITUDE),
  })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  cache[key] = { results: slim };
  dirty++;
  if (dirty >= 100) await saveCache();
  return cache[key];
}

/* ----------------------------------------------------------- resolvers */

/**
 * An HDB block. Matched on block number first, then street — a bare block
 * number is ambiguous across the island, but block plus street is not.
 */
export async function geocodeBlock(block, street) {
  const { results, error, uncached } = await search(`${block} ${street}`);
  if (error) return { error, uncached };
  const b = norm(block), s = normRoad(street);
  const exact = results.find(r => norm(r.blk) === b && normRoad(r.road) === s);
  if (exact) return hit(exact, 'exact');
  const sameBlock = results.find(r => norm(r.blk) === b);
  if (sameBlock) return hit(sameBlock, 'good');
  const sameRoad = results.find(r => normRoad(r.road) === s);
  if (sameRoad) return hit(sameRoad, 'weak');
  return results[0] ? hit(results[0], 'weak') : { match: 'none' };
}

/**
 * A private project, by name. Building names in OneMap are the registered
 * names, so an exact hit is common — but names like "The Gardens" repeat, so
 * anything that is not a clean building match is marked weak and dropped.
 */
export async function geocodeProject(name, street = null) {
  const n = norm(name);
  const pass = async q => {
    const { results, error, uncached } = await search(q);
    if (error) return { error, uncached };
    const exact = results.find(r => norm(r.building) === n);
    if (exact) return hit(exact, 'exact');
    // A name match that also sits on the right street is as good as exact —
    // this is what disambiguates the dozens of projects sharing a name.
    if (street) {
      const onStreet = results.find(r => normRoad(r.road) === normRoad(street)
        && (norm(r.building).includes(n) || n.includes(norm(r.building)) || norm(r.name).includes(n)));
      if (onStreet) return hit(onStreet, 'exact');
    }
    const contains = results.find(r => norm(r.building) !== 'NIL'
      && (norm(r.building).includes(n) || n.includes(norm(r.building))));
    if (contains) return hit(contains, 'good');
    const inSearchval = results.find(r => norm(r.name).includes(n));
    if (inSearchval) return hit(inSearchval, 'weak');
    return results[0] ? hit(results[0], 'weak') : { match: 'none' };
  };

  let r = await pass(name);
  if (r.error) return r;
  // Project names alone repeat across the island. If the bare name did not
  // land cleanly, ask again with the street, which URA gives us for free.
  if (street && !USABLE.has(r.match)) {
    const withStreet = await pass(`${name} ${street}`);
    if (!withStreet.error && USABLE.has(withStreet.match)) return withStreet;
  }
  return r;
}

/**
 * A landed street. The record covers the whole street, so the honest answer
 * is the middle of the addresses OneMap knows on it, marked as a street
 * centroid — never as a house.
 */
export async function geocodeStreet(street) {
  const { results, error, uncached } = await search(street);
  if (error) return { error, uncached };
  const s = normRoad(street);
  const on = results.filter(r => normRoad(r.road) === s);
  const use = on.length ? on : results;
  if (!use.length) return { match: 'none' };
  const lat = use.reduce((a, r) => a + r.lat, 0) / use.length;
  const lon = use.reduce((a, r) => a + r.lon, 0) / use.length;
  return { lat: round6(lat), lon: round6(lon), match: on.length ? 'street' : 'weak',
    matched: `${use.length} addresses on ${street}`, postal: null };
}

/** A postal code — used for schools and preschools, which publish one. */
export async function geocodePostal(postal, fallbackName) {
  const p = String(postal || '').replace(/\D/g, '').padStart(6, '0');
  if (p.length === 6 && p !== '000000') {
    const { results, error, uncached } = await search(p);
    if (error) return { error, uncached };
    const exact = results.find(r => String(r.postal) === p);
    if (exact) return hit(exact, 'exact');
    if (results[0]) return hit(results[0], 'good');
  }
  if (!fallbackName) return { match: 'none' };
  const { results, error } = await search(fallbackName);
  if (error) return { error };
  return results[0] ? hit(results[0], 'weak') : { match: 'none' };
}

const round6 = n => Math.round(n * 1e6) / 1e6;
const hit = (r, match) => ({
  lat: round6(r.lat), lon: round6(r.lon), match,
  matched: r.address || r.name || null,
  postal: r.postal && r.postal !== 'NIL' ? r.postal : null,
});

/** Coordinates we are willing to publish against. */
export const USABLE = new Set(['exact', 'good', 'street']);

export const ATTRIBUTION =
  'Coordinates from OneMap, © Singapore Land Authority. Distances are straight-line.';
