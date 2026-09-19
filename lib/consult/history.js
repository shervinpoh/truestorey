/**
 * The comparable universe as it stood in any past month.
 *
 * ── WHY THIS IS NOT lib/consult/asof.js ────────────────────────────────────
 * `asof.js` truncates TODAY'S comps.json backwards, which is right for testing
 * against the last few months and wrong for anything older, for two reasons.
 * comps.json caps each address at its twenty most recent sales — so the
 * further back you truncate, the more addresses come back empty for a reason
 * that has nothing to do with the market. And it is built from data/hdb.json,
 * which is a deliberate three-year rolling window.
 *
 * So a 2019 backtest cannot be run by subtraction. It needs the raw history,
 * which `npm run ingest:hdb -- --history` now keeps: 240,345 rows from
 * 2017-01, uncapped.
 *
 * ── INCREMENTAL, BECAUSE THE ALTERNATIVE IS QUADRATIC ─────────────────────
 * The obvious build is "filter all rows to month < asOf, group, repeat for
 * every origin". Fifteen folds over six months each is ninety rebuilds of a
 * 240k-row table.
 *
 * Walking forward instead costs one pass in total. At each month the caller
 * predicts that month's sales FIRST and only then folds them in, which is also
 * what makes it as-of correct by construction rather than by a filter someone
 * has to remember to write. There is no `month <= asOf` to get wrong, because
 * a sale that has not been added cannot be seen.
 *
 * ── COORDINATES COME FROM TODAY, AND THAT IS FINE ─────────────────────────
 * A block's latitude did not change between 2019 and now, so they are read
 * from comps.json rather than re-geocoded. Addresses with no coordinate are
 * kept as SUBJECTS — their own block's sales still price them — but cannot
 * contribute to anybody else's radius search, and `coverage()` reports how
 * many that is rather than letting it vanish.
 */
import fs from 'node:fs';
import path from 'node:path';
import { hdbHref } from '../name.js';

const SQFT_PER_SQM = 10.7639;
const HISTORY = 'data/.hdb-history.json';

let _hist;
export function loadHistory() {
  if (_hist === undefined) {
    const p = path.join(process.cwd(), HISTORY);
    _hist = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  return _hist;
}

/** Column positions, read from the file's own schema rather than assumed —
 *  a reordered ingest would otherwise silently swap price and area. */
function columns(hist) {
  const at = name => {
    const i = hist.fields.indexOf(name);
    if (i < 0) throw new Error(`.hdb-history.json has no "${name}" column`);
    return i;
  };
  return { month: at('month'), town: at('town'), block: at('block'), street: at('street'),
           flatType: at('flatType'), model: at('model'), storeyRange: at('storeyRange'),
           areaSqm: at('areaSqm'), leaseCommence: at('leaseCommence'), price: at('price') };
}

/** Rows grouped by the month they were filed, oldest first. */
export function byMonth(hist = loadHistory()) {
  if (!hist?.rows?.length) return null;
  const c = columns(hist);
  const map = new Map();
  for (const r of hist.rows) {
    const m = r[c.month];
    if (!map.has(m)) map.set(m, []);
    map.get(m).push(r);
  }
  return { columns: c, months: [...map.keys()].sort(), map };
}

/** lat/lon per href, from today's comps index. See the note above. */
function coordinates() {
  const p = path.join(process.cwd(), 'data', 'comps.json');
  if (!fs.existsSync(p)) return {};
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  const out = {};
  for (const [href, r] of Object.entries(c.records || {})) {
    if (r.kind === 'HDB' && Number.isFinite(r.lat)) out[href] = { lat: r.lat, lon: r.lon };
  }
  return out;
}

/**
 * A growing, as-of-correct view of the market.
 *
 * Nothing is ever removed. `add(month)` folds one month in; every read
 * reflects exactly the months added so far, which is the whole point.
 */
export class MarketAsOf {
  constructor({ coords = coordinates(), columns: c } = {}) {
    this.coords = coords;
    this.c = c;
    this.records = {};      // href -> comps-shaped record
    this.added = [];        // months folded in, in order
    this.noCoord = new Set();
  }

  add(rows) {
    for (const r of rows) {
      const c = this.c;
      const href = hdbHref(r[c.town], r[c.block], r[c.street]);
      const area = r[c.areaSqm];
      if (!(area > 0)) continue;
      const psf = r[c.price] / (area * SQFT_PER_SQM);
      let rec = this.records[href];
      if (!rec) {
        const xy = this.coords[href];
        if (!xy) this.noCoord.add(href);
        rec = this.records[href] = {
          lat: xy?.lat ?? null, lon: xy?.lon ?? null,
          kind: 'HDB', label: `Blk ${r[c.block]} ${r[c.street]}`,
          town: r[c.town], tenure: null, leaseCommence: r[c.leaseCommence],
          sales: [],
        };
      }
      /* Same tuple order as comps.json, so the engine cannot tell the
         difference between this index and the live one. */
      rec.sales.push([r[c.month], Math.round(psf), area, r[c.flatType], r[c.storeyRange]]);
    }
  }

  /** The comparables index, in exactly comps.json's shape. Addresses with no
   *  coordinate are withheld — nearbyComps would place them at null and count
   *  them as contributing. They remain available as subjects via `record()`. */
  index() {
    const records = {};
    for (const [href, r] of Object.entries(this.records)) {
      if (Number.isFinite(r.lat)) records[href] = r;
    }
    return { records };
  }

  /** One address as a subject record, newest sale first. */
  record(href) {
    const r = this.records[href];
    if (!r) return null;
    const recent = r.sales
      .map(([month, psf, areaSqm, flatType, storey]) => ({ month, psf, areaSqm, flatType, storey }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));
    return {
      href, kind: 'HDB', label: r.label, town: r.town,
      leaseCommence: r.leaseCommence,
      source: 'HDB Resale Flat Prices (data.gov.sg)',
      period: this.added.length ? `${this.added[0]} to ${this.added.at(-1)}` : null,
      flatTypes: [...new Set(r.sales.map(s => s[3]))],
      recent,
    };
  }

  coverage() {
    const total = Object.keys(this.records).length;
    return { addresses: total, withCoordinate: total - this.noCoord.size, withoutCoordinate: this.noCoord.size };
  }
}

export const hrefOf = (hist, row) => {
  const c = columns(hist);
  return hdbHref(row[c.town], row[c.block], row[c.street]);
};
