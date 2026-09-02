import fs from 'node:fs';
import path from 'node:path';

/**
 * The comparables index — every filed sale this repo holds, with a coordinate
 * beside it, in the smallest shape that can answer "what else sold near here,
 * like this, recently".
 *
 * ── WHY THIS FILE HAD TO EXIST ─────────────────────────────────────────────
 * Blindspot's price check needs five comparable sales. It looked only at the
 * address searched, so it starved: an audit over 250 private projects found
 * the check ran on 30% of them and 69% of reports came back "Incomplete —
 * price not assessed". A tool that cannot assess the price on two thirds of
 * the properties people look up is not a tool.
 *
 * The HDB half already had a nearby fallback and ran at 95%. It could do that
 * because an HDB shard IS a town — `records/hdb/bishan.json` holds every
 * Bishan block, so the neighbours were already in the file being read. Private
 * records are sharded by an arbitrary number, so `records/condo/7.json` holds
 * projects scattered across the island and reading it finds nothing nearby.
 *
 * Loading all 34 condo shards on a request would work and costs 9.8MB of JSON
 * parsed per cold start to use maybe 40 rows of it. This is the same data at
 * about a tenth of the size, laid out for the one question being asked.
 *
 * ── WHAT IS AND IS NOT IN HERE ─────────────────────────────────────────────
 * Only what a cohort match needs: where it is, what kind of home it is, how
 * big, when it sold and at what rate per square foot. No prices, no addresses
 * beyond the record's own href and label, nothing that is not already on the
 * public record page it points at.
 *
 * A record with no coordinate is left out entirely rather than placed at a
 * town centroid — rule 12, and a comparable measured from the wrong point is
 * worse than one that is missing, because the distance printed beside it would
 * be wrong in a way nobody can see.
 */

const root = process.cwd();
const read = (f, fallback = null) => {
  const p = path.join(root, 'data', f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
};

const geo = read('geo.json', { records: {} }).records || {};

/* Sale tuples are positional to keep the file small: at ~65,000 sales, a
 * six-key object per sale costs three times what an array does, and this file
 * is read on a request. The reader in lib/blindspot/measure.js names them. */
const SALE = ['month', 'psf', 'areaSqm', 'type'];

let kept = 0, noCoord = 0, noSales = 0;
const records = {};

for (const ns of ['hdb', 'condo', 'landed']) {
  const dir = path.join(root, 'data', 'records', ns);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    const shard = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const r of Object.values(shard)) {
      const at = geo[r.href];
      if (!Number.isFinite(at?.lat) || !Number.isFinite(at?.lon)) { noCoord++; continue; }

      const sales = (r.recent || [])
        .filter(s => Number.isFinite(s.psf) && Number.isFinite(s.areaSqm) && s.month)
        // HDB calls the category flatType, URA calls it propertyType. One field
        // here, named for what it means rather than for whichever agency
        // happened to supply it.
        .map(s => [s.month, Math.round(s.psf), Math.round(s.areaSqm), s.flatType || s.propertyType || null]);
      if (!sales.length) { noSales++; continue; }

      records[r.href] = {
        lat: +at.lat.toFixed(6), lon: +at.lon.toFixed(6),
        kind: r.kind,
        label: r.label,
        // Tenure decides whether two private homes are comparable at all — a
        // freehold and a 99-year unit of the same size in the same street are
        // not the same product. HDB is uniformly leasehold, so it carries the
        // lease start year instead, which is what the HDB cohort matches on.
        tenure: r.tenure || null,
        leaseCommence: r.leaseCommence ?? null,
        sales,
      };
      kept++;
    }
  }
}

const months = Object.values(records).flatMap(r => r.sales.map(s => s[0]));
months.sort();

/**
 * How often anything changes hands at an address, per year, and where the
 * quiet end of that distribution actually sits.
 *
 * ── WHY THE THRESHOLDS ARE DERIVED AND NOT WRITTEN DOWN ────────────────────
 * Liquidity is the blind spot nobody checks: buyers ask what a home costs and
 * never ask whether they will be able to sell it. But "few sales" is only
 * meaningful against a distribution, and the two markets are not the same
 * shape — HDB blocks turn over at a median of about 3 a year and private
 * projects at about 2.5, with a far longer thin tail. A single hardcoded
 * number would score most private projects as illiquid and say nothing.
 *
 * So the percentiles are measured here, from the same data the check reads,
 * and they move when the data does. The check can then say "in the quietest
 * tenth of HDB blocks" and have that be a fact about this dataset rather than
 * a threshold somebody once liked.
 */
function salesPerYear(r) {
  const ms = r.sales.map(s => s[0]).sort();
  if (!ms.length) return 0;
  const [ay, am] = ms[0].split('-').map(Number);
  const [by, bm] = ms.at(-1).split('-').map(Number);
  // +1 so a single month counts as a month, not as zero elapsed time.
  const span = (by - ay) * 12 + (bm - am) + 1;
  return r.sales.length / (span / 12);
}

const liquidity = {};
for (const kind of ['HDB', 'PRIVATE']) {
  const rates = Object.values(records).filter(r => r.kind === kind).map(salesPerYear).sort((a, b) => a - b);
  if (!rates.length) continue;
  const at = q => Math.round(rates[Math.floor(rates.length * q)] * 100) / 100;
  liquidity[kind] = { n: rates.length, p10: at(0.10), p25: at(0.25), median: at(0.50) };
}
for (const r of Object.values(records)) r.rate = Math.round(salesPerYear(r) * 100) / 100;
const out = {
  builtAt: new Date().toISOString(),
  note: 'Comparable-sale index for Blindspot\'s price check. Sales are positional '
      + `arrays: ${JSON.stringify(SALE)}. Records with no street-grade coordinate are `
      + 'omitted rather than placed at a town centroid.',
  fields: SALE,
  source: 'HDB via data.gov.sg · URA Data Service',
  period: { from: months[0] || null, to: months.at(-1) || null },
  counts: { records: kept, sales: months.length, noCoordinate: noCoord, noSales },
  /* Sales per year at each address, and the shape of that across the market.
   * `rate` is on every record; these are the percentiles it is judged against. */
  liquidity,
  records,
};

fs.writeFileSync(path.join(root, 'data', 'comps.json'), JSON.stringify(out));
const mb = (fs.statSync(path.join(root, 'data', 'comps.json')).size / 1e6).toFixed(1);
console.log(`Wrote data/comps.json — ${kept.toLocaleString('en-SG')} records · ${months.length.toLocaleString('en-SG')} sales · ${mb}MB`);
console.log(`  ${noCoord.toLocaleString('en-SG')} records omitted for want of a coordinate · ${noSales} with no usable sale`);
console.log(`  period ${out.period.from} → ${out.period.to}`);
