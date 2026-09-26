/**
 * Primary schools, joined to the homes around them.
 *
 * Everything here runs at BUILD time. /schools ships the 179 schools and
 * nothing else; each school's page ships the homes within 2 km of that school
 * and nothing else. Passing a dataset to the client because one field of it
 * is wanted is the failure CLAUDE.md records for /mop and /market.
 *
 * ── DISTANCE ───────────────────────────────────────────────────────────────
 * Straight-line, from the school's registered coordinate to a home's, and
 * labelled so wherever it is shown. MOE measures from the school's land
 * boundary to the address on the registration, and OneMap's SchoolQuery is
 * the only place that answers the question for a real address. A home at
 * 0.98 km here can be outside the band for MOE, and the page says so.
 *
 * ── SIZES, NOT BEDROOMS ────────────────────────────────────────────────────
 * URA's sale records carry a floor area and no bedroom count, so private
 * homes are filtered by size. HDB's carry the flat type, so HDB is filtered
 * by that. Both come from the full sale files, not from a record's last
 * twenty sales.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PHASES, reachOf, ratioOf, moeKey, nameKey, schoolSlug, metres } from './p1.js';
import { recordByHref } from './data/query.js';
import { privateKey } from './private-key.js';

const dataPath = f => path.join(process.cwd(), 'data', f);
const load = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(dataPath(f), 'utf8')); } catch { return fallback; }
};

/** map.json's first field. */
const KIND = ['hdb', 'condo', 'landed'];

/** Private size bands, in square metres, with the square feet a listing uses. */
export const SIZE_BANDS = [
  { key: 's', label: 'Under 60 m²', sqft: 'under 646 sq ft', lo: 0, hi: 60 },
  { key: 'm', label: '60–90 m²', sqft: '646–969 sq ft', lo: 60, hi: 90 },
  { key: 'l', label: '90–120 m²', sqft: '969–1,292 sq ft', lo: 90, hi: 120 },
  { key: 'xl', label: '120 m² and over', sqft: '1,292 sq ft and over', lo: 120, hi: Infinity },
];

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** "99 yrs lease commencing from 2016" → "99-year lease from 2016". */
export function tenureShort(t) {
  const s = String(t || '');
  if (/freehold/i.test(s)) return 'Freehold';
  const m = /(\d+)\s*yrs?.*?(\d{4})/i.exec(s);
  return m ? `${m[1]}-year lease from ${m[2]}` : (s || null);
}

