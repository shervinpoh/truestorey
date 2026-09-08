import { haversine } from '../geo.js';

/**
 * What has sold near here, and how near.
 *
 * ── WHY THIS IS NOT nearbyComps() ──────────────────────────────────────────
 * lib/blindspot/measure.js already has a comparables engine and it is doing a
 * different job: it FILTERS to units genuinely comparable to one target — same
 * size band, same tenure cohort, same type family — and widens the radius only
 * until enough exist, because a percentile from a mixed bag is a percentile
 * about the mixing. That set is deliberately narrow and exists to price one
 * home.
 *
 * This is the opposite request: everything that sold nearby, unfiltered, so a
 * reader can look. No comparability rule, no target, no verdict. The two must
 * not be merged — the moment this inherits the size and tenure filters it
 * stops answering the question it was asked.
 *
 * ── WHY COUNTS AND ROWS ARE SEPARATE ───────────────────────────────────────
 * comps.json is 6.4MB and the densest condo cluster carries 83KB of sales
 * inside a kilometre. Serialising those into the page would repeat what /mop
 * and /market each did once: App Router puts a server component's props in the
 * RSC payload as well as the markup, so the cost is paid twice.
 *
 * So the halves are split by what they cost. The COUNTS are complete at every
 * radius and cost five small objects. The ROWS are the most recent inside the
 * widest radius and are capped — which means a tight radius can hold sales
 * that are not listed. The count says how many exist, the rows say which are
 * shown, and the component prints both. A sample presented as a census is the
 * failure mode here, and naming the two numbers separately is what avoids it.
 *
 * ── SAME KIND ONLY ─────────────────────────────────────────────────────────
 * A condo page counts condo sales. HDB blocks outnumber condos around most
 * addresses by an order of magnitude — 120 neighbours inside a kilometre of
 * Aquarius By The Park against 9 condos — so folding them in would make the
 * figure a statement about how much HDB is nearby rather than about this
 * market.
 *
 * ── STRAIGHT LINE, SAID OUT LOUD ───────────────────────────────────────────
 * haversine, which is a straight line. Rule 10: what sits between two points
 * — a canal, an expressway, a fence — is in no dataset held here. The
 * component labels every distance as straight-line for that reason.
 */

/** The radii offered. Nested, so a wider band always contains a tighter one. */
export const BANDS = [200, 300, 500, 800, 1000];

/** How many rows travel to the client. Bounded on purpose — see above. */
export const ROW_CAP = 30;

/**
 * comps.json holds at most this many sales per address, because it is built
 * from each record's `recent` list and that is capped upstream — 3,065 of
 * 13,162 records sit exactly at it.
 *
 * This matters more than it looks. The per-band totals came out as 20, 40, 60,
 * 140, 180: exact multiples, because they are counting the CAP and not the
 * market. Printing "180 sales within 1,000 m" would be false, and falsely
 * precise, which is worse. So the field is named `indexed`, the cap travels
 * with it, and the component says "the 20 most recent at each" rather than
 * quoting a total nobody measured. `projects` is exact and is what the
 * sentence leads on.
 */
export const PER_PROJECT_CAP = 20;

const at = (sorted, f) => (sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]
  : null);

/**
 * @param rec    the record being viewed; needs href
 * @param index  comps.json, already loaded
 * @returns null when the record is absent or has no coordinate. A sale list
 *          keyed off a town centroid would be wrong about the one thing it
 *          claims to know, which is why build-comps drops those 76 records
 *          rather than placing them.
 */
export function nearbySales(rec, index, { bands = BANDS, cap = ROW_CAP } = {}) {
  const all = index?.records || {};
  const self = all[rec?.href];
  if (!self || !Number.isFinite(self.lat) || !Number.isFinite(self.lon)) return null;

  const max = bands[bands.length - 1];
  const near = [];
  for (const href of Object.keys(all)) {
    if (href === rec.href) continue;
    const o = all[href];
    if (!Number.isFinite(o.lat) || o.kind !== self.kind) continue;
    const m = Math.round(haversine(self.lat, self.lon, o.lat, o.lon));
    if (m <= max) near.push({ href, label: o.label, m, sales: o.sales || [] });
  }
  if (!near.length) return null;

  /* Complete counts, band by band. These are the figures the page quotes. */
  const counts = bands.map(radius => {
    const inside = near.filter(n => n.m <= radius);
    const psf = [];
    for (const n of inside) for (const s of n.sales) if (Number.isFinite(s[1])) psf.push(s[1]);
    psf.sort((a, b) => a - b);
    return {
      radius,
      /** Exact: every same-kind address inside this radius. */
      projects: inside.length,
      /** NOT a count of sales that happened — see PER_PROJECT_CAP. */
      indexed: psf.length,
      atCap: inside.filter(n => n.sales.length >= PER_PROJECT_CAP).length,
      p25: psf.length ? Math.round(at(psf, 0.25)) : null,
      median: psf.length ? Math.round(at(psf, 0.50)) : null,
      p75: psf.length ? Math.round(at(psf, 0.75)) : null,
    };
  });

  /* The rows, newest first. `month` sorts lexically because it is YYYY-MM,
     the same reason build-comps.mjs stores it that way. Ties break on
     distance so the nearer of two same-month sales leads. */
  const rows = [];
  for (const n of near) {
    for (const s of n.sales) {
      rows.push({ label: n.label, href: n.href, m: n.m,
                  month: s[0], psf: s[1], areaSqm: s[2], type: s[3], floor: s[4] });
    }
  }
  rows.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.m - b.m));

  return { kind: self.kind, bands, counts, rows: rows.slice(0, cap), cap,
           perProjectCap: PER_PROJECT_CAP };
}
