/**
 * Where the next listings are, and what to say at the door.
 *
 * The scan this page used to lead with ranked HDB blocks by how far their own
 * sales sat below their neighbours'. True, measured, and not a job: asked
 * what it would genuinely help with, it had no answer an agent's week is
 * organised around. What moves an agent's income is finding sellers before
 * other agents do — the owners who have just become ABLE to sell, and the
 * ones who have just been given a REASON to. The records show both.
 *
 *   able   — an HDB block's minimum occupation period opening, which the first
 *            resale in a young block marks; the blocks about to reach it; and
 *            condominium buyers whose seller's stamp duty has just run out.
 *   reason — a new record price in the block, which every neighbour will hear
 *            about from someone. Better from you, with the figure.
 *
 * ── COMPUTED FROM WHATEVER IS ON DISK, NOT BUILT ──────────────────────────
 * Every list here is derived at request time from hdb.json, private.json and
 * mop.json, and cached until one of those files changes. There is no build
 * step to forget and no scan to go stale: when the data refreshes, so does
 * this. The old scan went five days without anyone noticing.
 *
 * ── WHAT THE RECORDS CANNOT SEE ───────────────────────────────────────────
 * Who owns a flat now. A buyer whose stamp duty has lapsed may have sold
 * since; a block reaching its MOP may be mostly owner-occupiers with no plan
 * to move. These are places to spend time, not names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SSD_REGIME_CHANGE } from '../calc/constants.js';

export const VERSION = '2026-09-prospect-v1';

const MONTHS = n => n; // readability at call sites
const mo = m => Number(String(m).slice(0, 4)) * 12 + Number(String(m).slice(5, 7)) - 1;
const ym = n => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
const monthOfUra = d => { const s = String(d).padStart(4, '0'); return `${2000 + Number(s.slice(2))}-${s.slice(0, 2)}`; };
const money = n => 'S$' + Math.round(n).toLocaleString('en-SG');
const typeWords = t => String(t || '').toLowerCase().replace(/^(\d) room$/, '$1-room');
const hdbHref = (town, block, street) =>
  `/hdb/${String(town).toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${`${block} ${street}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/* ── cache, keyed on the files it reads ─────────────────────────────────── */
let CACHE = null;
function load(root) {
  const f = n => path.join(root, 'data', n);
  const stamp = ['hdb.json', 'private.json', 'mop.json']
    .map(n => (fs.existsSync(f(n)) ? fs.statSync(f(n)).mtimeMs : 0)).join('|');
  if (CACHE && CACHE.stamp === stamp && CACHE.root === root) return CACHE;
  const read = n => { try { return JSON.parse(fs.readFileSync(f(n), 'utf8')); } catch { return null; } };
  CACHE = { root, stamp, hdb: read('hdb.json'), priv: read('private.json'), mop: read('mop.json') };
  return CACHE;
}
export function _clearCache() { CACHE = null; }

/** The latest month the data covers — "now" for every window below. */
function latestMonth(rows, key) {
  let m = -Infinity;
  for (const r of rows) m = Math.max(m, mo(key(r)));
  return m;
}

/**
 * HDB: young blocks whose first resale has just appeared, and blocks whose
 * flats set a new high for their type in the last 60 days.
 */
