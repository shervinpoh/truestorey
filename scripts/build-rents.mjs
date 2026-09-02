import fs from 'node:fs';
import path from 'node:path';

/**
 * Filed rents, indexed by the project they were signed at.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * /cost says, in its own omissions list, that rent is "the largest figure not
 * in this ledger" — the alternative to buying is renting, and nothing on the
 * page priced it. That was honest and it was also a gap the repo could close
 * on its own: URA files every rental contract, 65,654 of them are already
 * downloaded, and 84% of the private projects this site holds have at least
 * one against their name.
 *
 * A cost of ownership beside a filed rent for the same kind of home in the
 * same building is the comparison people are actually making. Both halves are
 * filed. Neither is estimated.
 *
 * ── WHAT IS NOT COLLAPSED ──────────────────────────────────────────────────
 * URA publishes floor area as a RANGE, never an exact figure, and
 * ingest-rental already refuses to collapse rent psf to a single number for
 * that reason. The same rule holds here: the median RENT is exact and is
 * reported; anything per square foot stays a range and says so.
 *
 * ── BEDROOMS, NOT SQUARE FEET ──────────────────────────────────────────────
 * Rent is negotiated per bedroom in a way sale prices are not, and URA
 * publishes the count on 93% of non-landed contracts. Grouping by bedroom is
 * both what the market does and what the data supports; the area range is
 * carried alongside so a reader can see the cohort is the size they meant.
 */

const root = process.cwd();
const read = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const median = a => { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };

const src = read('rental.json');
const projects = read('projects.json');

/* MMYY, as URA ships it. Turned into a sortable YYYY-MM so a period can be
 * printed and so "the last N months" means something later. */
const iso = d => {
  const m = String(d || '');
  if (!/^\d{4}$/.test(m)) return null;
  return `20${m.slice(2)}-${m.slice(0, 2)}`;
};

/** One cohort's figures. `min` is the point below which nothing is published:
 *  a median off two contracts is a number pretending to be a market. */
const MIN = 3;
function cohort(rows) {
  if (rows.length < MIN) return null;
  const rents = rows.map(r => r.rent).filter(Number.isFinite);
  if (rents.length < MIN) return null;
  const months = rows.map(r => iso(r.leaseDate)).filter(Boolean).sort();
  return {
    n: rents.length,
    median: Math.round(median(rents)),
    low: Math.min(...rents),
    high: Math.max(...rents),
    // The area a cohort actually covers, so a reader can see whether it is
    // the size they meant. Published as a range because URA publishes a range.
    areaFromSqm: Math.min(...rows.map(r => r.areaFrom).filter(Number.isFinite)),
    areaToSqm: Math.max(...rows.map(r => r.areaTo).filter(Number.isFinite)),
    from: months[0] || null,
    to: months.at(-1) || null,
  };
}

/* project name -> contracts, and district+type -> contracts for the fallback. */
const byProject = new Map();
const byDistrict = new Map();
for (const r of src.rows) {
  const p = norm(r.project);
  if (p) (byProject.get(p) || byProject.set(p, []).get(p)).push(r);
  const d = `${r.district}|${r.propertyType}`;
  (byDistrict.get(d) || byDistrict.set(d, []).get(d)).push(r);
}

const group = rows => {
  const out = { all: cohort(rows) };
  const beds = new Map();
  for (const r of rows) {
    if (!r.noOfBedRoom) continue;
    const k = String(r.noOfBedRoom);
    (beds.get(k) || beds.set(k, []).get(k)).push(r);
  }
  for (const [k, v] of beds) { const c = cohort(v); if (c) (out.beds ||= {})[k] = c; }
  return out.all || out.beds ? out : null;
};

const records = {};
let matched = 0;
for (const p of [...projects.condo, ...projects.landed]) {
  const rows = byProject.get(norm(String(p.label).replace(/^Landed\s*·\s*/i, '')));
  if (!rows) continue;
  const g = group(rows);
  if (!g) continue;
  records[p.href] = g;
  matched++;
}

const districts = {};
for (const [k, rows] of byDistrict) {
  const g = group(rows);
  if (g) districts[k] = g;
}

const out = {
  builtAt: new Date().toISOString(),
  source: src.source,
  licence: src.licence,
  note: 'Median MONTHLY rent from filed tenancy contracts, grouped by bedroom count. '
      + 'URA publishes floor area as a range and never as an exact figure, so the area '
      + 'span of each cohort is carried as a range and nothing here is divided by it. '
      + `A cohort of fewer than ${MIN} contracts is not published.`,
  periods: src.periods,
  minContracts: MIN,
  counts: { contracts: src.rows.length, projects: matched, districts: Object.keys(districts).length },
  records,
  districts,
};
fs.writeFileSync(path.join(root, 'data', 'rents.json'), JSON.stringify(out));
const kb = Math.round(fs.statSync(path.join(root, 'data', 'rents.json')).size / 1024);
console.log(`Wrote data/rents.json — ${matched.toLocaleString('en-SG')} projects · `
  + `${Object.keys(districts).length} district cohorts · ${kb}KB · periods ${src.periods.join(', ')}`);