let _schools;
/** Every primary school MOE lists, with its latest exercise read, or null without data. */
export function primarySchools() {
  if (_schools !== undefined) return _schools;
  const p1 = load('p1.json', null);
  const am = load('amenities.json', null);
  const map = load('map.json', null);
  if (!p1?.years || !am?.layers?.schools) return (_schools = null);
  const pts = am.layers.schools.points.filter(s => /PRIMARY|P1/.test(s.level));
  const byKey = new Map(pts.map(s => [nameKey(s.name), s]));
  const years = Object.keys(p1.years).sort();
  const year = years.at(-1);
  const homes = map?.points || [];

  const list = [];
  for (const [moeName, sc] of Object.entries(p1.years[year])) {
    const at = byKey.get(moeKey(moeName));
    if (!at) continue;                      // test/p1.test.js fails if any does not resolve
    const phases = {};
    for (const ph of PHASES) {
      const r = sc.phases[ph.code];
      if (!r) continue;
      const reach = reachOf(r);
      phases[ph.code] = {
        vacancies: r.vacancies, applicants: r.applicants, ballot: r.ballot,
        vacanciesBalloted: r.vacanciesBalloted, applicantsBalloted: r.applicantsBalloted,
        copy: r.copy, remarks: r.remarks, ratio: ratioOf(r),
        reach: { step: reach.step, key: reach.key, short: reach.short, pr: reach.pr },
      };
    }
    const near = { hdb1: 0, private1: 0, hdb2: 0, private2: 0 };
    for (const p of homes) {
      const m = metres(at.lat, at.lon, p[1], p[2]);
      if (m > 2000) continue;
      const k = p[0] === 0 ? 'hdb' : 'private';
      near[`${k}${m <= 1000 ? 1 : 2}`]++;
    }
    list.push({
      slug: schoolSlug(moeName), name: moeName, moeSlug: sc.moeSlug || null,
      lat: at.lat, lon: at.lon, url: at.url || null, twoTrack: Boolean(at.p1TwoTrack),
      year, available: sc.phases['1']?.vacancies ?? null, phases, near,
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return (_schools = {
    year, years, list,
    source: p1.source, url: p1.url, accessedAt: p1.accessedAt,
    locations: am.layers.schools.attribution, locationsAccessed: am.layers.schools.accessedAt,
  });
}

export function schoolBySlug(slug) {
  return primarySchools()?.list.find(s => s.slug === slug) || null;
}

let _bands;
/** Private sales grouped by record id and size band — the whole file, once per build worker. */
function privateBands() {
  if (_bands) return _bands;
  const priv = load('private.json', { rows: [] });
  const acc = new Map();
  for (const r of priv.rows) {
    const band = SIZE_BANDS.find(b => r.areaSqm >= b.lo && r.areaSqm < b.hi);
    if (!band || !(r.price > 0)) continue;
    const id = `P:${privateKey(r)}`;
    const byBand = acc.get(id) || {};
    (byBand[band.key] ||= { psf: [], price: [] });
    byBand[band.key].psf.push(r.psf);
    byBand[band.key].price.push(r.price);
    acc.set(id, byBand);
  }
  _bands = new Map();
  for (const [id, byBand] of acc) {
    const out = {};
    for (const [k, v] of Object.entries(byBand)) {
      out[k] = { n: v.price.length, medianPsf: Math.round(median(v.psf)), minPrice: Math.min(...v.price), maxPrice: Math.max(...v.price) };
    }
    _bands.set(id, out);
  }
  return _bands;
}

/**
 * Every home with a filed sale within 2 km of the school, nearest first, with
 * what a reader can filter it by. Only what the table shows is kept.
 */
export function homesNear(school, within = 2000) {
  const map = load('map.json', null);
  if (!map?.points || !school) return [];
  const bands = privateBands();
  const out = [];
  for (const p of map.points) {
    const m = metres(school.lat, school.lon, p[1], p[2]);
    if (m > within) continue;
    const rec = recordByHref(p[4]);
    if (!rec) continue;
    const kind = KIND[p[0]];
    const base = {
      kind, href: rec.href, label: rec.label, m: Math.round(m), lat: p[1], lon: p[2],
      n: rec.n, medianPsf: rec.medianPsf, minPrice: rec.minPrice, maxPrice: rec.maxPrice,
    };
    if (kind === 'hdb') {
      base.lease = rec.leaseCommence ? `Lease from ${rec.leaseCommence}` : null;
      base.types = Object.fromEntries(Object.entries(rec.byType || {}).map(([t, v]) =>
        [t, { n: v.n, medianPsf: v.medianPsf, minPrice: v.minPrice, maxPrice: v.maxPrice }]));
    } else {
      base.tenure = tenureShort(rec.tenure);
      base.types = bands.get(rec.id) || {};
    }
    out.push(base);
  }
  return out.sort((a, b) => a.m - b.m);
}

/** The HDB flat types present, in HDB's own order. */
export const HDB_TYPES = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];

/** The land within a window, for a map that draws only what is around the school. */
export function landAround(lat, lon, km = 2.3) {
  const map = load('map.json', null);
  /* Wider than tall, so the 2 km circle fits the height and the map is a
     band across the page rather than a square the height of a screen. */
  const dLat = km / 111.32, dLon = (km * 1.7) / (111.32 * Math.cos(lat * Math.PI / 180));
  const box = [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
  const rings = [];
  for (const a of map?.land?.areas || []) {
    for (const poly of a[3] || []) {
      for (const ring of (Array.isArray(poly[0]?.[0]) ? poly : [poly])) {
        if (ring.some(([x, y]) => y >= box[0] && y <= box[2] && x >= box[1] && x <= box[3])) rings.push(ring);
      }
    }
  }
  return { box, rings };
}

/** The whole island's land, for the index map. 82 KB of rings, simplified at build. */
export function islandLand() {
  const map = load('map.json', null);
  const rings = [];
  for (const a of map?.land?.areas || []) {
    for (const poly of a[3] || []) for (const ring of (Array.isArray(poly[0]?.[0]) ? poly : [poly])) rings.push(ring);
  }
  return { bbox: map?.bbox || null, rings };
}

/**
 * A record's nearby-schools lists, with each primary school's latest Phase 2C
 * reading and its page attached — the "from a home" direction. Resolved on
 * the server so a block page ships three short strings per school, not the
 * school list. Unmatched names pass through untouched.
 */
export function withP1(near) {
  const data = primarySchools();
  if (!near?.primary || !data) return near;
  const byName = new Map(data.list.map(s => [moeKey(s.name), s]));
  const tag = list => (list || []).map(it => {
    const s = byName.get(nameKey(it.name));
    const c = s?.phases['2C'];
    return s ? { ...it, p1: { slug: s.slug, year: s.year, step: c?.reach?.step ?? null, short: c?.reach?.short || null } } : it;
  });
  return { ...near, primary: { ...near.primary, within1: tag(near.primary.within1), within2: tag(near.primary.within2) } };
}