function hdbLists(hdb, { town = null }) {
  const rows = hdb.rows.filter(r => !town || r.town === town);
  const now = latestMonth(hdb.rows, r => r.month);
  const windowStart = latestMonth(hdb.rows, r => r.month) - (hdb.monthsBack || 36) + 1;

  const byBlock = new Map();
  for (const r of rows) {
    const k = `${r.town}|${r.block}|${r.street}`;
    if (!byBlock.has(k)) byBlock.set(k, []);
    byBlock.get(k).push(r);
  }

  const opened = [];
  const records = [];
  for (const [, rs] of byBlock) {
    rs.sort((a, b) => a.month.localeCompare(b.month));
    const first = rs[0];
    const lease = Number(first.leaseCommence);

    /* MOP just opened: a block young enough that its FIRST-EVER resale falls
       inside the window (lease began at most ~7 years before it), and that
       first resale is in the last six months. Older blocks' first sale in
       the window is just the window's edge, not an opening. */
    const firstMo = mo(first.month);
    if (Number.isFinite(lease) && lease >= Math.floor(windowStart / 12) - 5
        && firstMo > windowStart + 2 && now - firstMo <= MONTHS(6)) {
      opened.push({
        href: hdbHref(first.town, first.block, first.street),
        label: `Blk ${first.block} ${first.street}`, town: first.town,
        leaseCommence: lease, firstMonth: first.month, sales: rs.length,
        first: { type: first.flatType, price: first.price, storey: first.storeyRange },
        says: `The first resale here was filed in ${first.month}: a ${typeWords(first.flatType)} for ${money(first.price)}. `
          + `${rs.length > 1 ? `${rs.length - 1} more since. ` : ''}`
          + 'Owners in this block have just become able to sell, and that first price is the number they are all comparing against.',
      });
    }

    /* A new high: for each flat type with at least four sales in the window,
       the highest price, set within the last 60 days. Fewer than four sales
       and "the highest" is not saying much. */
    const byType = new Map();
    for (const r of rs) {
      if (!byType.has(r.flatType)) byType.set(r.flatType, []);
      byType.get(r.flatType).push(r);
    }
    for (const [type, ts] of byType) {
      if (ts.length < 4) continue;
      const top = ts.reduce((a, b) => (b.price > a.price || (b.price === a.price && b.month > a.month) ? b : a));
      if (now - mo(top.month) > MONTHS(2)) continue;
      const second = ts.filter(t => t !== top).reduce((a, b) => (b.price > a.price ? b : a));
      records.push({
        href: hdbHref(top.town, top.block, top.street),
        label: `Blk ${top.block} ${top.street}`, town: top.town, type, month: top.month,
        price: top.price, previous: second.price, sales: ts.length,
        says: `A ${typeWords(type)} here sold for ${money(top.price)} in ${top.month} — the highest of ${ts.length} ${typeWords(type)} sales since ${ym(windowStart)}, `
          + `${money(top.price - second.price)} above the next. Every owner of a ${typeWords(type)} in this block will hear about it.`,
      });
    }
  }
  opened.sort((a, b) => b.firstMonth.localeCompare(a.firstMonth) || b.sales - a.sales);
  records.sort((a, b) => b.month.localeCompare(a.month) || (b.price - b.previous) - (a.price - a.previous));
  return { opened, records, now: ym(now), since: ym(windowStart) };
}

/**
 * HDB blocks reaching their MOP this year or next, with no resale filed yet.
 * Years are the EARLIEST possible — MOP runs five years from key collection,
 * which the register does not carry — so this is a season, not a date.
 */
function mopSoon(mop, { town = null, thisYear }) {
  const out = [];
  for (const t of Object.values(mop?.towns || {})) {
    if (town && t.town !== town) continue;
    for (const y of [thisYear, thisYear + 1]) {
      for (const b of t.byYear?.[y]?.list || []) {
        if (b.resalesSeen > 0) continue;
        out.push({
          href: hdbHref(b.town, b.block, b.street),
          label: `Blk ${b.block} ${b.street}`, town: b.town, units: b.units,
          earliestMop: b.earliestMop, yearCompleted: b.yearCompleted,
          says: `${b.units} flats, completed ${b.yearCompleted}. The earliest these owners can sell is ${b.earliestMop} — `
            + 'nobody here has resold yet, so the first agent they hear from sets the conversation.',
        });
      }
    }
  }
  out.sort((a, b) => a.earliestMop - b.earliestMop || b.units - a.units);
  return out;
}

/**
 * Condominium buyers whose seller's stamp duty has just ended, by project.
 *
 * Bought before 4 July 2025: SSD applies for three years. On or after: four.
 * So in 2026 the lapses are all purchases from three years earlier. Counted
 * from filed purchases — new sales, sub-sales and resales alike, since each
 * starts its own clock. An executive condominium is left out: bought from a
 * developer it cannot be sold before its five-year MOP whatever SSD says.
 */
