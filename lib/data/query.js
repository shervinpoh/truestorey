import fs from 'node:fs';
import path from 'node:path';
import { shardOf } from '../slug.js';

const dataPath = f => path.join(process.cwd(), 'data', f);

function load(file, fallback) {
  const p = dataPath(file);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

let _index = null, _search = null;

export function getIndex() {
  if (!_index) _index = load('index.json', { missing: true, attribution: [] });
  return _index;
}
/** ~1MB. Loaded on first search, not on page load. */
function getSearch() {
  if (!_search) _search = load('search.json', { entries: [] });
  return _search;
}
/** One shard, ~220KB median. Cached per shard, so a town is parsed at most once. */
const _shards = new Map();
function getShard(name) {
  if (!_shards.has(name)) {
    const p = path.join(process.cwd(), 'data', 'records', name + '.json');
    _shards.set(name, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
  }
  return _shards.get(name);
}

let _towns = null, _urls = null;
function getTowns() { if (!_towns) _towns = load('towns.json', {}); return _towns; }

export function catalogue() {
  const i = getIndex();
  if (i.missing) return { missing: true, hdbTowns: [], flatTypes: [], districts: [], propertyTypes: [], attribution: [] };
  const hdbTowns = Object.keys(i.hdb?.towns || {}).sort();
  const flatTypes = [...new Set(hdbTowns.flatMap(t => Object.keys(i.hdb.towns[t].byType || {})))]
    .filter(f => /^(2|3|4|5) ROOM$|EXECUTIVE/.test(f)).sort();
  const districts = Object.keys(i.private?.districts || {}).sort();
  const propertyTypes = [...new Set(districts.flatMap(d => Object.keys(i.private.districts[d].byType || {})))].sort();
  const heat = {};
  for (const t of hdbTowns) heat[t] = i.hdb.towns[t].medianPsf;
  const dheat = {};
  for (const d of districts) dheat[d] = i.private.districts[d].medianPsf;
  return { hdbTowns, flatTypes, districts, propertyTypes, heat, dheat,
    attribution: i.attribution || [], builtAt: i.builtAt,
    hdbPeriod: i.hdb?.period || null, privatePeriod: i.private?.period || null,
    hdbSource: i.hdb?.source || null, privateSource: i.private?.source || null,
    hasHdb: hdbTowns.length > 0, hasPrivate: districts.length > 0 };
}

/* ---------------------------------------------------------------- search */

const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Ranked prefix/substring search over blocks and projects.
 * Word-start matches beat mid-word ones; among equals, more transactions wins,
 * because a bare "the" should surface projects people actually mean.
 */
export function search(q, { kind = null, limit = 12 } = {}) {
  const needle = norm(q);
  if (needle.length < 2) return [];
  const want = kind === 'HDB' ? 'H' : kind === 'PRIVATE' ? 'P' : null;
  const out = [];
  for (const e of getSearch().entries) {
    if (want && e.t !== want) continue;
    const hay = norm(e.n), sub = norm(e.s);
    let score;
    if (hay.startsWith(needle)) score = 0;
    else if (hay.includes(' ' + needle)) score = 1;
    else if (hay.includes(needle)) score = 2;
    else if (sub.startsWith(needle)) score = 3;
    else continue;
    out.push({ e, score });
    if (out.length > 4000) break;
  }
  out.sort((a, b) => a.score - b.score || b.e.c - a.e.c);
  return out.slice(0, limit).map(({ e }) => ({
    id: e.id, kind: e.t === 'H' ? 'HDB' : 'PRIVATE', label: e.n, sub: e.s, n: e.c, href: e.h,
  }));
}

/* ------------------------------------------------------- record resolution */

/**
 * Resolve a record straight from its URL parts. No lookup table: the shard is
 * derivable from the URL, so this reads exactly one file.
 *   /hdb/ang-mo-kio/100-ang-mo-kio-ave-1  ->  recordAt('hdb', 'ang-mo-kio', '100-...')
 *   /condo/the-sail-marina-bay            ->  recordAt('condo', 'the-sail-marina-bay')
 */
export function recordAt(ns, a, b) {
  if (ns === 'hdb') return getShard(`hdb/${a}`)[b] || null;
  if (ns === 'condo' || ns === 'landed') return getShard(shardOf[ns](a))[a] || null;
  return null;
}

/** Resolve by href, for the API and for anything holding a link. */
export function recordByHref(href) {
  const p = String(href || '').split('/').filter(Boolean);
  if (p[0] === 'hdb' && p.length === 3) return recordAt('hdb', p[1], p[2]);
  if ((p[0] === 'condo' || p[0] === 'landed') && p.length === 2) return recordAt(p[0], p[1]);
  return null;
}

/** One town, with every block in it — the index page that makes blocks crawlable. */
export function town(townSlug) { return getTowns()[townSlug] || null; }
export function allTowns() {
  return Object.values(getTowns())
    .map(({ blocks, byType, ...rest }) => ({ ...rest, blockCount: blocks.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

let _projects = null;
/** Light list for the index pages: every condo, or every landed street. */
export function projects(ns) {
  if (!_projects) _projects = load('projects.json', { condo: [], landed: [] });
  return _projects[ns] || [];
}

let _hdbIndex, _sora, _mop;

/**
 * Market series. Each returns null when its ingest has not been run, so a page
 * can render what it has instead of failing — but never a stale placeholder.
 */
export function hdbIndex() {
  if (_hdbIndex === undefined) _hdbIndex = load('hdb-index.json', null);
  return _hdbIndex;
}
export function sora() {
  if (_sora === undefined) _sora = load('sora.json', null);
  return _sora;
}
export function mop() {
  if (_mop === undefined) _mop = load('mop.json', null);
  return _mop;
}
/** One town's MOP detail, or null. Town keys are the HDB town NAME, not the slug. */
export function mopTown(townSlug) {
  const m = mop(); if (!m) return null;
  const slugify = n => String(n).toUpperCase().replace(/&/g,' AND ').replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
  return Object.values(m.towns).find(t => slugify(t.town) === townSlug) || null;
}

/** Every public URL, busiest first. Used by the sitemap and by prerendering. */
export function allUrls() {
  if (!_urls) _urls = load('urls.json', { urls: [] });
  return _urls;
}

/* ------------------------------------------------- legacy area aggregates */
/* Kept for the heat grid only. Never presented as an answer about a home —
   see README hard rule 2. */

export function hdbLookup(town, flatType) {
  const i = getIndex(); if (i.missing) return null;
  const t = i.hdb?.towns?.[town]?.byType?.[flatType];
  if (!t) return null;
  return {
    kind: 'HDB', scope: 'TOWN', label: `${flatType} · ${town}`,
    medianPrice: t.medianPrice, medianPsf: t.medianPsf, n: t.n,
    minPsf: t.minPsf, maxPsf: t.maxPsf,
    series: (t.series || []).slice(-12), yoy: t.yoy ?? null, recent: [],
    source: i.hdb.source, accessedAt: i.hdb.accessedAt, period: i.hdb.period,
  };
}

export function privateLookup(district, propertyType) {
  const i = getIndex(); if (i.missing) return null;
  const d = i.private?.districts?.[district]; if (!d) return null;
  const s = propertyType && d.byType?.[propertyType] ? d.byType[propertyType] : d;
  return {
    kind: 'PRIVATE', scope: 'DISTRICT', label: `${propertyType || 'All types'} · District ${district}`,
    medianPrice: s.medianPrice, medianPsf: s.medianPsf, n: s.n,
    minPsf: s.minPsf, maxPsf: s.maxPsf,
    series: [], yoy: null, recent: [],
    source: i.private.source, accessedAt: i.private.accessedAt, period: i.private.period,
  };
}

/* ------------------------------------------------------------- amenities */
/* Mirrors the record shards exactly, so a page reads one ~40KB file rather
   than the island. A record with no usable coordinate has no entry here at
   all — see scripts/build-nearby.mjs for why that is the right outcome. */

const _near = new Map();
function getNearShard(name) {
  if (!_near.has(name)) {
    const p = path.join(process.cwd(), 'data', 'near', name + '.json');
    _near.set(name, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
  }
  return _near.get(name);
}

let _nearManifest;
/** Null until the amenity pipeline has been run. Pages must handle null. */
export function nearbyManifest() {
  if (_nearManifest === undefined) _nearManifest = load('near/manifest.json', null);
  return _nearManifest;
}

/** What is around one record, or null. `rec.shard` is the same key as the record store. */
export function nearby(rec) {
  if (!rec?.shard || !rec?.slug) return null;
  return getNearShard(rec.shard)[rec.slug] || null;
}

/** The policy and data archive. Null until `npm run ingest:archive` has run. */
let _archive;
export function archive() {
  if (_archive === undefined) _archive = load('archive.json', null);
  return _archive;
}

/* ── Tower View ─────────────────────────────────────────────────────────────
 * Null until `npm run build:storey` has run. Every consumer must handle null:
 * a floor premium is a derived figure and the site would rather show nothing
 * than show a stale one. */
let _storey;
export function storey() {
  if (_storey === undefined) _storey = load('storey.json', null);
  return _storey;
}

/**
 * The floor premium for ONE record, at the tightest scope that clears the
 * sample bar, and never at a scope that does not.
 *
 * A block with its own low-floor and high-floor sales gets its own figure.
 * A block without them gets its town's, clearly labelled as the town's — the
 * two are not the same claim and the page must not let them look the same.
 */
export function storeyFor(rec) {
  const s = storey();
  if (!s || !rec) return null;
  // Landed has no floor. URA files every landed sale with floorRange "-", and a
  // terrace does not have a high side to compare a low side against.
  if (rec.landed) return null;
  const side = rec.kind === 'HDB' ? s.hdb : s.private;
  if (!side) return null;
  const groupKey = rec.kind === 'HDB' ? rec.town : rec.district;
  const group = side.groups?.[groupKey] || null;
  const unit = side.units?.[rec.href] || null;
  if (!group && !unit) return null;
  return {
    kind: rec.kind,
    scopeLabel: rec.kind === 'HDB' ? rec.town : `District ${rec.district}`,
    cut: s.cuts[rec.kind === 'HDB' ? 'hdb' : 'private'],
    bars: s.bars,
    group, unit,
    national: side.national || null,
    source: s.source,
  };
}

/* Null until `npm run ingest:rental && npm run build:yield` have both run.
 * The rental ingest needs the network and the URA key, so this is the one
 * dataset that cannot be produced from a clone alone. */
let _yield;
export function yields() {
  if (_yield === undefined) _yield = load('yield.json', null);
  return _yield;
}
