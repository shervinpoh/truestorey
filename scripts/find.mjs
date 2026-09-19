/**
 * Screen listings you already have for ones priced under what the evidence says.
 *
 *   npm run find -- --listings my-listings.csv
 *   npm run find -- --listings export.csv --min-score 0.6 --top 20
 *
 * ── WHERE THE LISTINGS COME FROM, AND WHERE THEY DO NOT ────────────────────
 * This reads a FILE. It does not scrape PropertyGuru, 99.co or anybody else,
 * and that is a deliberate refusal rather than a missing feature:
 *
 *   · Automated collection is against every one of those platforms' terms.
 *   · The account it would run under is a CEA-registered salesperson's, on a
 *     platform he depends on for his living. A ban is not a technical problem.
 *   · It is also unnecessary, because the data is already reachable lawfully —
 *     see below.
 *
 * LAWFUL ROUTES, cheapest first:
 *   1. An agent portal export. PropertyGuru AgentNet, 99.co Agent, SRX and
 *      most agency back-ends export listings to CSV. If Huttons' system can
 *      export, that is the whole ingest, done, today.
 *   2. A licensed data product. PropertyGuru and SRX both sell listing feeds.
 *   3. Typing in the handful you are actually looking at. Slow, and it is how
 *      the tool is worth using on day one.
 *
 * The screener does not care which. It reads a table.
 *
 * ── THE COLUMNS ───────────────────────────────────────────────────────────
 * CSV or JSON. Required: an address (either `href`, or `town`+`block`+`street`),
 * `areaSqft`, `askingPrice`. Optional but worth having: `floor`, `flatType`,
 * `url`, `listedAt`, `source`.
 *
 * ── WHAT A SHORTLIST MEANS HERE ───────────────────────────────────────────
 * Two independent questions, and a listing has to pass both:
 *
 *   PRICE   is it below what comparable evidence says, by more than this
 *           method's own measured error, with nothing visible explaining it?
 *           That is lib/consult/residual.js — Tests 1, 2 and 3.
 *   QUALITY does the property have anything going for it? That is
 *           lib/consult/score.js — lease, rail, schools, liquidity, supply,
 *           amenities, each a published threshold over a sourced figure.
 *
 * Cheap and bad is not a find; it is a bad flat at its correct price. Good and
 * fairly priced is not a find either. The shortlist is the intersection, and
 * both halves are shown so a disagreement between them is visible rather than
 * averaged into one number.
 */
import fs from 'node:fs';
import { recordByHref, search } from '../lib/data/query.js';
import { residual } from '../lib/consult/residual.js';
import { score } from '../lib/consult/score.js';
import { hdbHref } from '../lib/name.js';
import { parseCsv } from '../lib/consult/csv.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const FILE = arg('listings', null);
const TOP = Number(arg('top', 15));
const MIN_SCORE = Number(arg('min-score', 0.5));
const f = n => Number(n).toLocaleString('en-SG', { maximumFractionDigits: 0 });
const rule = t => console.log(`\n\x1b[2m───\x1b[0m ${t} \x1b[2m${'─'.repeat(Math.max(0, 72 - t.length))}\x1b[0m`);

if (!FILE) {
  console.error(`Pass --listings <file.csv|file.json>.

Columns: href OR town,block,street · areaSqft · askingPrice
Optional: floor · flatType · url · listedAt · source

This reads a file and never scrapes a listing portal. See the header of
scripts/find.mjs for why, and for the lawful routes to an export.`);
  process.exit(1);
}
if (!fs.existsSync(FILE)) { console.error(`${FILE} not found.`); process.exit(1); }

const raw = fs.readFileSync(FILE, 'utf8');
const listings = FILE.endsWith('.json') ? JSON.parse(raw) : (() => {
  const { head, rows } = parseCsv(raw);
  if (!head) return [];
  const keys = head.map(h => h.replace(/\s+/g, '').toLowerCase());
  return rows.map(cells => Object.fromEntries(keys.map((k, i) => [k, cells[i]])));
})();
console.log(`${listings.length} listing${listings.length === 1 ? '' : 's'} read from ${FILE}`);

const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

