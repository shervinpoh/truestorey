/**
 * What the writer is handed. Every figure here is computed by code from
 * data/ or read from an agency's own page, with its period and its source,
 * before any model is involved.
 *
 * A pack is:
 *   { category, kindLabel, subject, brief, angle,
 *     source: { agency, title, date, url },     the primary source, if any
 *     facts:  [ 'sentence from that source' ],  its figures may be used as written
 *     figures:[ { id, what, value, format, period, source, url } ],
 *     headline: [ figure ids for the numbers panel ],
 *     caveats:[ ], links: [ { label, href } ], sources: [ urls ],
 *     place, chart, tags }
 *
 * The rule the whole file follows: if a comparison would make the piece
 * better but this repo cannot compute it, it is left out, not approximated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { placeOf } from '../place.js';
import { pointInRings } from '../geojson.js';

const load = (f, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', f), 'utf8')); } catch { return fallback; }
};
export const median = xs => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export const DATASET = id => `https://data.gov.sg/datasets/${id}/view`;
export const SQFT_PER_SQM = 10.7639;
const round = (n, d = 0) => Number(Number(n).toFixed(d));
const title = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

/* ── the desk's findings ────────────────────────────────────────────────── */

/**
 * A finding from lib/findings.js, as a pack. Its figures are already measured;
 * this gives each one a format so it displays one way only.
 */
export function findingPack(f, { site }) {
  const figures = f.figures.map((x, i) => ({
    id: `f${i + 1}`,
    what: x.what,
    value: x.value,
    format: typeof x.value === 'number' ? (/psf/i.test(x.what) ? 'psf' : 'count') : 'text',
    period: x.period,
    source: x.source,
  }));
  const href = `${site}${f.href}`;
  const label = f.href.startsWith('/hdb/') ? `${title(f.subject)} HDB resale page`
    : f.href === '/mop' ? 'Truestorey MOP tracker'
    : f.href === '/land' ? 'Truestorey land sales record'
    : f.href === '/floors' ? 'Truestorey floor premium page' : `${title(f.subject)} on Truestorey`;
  return {
    category: 'note',
    kindLabel: 'data note — a measured finding from the filed data',
    subject: title(f.subject),
    brief: `Explain this finding to someone buying, owning or selling a home: ${f.claim}. What it means, what is easy to misread, and the question it should make them ask.`,
    figures,
    headline: figures.filter(x => x.format !== 'text').slice(0, 3).map(x => x.id),
    caveats: f.caveat ? [f.caveat] : [],
    links: [{ label, href }],
    sources: [href],
    tags: [f.kind, String(f.subject).toLowerCase()],
  };
}

/* ── an agency release ──────────────────────────────────────────────────── */

const AGENCY_TAGS = { URA: 'ura', HDB: 'hdb', MND: 'mnd', IRAS: 'iras', MAS: 'mas' };

/**
 * A release from an agency's own page (lib/editorial/sources.js), with the
 * figures this site holds about the place it names.
 */
