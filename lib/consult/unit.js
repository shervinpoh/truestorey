/**
 * The unit itself — facing, corner or corridor, view, noise, condition.
 *
 * ── WHY THE NUMBER IS YOURS AND NOT THE DATA'S ────────────────────────────
 * No public record says which unit sold. HDB files a three-storey band, URA a
 * five-storey band, and neither files a unit number, so there is nothing to
 * measure "a corner is worth 3%" from. Any per-attribute figure built in here
 * would be one somebody remembered, printed under a CEA registration number.
 * So the tool does not assign one. The agent has stood in the unit and the
 * records have not; the adjustment is theirs, labelled as theirs.
 *
 * ── WHAT IS MEASURED: HOW FAR IT CAN GO ───────────────────────────────────
 * Hold everything the records DO carry constant — same block or project,
 * same layout, same exact size, same storey band, same quarter — and what is
 * left between two sales is the unit: facing, position, outlook, noise,
 * condition, and the negotiation. The spread of those groups is the most the
 * unit can move a price here, all of it together. Measured on the full files
 * (Sep 2026): same-floor HDB pairs typically 2.7% apart and one in ten more
 * than 8%; condo resales 2.4% and 7.7%; developer price lists — set by people
 * who know exactly which way every stack faces — 1.0% and 4.1%.
 *
 * The limits below are ONE UNIT AGAINST THE TYPICAL ONE, not the gap between
 * two units. An adjustment says "this flat against a typical flat on these
 * floors", and the gap between two random flats is about √2 times that. Each
 * sale's distance from its group's mean is scaled by √(n/(n−1)), because the
 * mean was estimated from the same few sales and sits closer to them than
 * the true centre does — a pair would otherwise read as half its spread.
 *
 * ── BESIDE THE RANGE, NEVER INSIDE IT ─────────────────────────────────────
 * The estimate is backtested. This is not, and cannot be: there is no record
 * of which past sales were corner units to test it against. So the measured
 * range is never changed; the adjusted one is printed on its own line, the
 * same way the stack premium is.
 */
import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '2026-09-unit-v1';

/**
 * Same-floor groups a block or project needs before its own spread is used.
 * Ten groups is twenty-odd sales; a tenth-percentile read off fewer is a
 * reading of one or two flats. Below it the ladder widens to the town or
 * district, and says so.
 */
export const MIN_GROUPS = 10;

/** Past this it is a different property, not a different unit. */
export const MAX_ADJUST = 0.2;

/**
 * What an agent can see at a viewing and no record can. Labels only: none of
 * these carries a number, and none moves the range by itself. They are the
 * stated reasons for the adjustment, so a client reading it can see why.
 */
export const FACTORS = [
  { key: 'corner', label: 'Corner unit', better: true },
  { key: 'view', label: 'Unblocked view', better: true },
  { key: 'facing', label: 'North or south facing', better: true },
  { key: 'renovated', label: 'Renovated, move-in ready', better: true },
  { key: 'layout', label: 'Efficient layout', better: true },
  { key: 'quiet', label: 'Quiet side', better: true },
  { key: 'corridor', label: 'Faces the common corridor', better: false },
  { key: 'westSun', label: 'Afternoon (west) sun', better: false },
  { key: 'blocked', label: 'Blocked view', better: false },
  { key: 'needsWork', label: 'Needs work', better: false },
  { key: 'awkward', label: 'Awkward layout or wasted space', better: false },
  { key: 'noisy', label: 'Road, MRT or school noise', better: false },
];

const quarter = m => `${m.slice(0, 4)}Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`;
const uraMonth = d => { const s = String(d).padStart(4, '0'); return `${2000 + Number(s.slice(2))}-${s.slice(0, 2)}`; };
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const P = x => `${(100 * x).toFixed(1)}%`;
const money = n => 'S$' + Math.round(n).toLocaleString('en-SG');
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const LANDED = /terrace|detached|semi/i;

/* ── the spreads, built once per data file ─────────────────────────────── */
let CACHE = null;
export function _clearCache() { CACHE = null; }

