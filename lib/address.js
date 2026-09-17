/**
 * From an address OneMap confirmed to the record this site holds for it.
 *
 * Three ways in, tried in this order for each address:
 *
 *   BUILDING  a private development, by its registered name, when exactly one
 *             record carries that name. OneMap's BUILDING for a landed house
 *             is often an estate name ("CASHEW VILLAS"); that only matches a
 *             record if a development of that name was actually filed.
 *   BLOCK     an HDB block, by block number AND road. A bare block number
 *             repeats across the island; block plus road does not.
 *   STREET    a landed street page, by road. URA files a landed sale's street
 *             and never its house number, so the street IS the finest record
 *             there is — and the page says so.
 *
 * An address none of those reach is returned with `href: null`. That is a
 * finding, not a failure: SLA knows the address and no filed sale in the data
 * this site holds is there. The search box says exactly that, rather than
 * "nothing matching", which would read as "this address does not exist".
 *
 * ── THE SAME ROAD, WRITTEN TWO WAYS ────────────────────────────────────────
 * HDB abbreviates (ANG MO KIO AVE 3), OneMap does not (ANG MO KIO AVENUE 3).
 * Both sides are expanded before comparing — the list is the one
 * scripts/lib/onemap.mjs settled on over a 13,000-block geocoding run — except
 * ST, which HDB uses for both Street and Saint. STREET is collapsed to ST
 * instead, so BISHAN STREET 11 meets BISHAN ST 11 and ST. GEORGE'S LANE stays
 * itself.
 */

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const ROAD_WORDS = {
  AVE: 'AVENUE', RD: 'ROAD', DR: 'DRIVE', CRES: 'CRESCENT', CTRL: 'CENTRAL',
  LOR: 'LORONG', JLN: 'JALAN', BT: 'BUKIT', TG: 'TANJONG', KG: 'KAMPONG',
  NTH: 'NORTH', STH: 'SOUTH', UPP: 'UPPER', TER: 'TERRACE', PL: 'PLACE',
  CL: 'CLOSE', LK: 'LINK', WK: 'WALK', GDNS: 'GARDENS', HTS: 'HEIGHTS',
  PK: 'PARK', MKT: 'MARKET', IND: 'INDUSTRIAL', EST: 'ESTATE', CTR: 'CENTRE',
  CTRE: 'CENTRE', SQ: 'SQUARE', BLVD: 'BOULEVARD', HWY: 'HIGHWAY', CWEALTH: 'COMMONWEALTH',
  STREET: 'ST',
};
export const roadKey = s => norm(s).replace(/\bC WEALTH\b/g, 'COMMONWEALTH')
  .split(' ').map(w => ROAD_WORDS[w] || w).join(' ');

/* Built once per search index. The index object is replaced when data/
   is reloaded, so identity is the right cache key. */
let built = null;
function indexOf(entries) {
  if (built?.entries === entries) return built;
  const block = new Map(), name = new Map(), street = new Map();
  for (const e of entries) {
    if (e.h.startsWith('/hdb/')) {
      const m = /^Blk (\S+) (.+)$/.exec(e.n);
      if (m) block.set(`${norm(m[1])}|${roadKey(m[2])}`, e);
    } else if (e.h.startsWith('/landed/')) {
      const m = /^Landed · (.+)$/.exec(e.n);
      if (m) street.set(roadKey(m[1]), e);
    } else if (e.h.startsWith('/condo/')) {
      const k = norm(e.n);
      name.set(k, name.has(k) ? null : e);   // a name held by two records matches neither
    }
  }
  built = { entries, block, name, street };
  return built;
}

/**
 * Whether a query is worth a lookup at all. A reader part-way through a word
 * is not asking OneMap anything, and every lookup spends a request against a
 * limit measured in single digits a second. A bare number must be a full
 * six-digit postal code — "5601" is a block, a postal fragment or nothing.
 * Here and not in lib/onemap.js so the search box can ask it without bundling
 * the fetcher into the browser.
 */
export function worthLooking(q) {
  const n = norm(q);
  if (/^\d+$/.test(n)) return n.length === 6;
  return n.length >= 5 && /[A-Z]{3,}/.test(n);
}

const title = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
export const addressLine = r => [
  [r.blk, title(r.road)].filter(Boolean).join(' '),
  r.building ? title(r.building) : null,
  r.postal ? `Singapore ${r.postal}` : null,
].filter(Boolean).join(', ');

/**
 * @param results  lookupAddress(...).results
 * @param entries  the search index's entries
 * @param kind     'HDB' | 'PRIVATE' | null, as /api/search takes it
 * @returns {{ hits: object[], addresses: {address:string, href:string|null, via:string|null}[] }}
 */
export function resolveAddresses(results, entries, { kind = null } = {}) {
  const ix = indexOf(entries);
  const hits = [], seen = new Set(), addresses = [];
  for (const r of results || []) {
    let e = null, via = null;
    if (!e && r.building && kind !== 'HDB') { e = ix.name.get(norm(r.building)) || null; via = e && 'building'; }
    if (!e && r.blk && r.road && kind !== 'PRIVATE') { e = ix.block.get(`${norm(r.blk)}|${roadKey(r.road)}`) || null; via = e && 'block'; }
    if (!e && r.road && kind !== 'HDB') { e = ix.street.get(roadKey(r.road)) || null; via = e && 'street'; }
    const address = addressLine(r);
    if (addresses.some(a => a.address === address)) continue;
    addresses.push({ address, href: e?.h || null, via: via || null });
    if (e && !seen.has(e.h)) { seen.add(e.h); hits.push({ entry: e, address, via }); }
  }
  return { hits, addresses };
}

/**
 * Three different empties, which used to be one sentence.
 *
 * "Nothing matching that" read as "that address does not exist" even when SLA
 * knows it perfectly well and the truth is that no filed sale is there — which
 * is most private houses on most streets in any three-year window. Here rather
 * than in Search.jsx so a test can call it: Node cannot import JSX.
 */
export function emptyLine(resolved) {
  const known = resolved?.status === 'ok' ? (resolved.addresses || []).filter(a => !a.href) : [];
  if (known.length) {
    const list = known.slice(0, 2).map(a => a.address).join('; ');
    return `OneMap (Singapore Land Authority) knows ${list}, but no sale there is in the filed transactions this site holds.`;
  }
  if (resolved?.status === 'none') {
    return 'Nothing in the filed transactions matches that, and OneMap (Singapore Land Authority) does not recognise it as an address either. Check the spelling, or try the street on its own.';
  }
  if (resolved?.status === 'unavailable') {
    return 'Nothing in the filed transactions matches that, and OneMap (Singapore Land Authority) could not be reached to check the address. Try the street on its own.';
  }
  return 'Nothing matching that. Try the block number on its own, or the street.';
}