const results = [], failed = [];
for (const L of listings) {
  const askingPrice = num(L.askingprice ?? L.askingPrice ?? L.price);
  const areaSqft = num(L.areasqft ?? L.areaSqft ?? L.area);
  const floor = num(L.floor ?? L.storey);
  const label = L.url || L.href || `${L.block || ''} ${L.street || ''}`.trim() || '(unnamed)';

  if (!askingPrice || !areaSqft) { failed.push({ label, why: 'needs both askingPrice and areaSqft' }); continue; }

  /* Address resolution, most explicit first. A fuzzy search is offered last
     and its match is PRINTED, because silently pricing the wrong block is the
     worst thing this tool could do. */
  let rec = null, how = null;
  if (L.href) { rec = recordByHref(L.href); how = 'href'; }
  if (!rec && L.town && L.block && L.street) { rec = recordByHref(hdbHref(L.town, L.block, L.street)); how = 'town/block/street'; }
  if (!rec && (L.block || L.street)) {
    const hit = search(`${L.block || ''} ${L.street || ''}`.trim(), { limit: 1 })[0];
    if (hit) { rec = recordByHref(hit.href); how = 'fuzzy search'; }
  }
  if (!rec) { failed.push({ label, why: 'no record matched that address' }); continue; }

  const res = residual(rec, { asking: askingPrice, areaSqft, floor });
  if (!res.ok) { failed.push({ label: rec.label, why: res.reason }); continue; }
  const sc = score(rec);

  results.push({ listing: L, rec, how, askingPrice, areaSqft, floor, res, sc,
                 scoreRatio: sc.ok ? sc.ratio : null });
}

if (failed.length) {
  rule(`COULD NOT BE PRICED — ${failed.length}`);
  console.log(`  \x1b[2mListed rather than dropped: a screener that silently loses rows is one you`);
  console.log(`  cannot trust the length of.\x1b[0m\n`);
  for (const x of failed.slice(0, 20)) console.log(`  ${String(x.label).slice(0, 34).padEnd(36)} ${x.why}`);
}

/* ── THE SHORTLIST ─────────────────────────────────────────────────────── */
const shortlist = results.filter(r =>
  r.res.verdict.code === 'discount-unexplained' && (r.scoreRatio ?? 0) >= MIN_SCORE);

rule(`SHORTLIST — priced under the evidence, nothing explains it, and worth having`);
console.log(`  \x1b[2mBoth halves must pass: an unexplained discount that survives the method's own`);
console.log(`  error, AND a positive score of at least ${(100 * MIN_SCORE).toFixed(0)}% of what could be scored.\x1b[0m\n`);
if (!shortlist.length) {
  console.log(`  Nothing cleared both. ${results.length} priced, `
    + `${results.filter(r => r.res.verdict.code === 'discount-unexplained').length} were unexplained discounts, `
    + `${results.filter(r => (r.scoreRatio ?? 0) >= MIN_SCORE).length} scored well enough.`);
} else {
  console.log(`  ${'property'.padEnd(30)} ${'asking'.padStart(10)} ${'est'.padStart(9)} ${'gap'.padStart(7)} ${'score'.padStart(7)}`);
  for (const r of shortlist.sort((a, b) => a.res.gap.pct - b.res.gap.pct).slice(0, TOP)) {
    console.log(`  ${String(r.rec.label).slice(0, 29).padEnd(30)} ${('S$' + f(r.askingPrice)).padStart(10)} `
      + `${('S$' + f(r.res.estimate.price)).padStart(9)} `
      + `\x1b[1m${((100 * r.res.gap.pct).toFixed(1) + '%').padStart(7)}\x1b[0m `
      + `${(r.sc.points + '/' + r.sc.max).padStart(7)}`);
  }
}

/* Everything else, so a rejected listing shows WHY it was rejected. */
rule(`EVERYTHING PRICED — ${results.length}`);
console.log(`  ${'property'.padEnd(28)} ${'gap'.padStart(7)} ${'score'.padStart(6)}  verdict`);
for (const r of results.sort((a, b) => a.res.gap.pct - b.res.gap.pct)) {
  const flags = r.res.test2.flagged.map(x => x.key).join(',');
  console.log(`  ${String(r.rec.label).slice(0, 27).padEnd(28)} `
    + `${((100 * r.res.gap.pct).toFixed(1) + '%').padStart(7)} `
    + `${(r.sc.points + '/' + r.sc.max).padStart(6)}  ${r.res.verdict.code}`
    + (flags ? ` \x1b[2m(${flags})\x1b[0m` : '')
    + (r.how !== 'href' ? ` \x1b[33m[matched by ${r.how}]\x1b[0m` : ''));
}

console.log(`\n  \x1b[2mA shortlist is where to spend a Saturday, not what to buy. The residual is what`);
console.log(`  the filed data cannot explain — renovation, facing, corner or corridor, layout,`);
console.log(`  noise and condition are in no public dataset, and any of them could be the reason.\x1b[0m`);
