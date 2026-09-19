/**
 * One development, profiled — not one unit priced.
 *
 * ── WHY THIS IS A SEPARATE THING FROM THE VALUATION PAGE ───────────────────
 * The AVM answers "what is this unit worth", and to do that it deliberately
 * throws almost everything away: it keeps the comparables that match on type,
 * size, tenure and lease and discards the rest of the development. That is
 * correct for pricing and useless for research.
 *
 * Researching a project is the opposite operation. You want the whole thing —
 * what it contains, how its own floors and sizes price against each other, how
 * it moved from launch to resale, what it rents for, how often it trades, and
 * what is being built around it. Every figure below is the project compared
 * WITH ITSELF, which is the one comparison that holds location, tenure,
 * vintage, facilities and developer constant for free.
 *
 * ── PRIVATE IS THE POINT ──────────────────────────────────────────────────
 * The panel was HDB-first because the AVM was. A block is nearly homogeneous —
 * one vintage, a few layouts — so a block profile is a short document. A condo
 * is not: it spans studios to penthouses across forty floors under one name,
 * and the variation INSIDE it is most of what a buyer is choosing between.
 * That variation is invisible to a tool that only prices one unit, which is
 * why private felt thin.
 *
 * HDB blocks are supported too, from the same shapes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { recordByHref } from '../data/query.js';
import { comps, liquidityFinding, leaseRemaining, floorMid, glsWithin } from '../blindspot/measure.js';
import { relativity } from '../calc/lease.js';

const SQFT_PER_SQM = 10.7639;
const SALE_TYPE = { 1: 'New sale', 2: 'Sub sale', 3: 'Resale' };

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
const qt = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

/* 38MB of private transactions and 20MB of HDB. Parsed once per change on
   disk, and indexed by project once, not scanned per request. */
const cache = new Map();
function cached(file, build) {
  const p = path.join(process.cwd(), 'data', file);
  if (!fs.existsSync(p)) return null;
  const m = fs.statSync(p).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.m === m) return hit.v;
  const v = build(JSON.parse(fs.readFileSync(p, 'utf8')));
  cache.set(file, { m, v });
  return v;
}

/** contractDate is MMYY. "0326" → "2026-03", which sorts lexically. */
const monthOf = d => `20${String(d).slice(2, 4)}-${String(d).slice(0, 2)}`;

const privateByProject = () => cached('private.json', j => {
  const map = new Map();
  for (const r of j.rows) {
    if (!map.has(r.project)) map.set(r.project, []);
    map.get(r.project).push(r);
  }
  return map;
});

