/**
 * Where an article is about, as a coordinate the site already holds.
 *
 * lib/photo.js deliberately never searched for a proper noun, because a stock
 * photograph cannot show Marina Gardens Lane and one that looks as if it might
 * is worse than none. That reasoning was right for a stock library and is why
 * the Marina Gardens tender was illustrated with an excavator.
 *
 * A public archive of photographs that carry their own coordinates changes the
 * question. The name is no longer searched for and trusted: it is resolved
 * HERE, against places this site has already geocoded from an agency, and the
 * photographs are then found by where they were taken. The name only chooses
 * which of our own coordinates to stand on.
 *
 * ── WHAT COUNTS AS A PLACE, MOST SPECIFIC FIRST ────────────────────────────
 *   record — a block or project page the article links to, via its geocode
 *   site   — a GLS site named in the title or slug, via data/gls.json
 *   town   — an HDB town page the article links to, via its geocoded blocks
 *   area   — a URA planning area named in the title or slug, via its boundary
 *
 * A place is only ever what this repo can already put on its own map. Nothing
 * here geocodes a string against an outside service, so a name that looks like
 * a place and is not one (a policy, a scheme, a person) resolves to nothing.
 *
 * Only the title, the slug and the tags are read — never the body. A body
 * mentions every town it compares against; the title says which one the piece
 * is ABOUT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { areaAt, centroid } from './geojson.js';
import { boundaries, geoRecords } from './data/query.js';

/* Planning-area names that are also ordinary words or scheme names. "Pioneer
   Generation" is a CPF policy, not a note about Pioneer; "the museum" is not
   Museum planning area. A piece genuinely about one of these links its page,
   which the record and town rungs catch. */
const AMBIGUOUS = new Set(['PIONEER', 'MUSEUM', 'SIMPANG', 'STRAITS VIEW', 'CHANGI BAY']);

/* How far to look for a photograph, by how specific the place is. A block is a
   building, so 400m is the street it stands on. A GLS site is a plot, and its
   surroundings are what a tender note is about. A town is a town. */
export const RADIUS = { record: 400, site: 700, town: 1500, area: 1500 };

const norm = s => String(s || '').toLowerCase()
  .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/* Where in the text a name first appears, whole words only, or -1. The FIRST
   mention decides between two: "Marina Gardens Lane and Orchard Boulevard" is
   headed by the first. */
function at(text, name) {
  const n = norm(name);
  if (!n) return -1;
  const m = new RegExp(`(^| )${n.replace(/ /g, ' ')}( |$)`).exec(text);
  return m ? m.index : -1;
}

let _sites = null;
function sites() {
  if (_sites) return _sites;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'gls.json'), 'utf8'));
    /* "Lorong Puntong / Sin Ming Avenue" is two names for one plot, and a title
       uses one of them. Each alternative is matched on its own. */
    _sites = (j.sites || []).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .flatMap(s => String(s.name).split('/').map(part => ({
        name: part.replace(/\(.*?\)/g, '').trim(), full: s.name, lat: s.lat, lon: s.lon })));
  } catch { _sites = []; }
  return _sites;
}

/** The mean of a town's geocoded blocks — where its housing actually is. */
function townCentre(slug) {
  const prefix = `/hdb/${slug}/`;
  let n = 0, lat = 0, lon = 0;
  for (const [href, g] of Object.entries(geoRecords())) {
    /* Street-grade or better, or it is not used (CLAUDE.md rule 12). */
    if (!href.startsWith(prefix) || !g || g.match === 'none' || !Number.isFinite(g.lat)) continue;
    n++; lat += g.lat; lon += g.lon;
  }
  return n ? { lat: lat / n, lon: lon / n } : null;
}

const title = s => String(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

/**
 * @returns {{ name, kind, lat, lon, radius } | null}
 */
export function placeOf({ title: t = '', slug = '', tags = [], sources = [] } = {}) {
  /* Links first: a link to one of our own pages is the article saying exactly
     what it is about, with no name-matching involved. */
  for (const u of sources || []) {
    let p;
    try { p = new URL(u, 'https://x').pathname; } catch { continue; }
    const g = geoRecords()[p];
    if (g && g.match !== 'none' && Number.isFinite(g.lat)) {
      const label = p.split('/').pop().replace(/-/g, ' ');
      return withArea({ name: title(label), kind: 'record', lat: g.lat, lon: g.lon, radius: RADIUS.record });
    }
    const town = /^\/hdb\/([a-z0-9-]+)\/?$/.exec(p);
    if (town) {
      const c = townCentre(town[1]);
      if (c) return { name: title(town[1].replace(/-/g, ' ')), kind: 'town', ...c, radius: RADIUS.town };
    }
  }

  const text = norm(`${t} ${String(slug).replace(/-/g, ' ')} ${(tags || []).join(' ')}`);
  const hits = [];
  for (const s of sites()) {
    const i = at(text, s.name);
    if (i >= 0) hits.push({ i, rank: 0, place: { name: s.name, kind: 'site', lat: s.lat, lon: s.lon, radius: RADIUS.site } });
  }
  for (const a of boundaries().areas || []) {
    if (AMBIGUOUS.has(a.name)) continue;
    const i = at(text, a.name);
    if (i < 0) continue;
    const ring = a.rings?.[0];
    const c = ring && centroid(ring);
    if (c) hits.push({ i, rank: 1, place: { name: title(a.name), kind: 'area', lat: c[1], lon: c[0], radius: RADIUS.area } });
  }
  if (!hits.length) return null;
  /* The more specific kind wins outright: "New Upper Changi Road … Bedok" is
     about the site, and Bedok is where the site is. Between two of the same
     kind, the one named first. */
  hits.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return withArea(hits[0].place);
}

/* The planning area a site or block stands in, from the boundary itself.
   Few photographs are named after a street; many are named after the town. */
function withArea(place) {
  if (place.kind === 'area' || place.kind === 'town') return place;
  const a = areaAt(place.lon, place.lat, boundaries().areas || []);
  return a ? { ...place, area: title(a.name) } : place;
}