export function releasePack(release, { site }) {
  const place = placeOf({ title: release.title, slug: '', tags: [] });
  const figures = [];
  const links = [];
  const sources = [release.url];
  const caveats = [];
  const add = f => figures.push({ id: `f${figures.length + 1}`, ...f });

  /* A land-sale release: the price in the release itself, per square foot,
     and what land in the same planning area has fetched before.

     ── A NAME IS NOT A SITE ─────────────────────────────────────────────────
     The first version matched the awards record by name and handed the writer
     "Lorong Puntong: S$731 psf ppr, 18 bids" — a 2014 tender for a different
     parcel on the same road — as this month's result. Names repeat: Marina
     Gardens Lane and Orchard Boulevard each have an earlier award on file too.
     So this site's price comes from the release, and the awards record is
     consulted for it only within ten days of the release's own date. */
  const gls = load('gls-awards.json');
  const land = /\b(sale site|land parcel|tender|government land sales|gls)\b/i.test(release.title);
  if (land) {
    const priced = release.facts.map(f => /TENDERED PRICE[^:]*:\s*\$([\d,]+(?:\.\d+)?)\s*\(\$([\d,]+(?:\.\d+)?)\)/i.exec(f)).find(Boolean);
    const siteName = place?.kind === 'site' ? place.name : null;
    if (priced) {
      const total = Number(priced[1].replace(/,/g, '')), psm = Number(priced[2].replace(/,/g, ''));
      add({ what: `${siteName || 'the site'}, tendered price per square foot of permissible floor area`,
        value: round(psm / SQFT_PER_SQM), format: 'psfppr', period: release.date,
        source: `${release.agency} release, converted from S$ per m² at 10.7639 sq ft per m²`, url: release.url });
      add({ what: `${siteName || 'the site'}, total tendered price`, value: total, format: 'money', short: true, dp: 1,
        period: release.date, source: `${release.agency} release`, url: release.url });
    }
    const near = d => gls?.sites?.find(s => siteName && String(s.site).toLowerCase().startsWith(siteName.toLowerCase())
      && s.award && Math.abs(Date.parse(s.award) - Date.parse(release.iso)) <= 10 * 864e5);
    const own = release.iso ? near() : null;
    if (own && Number.isFinite(own.bids)) {
      add({ what: `bids received for ${siteName}`, value: own.bids, format: 'count', period: own.award, source: gls.source, url: gls.sourcePage });
    }
    const areaName = place?.area || (place?.kind === 'area' ? place.name : null);
    if (areaName && gls?.sites?.length) {
      const since = String(Number(String(release.iso || new Date().toISOString()).slice(0, 4)) - 15);
      const past = gls.sites
        .filter(s => String(s.planningArea).toLowerCase() === areaName.toLowerCase() && s.use === 'Residential'
          && s.award && s.award >= since && Number.isFinite(s.psmGfaOrGpr) && s !== own
          && (!release.iso || Date.parse(s.award) < Date.parse(release.iso) - 30 * 864e5))
        .sort((a, b) => String(b.award).localeCompare(String(a.award))).slice(0, 3);
      for (const s of past) {
        add({ what: `${s.site}, an earlier residential site in ${areaName}, price at award`, value: round(s.psmGfaOrGpr / SQFT_PER_SQM),
          format: 'psfppr', period: s.award, source: 'URA Government Land Sales — converted from S$ per m² at 10.7639 sq ft per m²', url: gls.sourcePage });
      }
      if (past.length) {
        caveats.push('Land prices from different years are not like for like: the market, the plot and the lease terms all differ between tenders.');
        sources.push(gls.sourcePage);
      }
      const resale = privateResaleIn(areaName);
      if (resale) {
        add({ what: `median resale price of condominiums and apartments in ${areaName}`, value: resale.median,
          format: 'psf', period: `${resale.from} to ${resale.to}`, source: 'URA Data Service — private residential transactions', url: 'https://www.ura.gov.sg/maps/api/' });
        add({ what: `resale transactions behind that median`, value: resale.n, format: 'count', period: `${resale.from} to ${resale.to}`, source: 'URA Data Service — private residential transactions' });
        caveats.push('A land price per square foot of floor area and the resale price per square foot of a finished home are different measures. The gap between them is not a launch price, and no launch price is implied.');
      }
    }
    links.push({ label: 'Truestorey land sales record', href: `${site}/land` });
  }

  /* An HDB release: the resale price index, the one HDB figure every piece on
     public housing sits against. */
  const idx = load('hdb-index.json');
  if (/\bHDB\b|\bflats?\b|\bBTO\b|\bresale\b|\bMOP\b/i.test(`${release.agency} ${release.title}`) && idx?.latest) {
    add({ what: 'HDB Resale Price Index (1Q2009 = 100)', value: idx.latest.index, format: 'index', period: idx.latest.quarter, source: idx.source, url: DATASET(idx.resourceId) });
    if (Number.isFinite(idx.yoy)) add({ what: 'change in the HDB Resale Price Index over four quarters', value: round(idx.yoy, 1), format: 'pct', dp: 1, period: `to ${idx.latest.quarter}`, source: idx.source });
    sources.push(DATASET(idx.resourceId));
    if (place?.kind === 'town' || place?.kind === 'area') links.push({ label: `${place.name} HDB resale page`, href: `${site}/hdb/${place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` });
    else links.push({ label: 'Truestorey market page', href: `${site}/market` });
  }

  if (!links.length) links.push({ label: 'Truestorey market page', href: `${site}/market` });
  return {
    category: /\b(policy|measure|ceiling|scheme|eligib|grant|rules?|framework|removal)\b/i.test(release.title) ? 'policy' : 'note',
    kindLabel: 'news note — commentary on an agency release',
    subject: release.title,
    brief: 'Explain what this release changes, or records, for someone buying, owning or selling a home in Singapore. Lead with what is new. The reader can click the release; do not retell it line by line — tell them what it means, what is easy to misread, and what to ask.',
    source: { agency: release.agency, title: release.title, date: release.date, url: release.url },
    facts: release.facts,
    figures,
    headline: figures.filter(f => f.format !== 'text').slice(0, 3).map(f => f.id),
    caveats,
    links,
    sources: [...new Set(sources.filter(Boolean))],
    place,
    tags: [AGENCY_TAGS[release.agency] || String(release.agency).toLowerCase()],
  };
}

/** Median resale psf of non-landed private homes in a planning area, last 12 months. */
export function privateResaleIn(areaName, { months = 12 } = {}) {
  const p = load('private.json');
  if (!p?.rows?.length) return null;
  const key = r => `20${r.contractDate.slice(2)}-${r.contractDate.slice(0, 2)}`;
  const latest = p.rows.map(key).sort().at(-1);
  const [ly, lm] = latest.split('-').map(Number);
  const from = new Date(Date.UTC(ly, lm - months, 1)).toISOString().slice(0, 7);
  /* The rows carry a district, not a planning area; the planning area comes
     from the project's own geocode. A row that cannot be placed is left out
     rather than guessed into an area. */
  const byProject = projectAreas();
  const rows = p.rows.filter(r => r.typeOfSale === '3' && /condominium|apartment/i.test(r.propertyType)
    && !/executive/i.test(r.propertyType) && key(r) >= from && byProject.get(r.project) === areaName.toUpperCase());
  if (rows.length < 20) return null;
  return { median: Math.round(median(rows.map(r => r.psf))), n: rows.length, from: rows.map(key).sort()[0], to: latest };
}

let _areas = null;
function projectAreas() {
  if (_areas) return _areas;
  _areas = new Map();
  const geo = load('geo.json', { records: {} }).records || {};
  const b = load('boundaries.json', { areas: [] }).areas || [];
  /* search.json keys a project by its filed name ("PARC CLEMATIS"), which is
     the name private.json carries on every row. */
  const recs = load('search.json', { entries: [] }).entries || [];
  const nameOf = new Map(recs.filter(e => e.h?.startsWith('/condo/')).map(e => [e.h, String(e.n || '').toUpperCase()]));
  for (const [href, g] of Object.entries(geo)) {
    if (!href.startsWith('/condo/') || !Number.isFinite(g?.lat) || g.match === 'none') continue;
    const area = b.find(a => pointInRings(g.lon, g.lat, a.rings));
    if (area && nameOf.get(href)) _areas.set(nameOf.get(href), area.name);
  }
  return _areas;
}