function build(root) {
  const f = n => path.join(root, 'data', n);
  const stamp = ['hdb.json', 'private.json'].map(n => (fs.existsSync(f(n)) ? fs.statSync(f(n)).mtimeMs : 0)).join('|');
  if (CACHE && CACHE.stamp === stamp && CACHE.root === root) return CACHE;
  const read = n => { try { return JSON.parse(fs.readFileSync(f(n), 'utf8')); } catch { return null; } };

  const buckets = new Map();
  const bucket = k => {
    if (!buckets.has(k)) buckets.set(k, { devs: [], groups: 0, sales: 0, from: null, to: null });
    return buckets.get(k);
  };
  /* Every group with two or more sales contributes each sale's distance from
     the group's centre, to every scope the group belongs to. Weighted 1/n so
     each GROUP counts once: a launch weekend that sold forty identical units
     would otherwise outvote four hundred resale blocks. */
  const flush = groups => {
    for (const g of groups.values()) {
      const n = g.psf.length;
      if (n < 2) continue;
      const logs = g.psf.map(Math.log);
      const mean = logs.reduce((s, x) => s + x, 0) / n;
      const scale = Math.sqrt(n / (n - 1));
      for (const k of g.scopes) {
        const b = bucket(k);
        b.groups++; b.sales += n;
        for (const x of logs) b.devs.push({ d: Math.abs(x - mean) * scale, w: 1 / n });
        for (const m of g.months) {
          if (!b.from || m < b.from) b.from = m;
          if (!b.to || m > b.to) b.to = m;
        }
      }
    }
  };
  const add = (groups, key, psf, month, scopes) => {
    if (!Number.isFinite(psf) || psf <= 0) return;
    if (!groups.has(key)) groups.set(key, { psf: [], months: [], scopes });
    const g = groups.get(key);
    g.psf.push(psf); g.months.push(month);
  };

  const hdb = read('hdb.json');
  if (hdb?.rows?.length) {
    const G = new Map();
    for (const r of hdb.rows) {
      /* The layout (flat model) is in the key: a maisonette and an apartment
         of one size in one block are different homes, and the gap between
         them is not the unit's position. */
      add(G, `${r.block}|${r.street}|${r.flatType}|${r.model}|${r.areaSqm}|${r.storeyRange}|${quarter(r.month)}`,
        r.psf, r.month, [`block:${r.block}|${r.street}`, `town:${r.town}`, 'island:HDB']);
    }
    flush(G);
  }

  const priv = read('private.json');
  if (priv?.rows?.length) {
    const G = new Map();
    for (const r of priv.rows) {
      /* Landed homes have no storey band to hold constant, and a bulk
         purchase files one price for several units. */
      if (!r.floorRange || r.floorRange === '-' || LANDED.test(r.propertyType) || (r.noOfUnits || 1) !== 1) continue;
      const m = uraMonth(r.contractDate);
      const proj = `project:${norm(r.project)}|${String(r.district).padStart(2, '0')}`;
      /* A developer prices every stack and floor separately, so new sales
         are kept apart from resales: their spread is the developer's own
         stack ladder, a different thing from what owners later accept. */
      const resale = r.typeOfSale !== '1';
      const scopes = resale
        ? [`${proj}:resale`, `district:${String(r.district).padStart(2, '0')}:resale`, 'island:PRIVATE:resale']
        : [`${proj}:new`];
      /* Street is in the key because some URA project names are catch-alls
         that span dozens of streets. */
      add(G, `${r.project}|${r.street}|${r.typeOfSale === '1' ? 'n' : 'r'}|${r.areaSqm}|${r.floorRange}|${quarter(m)}`, r.psf, m, scopes);
    }
    flush(G);
  }

  CACHE = { root, stamp, buckets };
  return CACHE;
}

function quantiles(devs) {
  const s = [...devs].sort((a, b) => a.d - b.d);
  const tot = s.reduce((t, x) => t + x.w, 0);
  const at = p => {
    let acc = 0;
    for (const x of s) { acc += x.w; if (acc >= p * tot) return x.d; }
    return s.at(-1).d;
  };
  /* Measured on logs, reported as the percentage it means. */
  const pct = d => Number((Math.exp(d) - 1).toFixed(4));
  return { typical: pct(at(0.5)), oneInFour: pct(at(0.75)), oneInTen: pct(at(0.9)) };
}

/**
 * How far one unit sells from the typical one on the same floors, for the
 * narrowest scope that has enough evidence.
 */
