/**
 * Historic whole-price cohorts, not a value for a home on sale today.
 *
 * Size is held to a 20 sqm band before a year is compared with another year.
 * A thinner slice can turn a handful of unusual homes into a misleading line;
 * fewer than 20 filed sales is withheld, not printed as an apparent trend.
 */
export const QUANTUM_BAND_SQM = 20;
export const QUANTUM_MIN_SALES = 20;

export const sizeBand = sqm => Number.isFinite(sqm) && sqm >= 20 && sqm < 400
  ? Math.floor(sqm / QUANTUM_BAND_SQM) * QUANTUM_BAND_SQM : null;

const percentile = (sorted, p) => {
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at), hi = Math.ceil(at);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo));
};

const valid = r => Number.isFinite(r.price) && r.price > 0 && sizeBand(r.areaSqm) !== null;
const hdbYear = r => /^\d{4}-\d{2}$/.test(String(r.month || '')) ? Number(r.month.slice(0, 4)) : null;
const privateYear = r => /^(0[1-9]|1[0-2])\d{2}$/.test(String(r.contractDate || ''))
  ? 2000 + Number(r.contractDate.slice(2)) : null;

export function buildQuantum({ hdbRows = [], privateRows = [] } = {}) {
  const groups = { hdb: new Map(), private: new Map() };
  const months = { hdb: [], private: [] };

  const add = (market, place, r, year, month) => {
    if (!valid(r) || !place || !Number.isInteger(year) || year < 2000 || year > 2100) return;
    const band = sizeBand(r.areaSqm);
    const key = `${place}|${band}|${year}`;
    const g = groups[market];
    if (!g.has(key)) g.set(key, { place, band, year, prices: [] });
    g.get(key).prices.push(r.price);
    months[market].push(month);
  };

  for (const r of hdbRows) {
    const year = hdbYear(r);
    if (year) add('hdb', String(r.town || '').trim(), r, year, r.month);
  }
  for (const r of privateRows) {
    // CCR/RCR/OCR are URA's own market segments in this filed dataset. Landed
    // and EC transactions are different markets; a shared 20 sqm bucket would
    // make unlike homes look comparable. Bulk deals are not one buyer's price.
    if (!['Apartment', 'Condominium'].includes(r.propertyType) || r.noOfUnits !== 1) continue;
    const year = privateYear(r);
    if (year) add('private', r.marketSegment, r, year,
      `${year}-${String(r.contractDate).slice(0, 2)}`);
  }

  const finish = market => {
    const rows = [...groups[market].values()]
      .filter(g => g.prices.length >= QUANTUM_MIN_SALES)
      .map(g => {
        g.prices.sort((a, b) => a - b);
        return [g.place, g.band, g.year, g.prices.length,
          percentile(g.prices, .25), percentile(g.prices, .5), percentile(g.prices, .75)];
      })
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1] || a[2] - b[2]);
    const span = months[market].sort();
    return {
      rows,
      places: [...new Set(rows.map(r => r[0]))].sort(),
      period: { from: span[0] || null, to: span.at(-1) || null },
    };
  };

  return { bandSqm: QUANTUM_BAND_SQM, minSales: QUANTUM_MIN_SALES,
    hdb: finish('hdb'), private: finish('private') };
}