const hdbByBlock = () => cached('hdb.json', j => {
  const map = new Map();
  for (const r of j.rows) {
    const k = `${r.block}|${r.street}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
});

/**
 * Size bands, with what each actually trades at.
 *
 * ── THE ONE GRADIENT THAT IS CLEAN ────────────────────────────────────────
 * Measured across a whole market, psf against floor area is confounded by
 * everything — bigger homes sit in different places, of different vintages,
 * under different tenures. Inside ONE development all of that is held constant
 * by construction, so the spread between a studio's psf and a four-bedder's is
 * a fact about this building rather than about the market. It is also the
 * number a buyer choosing between two unit types in the same project actually
 * needs, and nothing publishes it.
 */
function unitMix(rows, areaOf, psfOf, priceOf) {
  const areas = rows.map(areaOf).filter(Number.isFinite);
  if (!areas.length) return null;
  /* Bands from the project's own spread, not a fixed ladder — a project of
     studios and one of townhouses do not share sensible cut points. */
  const lo = Math.min(...areas), hi = Math.max(...areas);
  const steps = Math.min(6, Math.max(2, Math.round(Math.log2(rows.length / 4) + 1)));
  const cuts = [];
  for (let i = 1; i < steps; i++) cuts.push(qt(areas, i / steps));
  const edges = [...new Set([lo - 0.01, ...cuts, hi + 0.01])].sort((a, b) => a - b);

  const out = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inBand = rows.filter(r => areaOf(r) > edges[i] && areaOf(r) <= edges[i + 1]);
    if (inBand.length < 3) continue;
    const psf = inBand.map(psfOf).filter(Number.isFinite);
    out.push({
      fromSqm: Math.round(edges[i] + 0.01), toSqm: Math.round(edges[i + 1]),
      fromSqft: Math.round((edges[i] + 0.01) * SQFT_PER_SQM), toSqft: Math.round(edges[i + 1] * SQFT_PER_SQM),
      n: inBand.length,
      medianSqm: Math.round(med(inBand.map(areaOf))),
      medianPsf: Math.round(med(psf)),
      medianPrice: Math.round(med(inBand.map(priceOf).filter(Number.isFinite))),
    });
  }
  if (out.length < 2) return null;
  const first = out[0].medianPsf, last = out.at(-1).medianPsf;
  return {
    bands: out,
    /* Stated as a finding, because the direction is the point: smaller units
       almost always carry a higher rate, and a buyer comparing a total price
       between two unit types is usually not told why. */
    spreadPct: first ? (last - first) / first : null,
    says: first && last
      ? `The largest band trades at ${Math.abs(100 * (last - first) / first).toFixed(0)}% ${last < first ? 'below' : 'above'} the smallest, per square foot. `
        + (last < first
          ? 'Bigger units carry a lower rate here, as they usually do — the total price still rises, just not proportionally.'
          : 'Bigger units carry a HIGHER rate here, which is unusual and worth a look at what those units are.')
      : null,
  };
}

/**
 * How the project's own floors price against each other.
 *
 * The same within-building comparison the storey curve uses across many
 * blocks, but for this one development — which is what somebody choosing
 * between a low floor and a high floor in a specific project is asking.
 */
function floorProfile(rows, floorOf, psfOf) {
  const g = new Map();
  for (const r of rows) {
    const label = floorOf(r);
    const mid = floorMid(label);
    if (!Number.isFinite(mid) || !Number.isFinite(psfOf(r))) continue;
    if (!g.has(label)) g.set(label, { label, mid, psf: [] });
    g.get(label).psf.push(psfOf(r));
  }
  const bands = [...g.values()].filter(b => b.psf.length >= 3).sort((a, b) => a.mid - b.mid)
    .map(b => ({ label: b.label, mid: b.mid, n: b.psf.length, medianPsf: Math.round(med(b.psf)) }));
  if (bands.length < 3) {
    return { ran: false, why: `Fewer than three storey bands here carry three sales each — ${bands.length} qualified. A floor premium from thinner evidence than that is one sale's opinion.` };
  }
  const lo = bands[0], hi = bands.at(-1);
  return {
    ran: true, bands,
    spreadPct: (hi.medianPsf - lo.medianPsf) / lo.medianPsf,
    says: `${lo.label} trades at ${lo.medianPsf} psf and ${hi.label} at ${hi.medianPsf} — `
        + `${Math.abs(100 * (hi.medianPsf - lo.medianPsf) / lo.medianPsf).toFixed(0)}% ${hi.medianPsf > lo.medianPsf ? 'higher' : 'lower'} `
        + 'across this development\'s own floors, with everything else about the building held constant.',
  };
}

/** Year by year, split by how the unit was sold. */
function byYear(rows, yearOf, typeOf, psfOf) {
  const g = new Map();
  for (const r of rows) {
    const y = yearOf(r);
    if (!y) continue;
    if (!g.has(y)) g.set(y, { year: y, all: [], 1: [], 2: [], 3: [] });
    const e = g.get(y);
    e.all.push(psfOf(r));
    const t = String(typeOf(r) ?? 3);
    if (e[t]) e[t].push(psfOf(r));
  }
  return [...g.values()].sort((a, b) => a.year.localeCompare(b.year)).map(e => ({
    year: e.year, n: e.all.length, medianPsf: Math.round(med(e.all)),
    types: Object.entries(SALE_TYPE).map(([k, label]) => ({
      key: k, label, n: e[k].length, medianPsf: e[k].length ? Math.round(med(e[k])) : null,
    })).filter(t => t.n),
  }));
}

/**
 * @param href a record href — /condo/…, /landed/… or /hdb/town/block-street
 */
export function developmentProfile(href, { now = new Date() } = {}) {
  const rec = recordByHref(href);
  if (!rec) return { ok: false, reason: 'No record at that address.' };
  const isHdb = rec.kind === 'HDB';

  let rows, areaOf, psfOf, priceOf, floorOf, yearOf, typeOf;
  if (isHdb) {
    const parts = String(rec.label).replace(/^Blk\s*/i, '').split(/\s+/);
    const block = parts.shift();
    rows = hdbByBlock()?.get(`${block}|${parts.join(' ')}`) || [];
    areaOf = r => r.areaSqm; psfOf = r => r.psf; priceOf = r => r.price;
    floorOf = r => r.storeyRange; yearOf = r => String(r.month).slice(0, 4); typeOf = () => 3;
  } else {
    rows = privateByProject()?.get(rec.label?.replace(/^#\s*/, '')) || privateByProject()?.get(rec.label) || [];
    areaOf = r => r.areaSqm; psfOf = r => r.psf; priceOf = r => r.price;
    floorOf = r => r.floorRange; yearOf = r => monthOf(r.contractDate).slice(0, 4); typeOf = r => r.typeOfSale;
  }

  if (!rows.length) {
    return { ok: false, reason: `No transactions found under "${rec.label}". Private records are matched on URA's project name, which occasionally differs from the label shown.` };
  }

  const months = rows.map(r => (isHdb ? r.month : monthOf(r.contractDate))).sort();
  const psfAll = rows.map(psfOf).filter(Number.isFinite);
  const self = comps().records?.[href];

  /* Rental and yield, if either is held for this project. */
  const rents = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'rents.json'), 'utf8')).records?.[href] || null; }
    catch { return null; }
  })();
  const yieldRow = (() => {
    try {
      const y = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'yield.json'), 'utf8'));
      return Object.values(y.projects || {}).find(p => p.href === href) || null;
    } catch { return null; }
  })();

  /* What is being built in the same district — competing supply a buyer here
     will meet on resale. */
  const pipeline = (() => {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'pipeline.json'), 'utf8'));
      const d = String(rec.district || '').padStart(2, '0');
      const near = (p.list || []).filter(x => String(x.district).padStart(2, '0') === d);
      return near.length ? { district: d, projects: near.length, units: near.reduce((s, x) => s + x.totalUnits, 0), list: near.slice(0, 8) } : null;
    } catch { return null; }
  })();

  const years = leaseRemaining(rec, now);
  const lease = Number.isFinite(years) ? {
    yearsLeft: Math.round(years),
    relativity: years <= 99 ? relativity(Math.round(years)) : null,
    freehold: years > 99,
  } : null;

  const liq = liquidityFinding(rec);

  return {
    ok: true,
    identity: {
      href, label: rec.label, kind: rec.kind, town: rec.town || null,
      district: rec.district || null, segment: rows[0]?.marketSegment || null,
      street: rows[0]?.street || null,
      tenures: [...new Set(rows.map(r => r.tenure).filter(Boolean))],
      propertyTypes: [...new Set(rows.map(r => r.propertyType || r.flatType).filter(Boolean))],
    },
    transactions: {
      total: rows.length, from: months[0], to: months.at(-1),
      medianPsf: Math.round(med(psfAll)), lowPsf: Math.round(qt(psfAll, 0.05)), highPsf: Math.round(qt(psfAll, 0.95)),
      byYear: byYear(rows, yearOf, typeOf, psfOf),
      /* The lifecycle is only meaningful where a project has actually had one. */
      hasLifecycle: !isHdb && new Set(rows.map(r => String(r.typeOfSale))).size > 1,
    },
    unitMix: unitMix(rows, areaOf, psfOf, priceOf),
    floors: floorProfile(rows, floorOf, psfOf),
    lease,
    liquidity: liq ? { rate: liq.rate, median: liq.median, of: liq.of, quieter: liq.quieter } : null,
    rental: rents ? { all: rents.all, beds: rents.beds || null } : null,
    yield: yieldRow ? { cohorts: yieldRow.cohorts, basis: 'gross' } : null,
    pipeline,
    gls: self && Number.isFinite(self.lat) ? glsWithin(self.lat, self.lon, { km: 1 }) : null,
    sources: [
      isHdb ? 'HDB Resale Flat Prices (data.gov.sg, Singapore Open Data Licence v1.0)' : 'URA Private Residential Transactions (URA Data Service)',
      rents ? 'URA rental contracts' : null,
      pipeline ? 'URA Residential Development Pipeline' : null,
    ].filter(Boolean),
  };
}
