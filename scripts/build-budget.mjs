import fs from 'node:fs';
import path from 'node:path';

/**
 * What has actually sold, by area and type, at what price — so a budget can
 * be turned into places rather than into a number.
 *
 * ── THE GAP THIS FILLS ─────────────────────────────────────────────────────
 * /plan works out the largest loan the rules allow and the cash needed behind
 * it, and then stops at a figure. A ceiling is only half an answer: the
 * question underneath "what can I afford" is always "and what does that
 * BUY" — which towns, which flat types, which districts. The site holds every
 * filed transaction and had no way to answer it.
 *
 * ── MEDIAN AND LOWER QUARTILE, NOT A MINIMUM ───────────────────────────────
 * The cheapest filed sale in a town is a story about one home — a low floor,
 * a short lease, a distressed seller — and quoting it would send someone
 * looking for something that mostly is not there. The median says what the
 * middle of that market costs and the lower quartile says what the cheaper
 * end does, which together answer "could I be here" honestly.
 *
 * ── RECENT ONLY ────────────────────────────────────────────────────────────
 * Twelve months. A budget is being spent now and a 2021 median would flatter
 * every area on the list.
 */

const root = process.cwd();
const read = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * p)] ?? null; };

const MONTHS = 12;
/** Below this a median describes a handful of homes rather than a market. */
const MIN = 10;

const now = new Date();
const cut = new Date(now); cut.setMonth(cut.getMonth() - MONTHS);
const cutoff = `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}`;
const mmyy = d => (/^\d{4}$/.test(String(d)) ? `20${String(d).slice(2)}-${String(d).slice(0, 2)}` : null);

const groups = new Map();
const add = (scope, area, type, price, areaSqm) => {
  if (!Number.isFinite(price) || price <= 0) return;
  const k = `${scope}|${area}|${type}`;
  const g = groups.get(k) || groups.set(k, { scope, area, type, prices: [], areas: [] }).get(k);
  g.prices.push(price);
  if (Number.isFinite(areaSqm)) g.areas.push(areaSqm);
};

for (const t of (read('hdb.json').rows || [])) {
  if (!t.month || t.month < cutoff) continue;
  add('HDB', t.town, t.flatType, t.price, t.areaSqm);
}
for (const t of (read('private.json').rows || [])) {
  const m = mmyy(t.contractDate);
  if (!m || m < cutoff) continue;
  add('PRIVATE', `D${String(t.district).padStart(2, '0')}`, t.propertyType, t.price, t.areaSqm);
}

const rows = [];
for (const g of groups.values()) {
  if (g.prices.length < MIN) continue;
  rows.push({
    scope: g.scope, area: g.area, type: g.type, n: g.prices.length,
    p25: Math.round(q(g.prices, 0.25)),
    median: Math.round(q(g.prices, 0.50)),
    p75: Math.round(q(g.prices, 0.75)),
    medianAreaSqm: g.areas.length ? Math.round(q(g.areas, 0.50)) : null,
  });
}
rows.sort((a, b) => a.median - b.median);

const out = {
  builtAt: new Date().toISOString(),
  source: 'HDB via data.gov.sg · URA Data Service',
  note: `Filed transaction prices over the last ${MONTHS} months, grouped by town and flat type `
      + `for HDB and by district and property type for private. A group of fewer than ${MIN} `
      + 'sales is not published. The lower quartile is the cheaper end of what actually traded, '
      + 'not the cheapest sale — one low sale is a story about one home and would send somebody '
      + 'looking for something that mostly is not there.',
  months: MONTHS,
  minSales: MIN,
  from: cutoff,
  counts: { groups: rows.length, hdb: rows.filter(r => r.scope === 'HDB').length,
            private: rows.filter(r => r.scope === 'PRIVATE').length },
  rows,
};
fs.writeFileSync(path.join(root, 'data', 'budget.json'), JSON.stringify(out));
console.log(`Wrote data/budget.json — ${rows.length} groups (${out.counts.hdb} HDB · ${out.counts.private} private) `
  + `· ${MONTHS} months from ${cutoff} · ${Math.round(fs.statSync(path.join(root, 'data', 'budget.json')).size / 1024)}KB`);