export function unitSpread(rec, { root = process.cwd() } = {}) {
  if (!rec) return { ran: false, why: 'No property chosen.' };
  if (rec.kind !== 'HDB' && rec.landed) {
    return {
      ran: false,
      why: 'Not measured for landed homes: there is no storey band to hold constant, and too few same-size sales on one street in one quarter to compare. Any adjustment you set has no measured limit beside it.',
    };
  }
  const c = build(root);
  const isHdb = rec.kind === 'HDB';
  const d = String(rec.district ?? '').padStart(2, '0');
  const proj = `project:${norm(rec.project || rec.label)}|${d}`;
  const ladder = isHdb
    ? [
      { key: `block:${rec.block}|${rec.street}`, scope: 'block', where: 'this block', intro: 'In this block', basis: 'resale' },
      { key: `town:${rec.town}`, scope: 'town', where: `HDB blocks in ${titleCase(rec.town)}`, intro: `Across HDB blocks in ${titleCase(rec.town)}`, basis: 'resale' },
      { key: 'island:HDB', scope: 'island', where: 'HDB blocks island-wide', intro: 'Across HDB blocks island-wide', basis: 'resale' },
    ]
    : [
      { key: `${proj}:resale`, scope: 'project', where: 'this development', intro: 'In this development', basis: 'resale' },
      { key: `${proj}:new`, scope: 'project', where: "this development's launch prices", intro: "In this development's launch prices", basis: 'developer price list' },
      { key: `district:${d}:resale`, scope: 'district', where: `District ${d} developments`, intro: `Across District ${d} developments`, basis: 'resale' },
      { key: 'island:PRIVATE:resale', scope: 'island', where: 'private developments island-wide', intro: 'Across private developments island-wide', basis: 'resale' },
    ];

  const own = c.buckets.get(ladder[0].key);
  const hit = ladder.find(l => (c.buckets.get(l.key)?.groups || 0) >= MIN_GROUPS);
  if (!hit) return { ran: false, why: 'Too few same-floor sales anywhere in the data to measure how far one unit sells from another.' };
  const b = c.buckets.get(hit.key);
  const q = quantiles(b.devs);

  const held = isHdb
    ? 'same block, same layout, same size, same three-storey band, same quarter'
    : 'same development, same size, same five-storey band, same quarter';
  return {
    ran: true,
    version: VERSION,
    scope: hit.scope,
    where: hit.where,
    basis: hit.basis,
    groups: b.groups,
    sales: b.sales,
    ...q,
    period: { from: b.from, to: b.to },
    held,
    /* Why the ladder widened, when it did. A town's spread printed as if it
       were this block's is the silent-truncation failure in another form. */
    widened: hit.key === ladder[0].key ? null
      : `${own?.groups || 0} same-floor group${(own?.groups || 0) === 1 ? '' : 's'} at this ${isHdb ? 'block' : 'development'} — too few to measure it alone (${MIN_GROUPS} needed), so this is ${hit.where}.`,
    says: `${hit.intro}, half of units on the same floors (${held}) sold within ${P(q.typical)} of the typical one; `
      + `one in four more than ${P(q.oneInFour)} away; one in ten more than ${P(q.oneInTen)}.`,
    what: hit.basis === 'developer price list'
      ? 'This is the developer pricing its own stacks: facing, position and view, set by people who know every unit.'
      : 'That spread is facing, corner or corridor, view, noise, condition and the negotiation, all together — the most those have moved a price here.',
    source: isHdb
      ? `HDB resale prices ${b.from} to ${b.to} (data.gov.sg, Singapore Open Data Licence v1.0) · ${b.groups.toLocaleString('en-SG')} same-floor groups, ${b.sales.toLocaleString('en-SG')} sales`
      : `URA private residential transactions ${b.from} to ${b.to} · ${b.groups.toLocaleString('en-SG')} same-floor groups, ${b.sales.toLocaleString('en-SG')} sales`,
  };
}

/**
 * Read an adjustment typed by a person: "3", "+2.5", "-3", "−3" (a typed
 * minus from a phone keyboard), "2%". Returns a fraction, 0 for nothing
 * typed, or NaN for something that is not a number.
 *
 * The panel's own numeric reader strips every character that is not a digit
 * or a point, sign included — so "-3" would arrive as +3, the one failure
 * this field cannot afford. The raw text comes here instead.
 */
export function parsePct(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v / 100 : NaN;
  const s = String(v ?? '').trim().replace(/[−–—]/g, '-').replace(/[%\s,]/g, '');
  if (!s) return 0;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s) / 100;
}

