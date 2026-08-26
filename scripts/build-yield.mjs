/**
 * Gross rental yield, by project and by district.
 *
 *   npm run ingest:rental && npm run build:yield
 *
 * TRM charges PRO for this. It is a join, not a model: annual rent over price,
 * both medians, both from filed records.
 *
 * THE JOIN IS THE HARD PART, AND IT IS A SIZE PROBLEM. URA publishes rents
 * against an area RANGE ("70 to 80 sqm") and sales against an exact area. A
 * three-bedroom's rent over a one-bedroom's price is not a yield, it is a
 * ratio of two unrelated things. So a rental contract is only ever matched to
 * sales whose area falls INSIDE its own band, and a project with no overlap
 * produces nothing rather than something averaged.
 *
 * The yield is GROSS and the file says so everywhere it can. Net yield needs
 * property tax, maintenance, agent fees and vacancy — all of which are in the
 * renting guide, none of which are in this data. Publishing a net figure from
 * assumptions would be a model wearing a measurement's clothes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MIN = { rents: 3, sales: 3 };   // per project, per size cohort

const med = v => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };
const key = s => String(s || '').trim().toUpperCase();

/**
 * Pure, so it can be tested without the network. Returns projects and
 * districts; anything that does not clear MIN is simply absent.
 */
export function yieldsFrom(rentalRows, saleRows) {
  // Sales indexed by project, so each rental band can find its own size cohort.
  const salesBy = new Map();
  for (const s of saleRows) {
    if (!s.project || !Number.isFinite(s.price) || !Number.isFinite(s.areaSqm)) continue;
    const k = key(s.project);
    (salesBy.get(k) || salesBy.set(k, []).get(k)).push(s);
  }

  const projects = {};
  const byDistrict = new Map();

  const grouped = new Map();
  for (const r of rentalRows) {
    if (!r.project || !Number.isFinite(r.rent) || !Number.isFinite(r.areaFrom)) continue;
    const k = key(r.project);
    (grouped.get(k) || grouped.set(k, []).get(k)).push(r);
  }

  for (const [k, rents] of grouped) {
    const sales = salesBy.get(k);
    if (!sales || rents.length < MIN.rents) continue;

    // One cohort per distinct published area band.
    const bands = new Map();
    for (const r of rents) {
      const bk = `${r.areaFrom}-${r.areaTo}`;
      (bands.get(bk) || bands.set(bk, []).get(bk)).push(r);
    }

    const cohorts = [];
    for (const [bk, group] of bands) {
      if (group.length < MIN.rents) continue;
      const { areaFrom, areaTo } = group[0];
      const matched = sales.filter(s => s.areaSqm >= areaFrom && s.areaSqm <= areaTo);
      if (matched.length < MIN.sales) continue;
      const rent = med(group.map(r => r.rent));
      const price = med(matched.map(s => s.price));
      if (!rent || !price) continue;
      cohorts.push({
        band: bk,
        areaFrom, areaTo,
        beds: med(group.map(r => r.noOfBedRoom).filter(Number.isFinite)) ?? null,
        rents: group.length,
        sales: matched.length,
        medianRent: Math.round(rent),
        medianPrice: Math.round(price),
        grossYield: Math.round((rent * 12 / price) * 10000) / 100,   // percent, 2dp
      });
    }
    if (!cohorts.length) continue;

    cohorts.sort((a, b) => a.areaFrom - b.areaFrom);
    const district = rents.find(r => r.district)?.district || sales.find(s => s.district)?.district || null;
    projects[k] = {
      label: rents[0].project,
      district,
      href: `/condo/${String(rents[0].project).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      cohorts,
      // The project figure is the median ACROSS its size cohorts, so a block of
      // fifty studios does not decide the whole project's yield on its own.
      grossYield: Math.round(med(cohorts.map(c => c.grossYield)) * 100) / 100,
    };
    if (district) (byDistrict.get(district) || byDistrict.set(district, []).get(district)).push(projects[k].grossYield);
  }

  const districts = {};
  for (const [d, v] of byDistrict) {
    districts[d] = { projects: v.length, grossYield: Math.round(med(v) * 100) / 100 };
  }
  return { projects, districts };
}

async function main() {
  const read = async f => JSON.parse(await fs.readFile(path.join(ROOT, 'data', f), 'utf8'));
  let rental;
  try { rental = await read('rental.json'); }
  catch {
    console.error('No data/rental.json. Run `npm run ingest:rental` first — it needs the URA key in .env.local and a network connection.');
    process.exit(1);
  }
  const sales = await read('private.json');

  const out = {
    builtAt: new Date().toISOString(),
    basis: 'gross',
    min: MIN,
    source: {
      rental: rental.source, rentalAccessed: rental.accessedAt, periods: rental.periods,
      sales: sales.source, salesAccessed: sales.accessedAt,
    },
    ...yieldsFrom(rental.rows, sales.rows),
  };
  await fs.writeFile(path.join(ROOT, 'data', 'yield.json'), JSON.stringify(out));
  console.log(`data/yield.json — ${Object.keys(out.projects).length} projects, ${Object.keys(out.districts).length} districts`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(`BUILD YIELD FAILED: ${e.message}`); process.exit(1); });
}