function ssdLapsed(priv, { windowMonths = 3 }) {
  const rows = priv.rows.filter(r => r.propertyType !== 'Executive Condominium');
  const now = latestMonth(priv.rows, r => monthOfUra(r.contractDate));
  const regime = mo(`${SSD_REGIME_CHANGE.getUTCFullYear()}-${String(SSD_REGIME_CHANGE.getUTCMonth() + 1).padStart(2, '0')}`);

  /* A project with no resale filed at all has, in practice, not completed:
     an owner selling now is selling a sub-sale, a different conversation
     from a resale. Read off the same file rather than assumed. */
  const resold = new Set(rows.filter(r => r.typeOfSale === '3').map(r => `${r.project}|${r.district}`));

  const byProject = new Map();
  for (const r of rows) {
    const bought = mo(monthOfUra(r.contractDate));
    const years = bought < regime ? 3 : 4;
    const ends = bought + years * 12;
    /* Lapsed in the last three months, or lapsing in the next three. */
    if (ends < now - windowMonths || ends > now + windowMonths) continue;
    const k = `${r.project}|${r.district}`;
    if (!byProject.has(k)) byProject.set(k, { project: r.project, district: r.district, segment: r.marketSegment, lapsed: 0, soon: 0, months: new Set() });
    const p = byProject.get(k);
    if (ends <= now) p.lapsed++; else p.soon++;
    p.months.add(ym(bought));
  }
  const out = [...byProject.values()]
    .filter(p => p.lapsed + p.soon >= 3)
    .map(p => ({
      project: p.project, district: String(p.district).padStart(2, '0'), segment: p.segment,
      lapsed: p.lapsed, soon: p.soon, bought: [...p.months].sort(),
      completed: resold.has(`${p.project}|${p.district}`),
      says: `${p.lapsed + p.soon} purchases here from ${[...p.months].sort()[0]} to ${[...p.months].sort().at(-1)} `
        + `${p.soon ? `${p.lapsed ? 'have just come, or are about to come,' : 'are about to come'}` : 'have just come'} out of their seller's stamp duty period. `
        + 'Those owners can now sell without the duty — some will be weighing exactly that.'
        + (resold.has(`${p.project}|${p.district}`) ? '' : ' No resale has been filed here yet, so it has likely not completed: a sale now would be a sub-sale.'),
    }))
    .sort((a, b) => (b.lapsed + b.soon) - (a.lapsed + a.soon));
  return { list: out, now: ym(now) };
}

/**
 * @param town  an HDB town to narrow the HDB lists to, or null for all
 */
export function prospect({ town = null, limit = 40, root = process.cwd() } = {}) {
  const c = load(root);
  if (!c.hdb?.rows?.length) return { ok: false, reason: 'No HDB resale data on disk.' };
  const h = hdbLists(c.hdb, { town });
  const thisYear = Number(h.now.slice(0, 4));
  const soon = c.mop ? mopSoon(c.mop, { town, thisYear }) : [];
  const ssd = c.priv?.rows?.length ? ssdLapsed(c.priv, {}) : { list: [], now: null };
  const towns = [...new Set(c.hdb.rows.map(r => r.town))].sort();

  return {
    ok: true, version: VERSION, town, towns,
    dataThrough: { hdb: h.now, private: ssd.now },
    opened: { total: h.opened.length, rows: h.opened.slice(0, limit) },
    mopSoon: { total: soon.length, rows: soon.slice(0, limit), caveat: c.mop?.caveat || null },
    records: { total: h.records.length, rows: h.records.slice(0, limit) },
    ssd: { total: ssd.list.length, rows: ssd.list.slice(0, limit) },
    sources: [
      `HDB resale prices, ${h.since} to ${h.now} (data.gov.sg, Singapore Open Data Licence v1.0)`,
      'HDB property information — completion year, for the MOP register',
      `URA private residential transactions to ${ssd.now}`,
      'IRAS seller\'s stamp duty holding periods: three years for purchases before 4 Jul 2025, four on or after',
    ],
  };
}