/**
 * The agent's adjustment applied beside the estimate.
 *
 * @param est    the AVM result (the full one — the point is not needed, the
 *               band is)
 * @param input  { pct: "3" | 3, factors: ['corner', …], note, onReport }
 * @param spread unitSpread() for the same record, or null
 * @returns null when nothing was entered; otherwise { ok, … }
 */
export function unitAdjust(est, input = {}, spread = null) {
  const pct = parsePct(input?.pct);
  const keys = new Set((Array.isArray(input?.factors) ? input.factors : []).map(String));
  const factors = FACTORS.filter(f => keys.has(f.key)).map(({ key, label, better }) => ({ key, label, better }));
  const note = String(input?.note ?? '').trim().slice(0, 240) || null;
  const onReport = input?.onReport === true;
  if (pct === 0 && !factors.length && !note) return null;

  if (Number.isNaN(pct)) {
    return { ok: false, why: `Could not read "${String(input.pct).slice(0, 20)}" as an adjustment. Type a percentage such as 3 or -2.` };
  }
  if (!est?.ok || !est.band) return { ok: false, why: 'The estimate did not run, so there is no range to adjust.' };
  if (Math.abs(pct) > MAX_ADJUST) {
    return {
      ok: false,
      why: `${pct > 0 ? '+' : '−'}${P(Math.abs(pct))} is beyond what the unit itself explains — past ${P(MAX_ADJUST)} it is a different property, not a different unit. Check the size, storey and type first.`,
    };
  }

  /* To the thousand: a judgement printed to the dollar claims a precision
     nobody standing in a living room has. */
  const b = est.band;
  const band = {
    psfLow: Math.round(b.psfLow * (1 + pct)),
    psfHigh: Math.round(b.psfHigh * (1 + pct)),
    priceLow: Math.round(b.priceLow * (1 + pct) / 1000) * 1000,
    priceHigh: Math.round(b.priceHigh * (1 + pct) / 1000) * 1000,
  };

  const a = Math.abs(pct);
  const beyond = spread?.ran ? (a > spread.oneInTen ? 'oneInTen' : a > spread.oneInFour ? 'oneInFour' : null) : null;
  const caution = beyond === 'oneInTen'
    ? `Only one unit in ten on the same floors sells more than ${P(spread.oneInTen)} from the typical one (${spread.where}). At ${P(a)} this unit has to be among the most unusual on its floors — be ready to show a buyer why.`
    : beyond === 'oneInFour'
      ? `Inside what happens, at the edge of it: one unit in four on the same floors sells more than ${P(spread.oneInFour)} from the typical one (${spread.where}).`
      : null;

  const up = factors.filter(f => f.better).length;
  const down = factors.length - up;
  const mismatch = pct > 0 && down && !up ? 'You ticked only things that lower a price, and moved it up. Check the sign.'
    : pct < 0 && up && !down ? 'You ticked only things that raise a price, and moved it down. Check the sign.'
      : null;

  return {
    ok: true,
    version: VERSION,
    basis: 'judgement',
    pct,
    factors,
    note,
    onReport,
    band,
    from: { priceLow: b.priceLow, priceHigh: b.priceHigh, psfLow: b.psfLow, psfHigh: b.psfHigh },
    spread,
    beyond,
    caution,
    mismatch,
    says: pct === 0
      ? 'No adjustment set — what you ticked is recorded and the range is unchanged.'
      : `Moved ${pct > 0 ? 'up' : 'down'} ${P(a)} for the unit itself: ${money(band.priceLow)} – ${money(band.priceHigh)}.`,
  };
}

/**
 * What a client may read of it, when the agent has chosen to show it: the
 * adjusted range, the reasons, and the measured spread for scale. The
 * cautions and the sign check are the agent's working and stay behind.
 */
export function clientUnit(u) {
  if (!u?.ok || u.onReport !== true) return null;
  return {
    ok: true,
    basis: u.basis,
    pct: u.pct,
    factors: u.factors,
    note: u.note,
    band: u.band,
    onReport: true,
    spread: u.spread?.ran
      ? { ran: true, typical: u.spread.typical, oneInFour: u.spread.oneInFour, oneInTen: u.spread.oneInTen,
          where: u.spread.where, held: u.spread.held, says: u.spread.says, what: u.spread.what,
          widened: u.spread.widened, source: u.spread.source }
      : null,
  };
}
