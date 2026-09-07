import { getIndex, hdbIndex, ppi, sora, mop, glsAwards } from './data/query.js';

/**
 * The figures a morning brief is allowed to contain.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * /brief in the WhatsApp bot asked a model to write a Singapore market brief
 * out of nothing. It complied, and then said so itself:
 *
 *     "Note: I don't have live market feeds - this brief uses general
 *      knowledge/trends through my training data, not real-time URA/HDB
 *      caveats or Sep 2026 transactions."
 *
 * underneath a paragraph asserting that resale prices had "continued their
 * grind upward (historically 1-2% QoQ)". No source, no period, no way to check
 * it, going out under a CEA registration number. That is rule 6 and "a
 * language model never assigns a number" in one message.
 *
 * The site already holds every figure that brief was reaching for. So this
 * assembles them — each with its period, its agency and the date it was
 * retrieved — and the model writes prose AROUND numbers that are already
 * fixed. Which is the same arrangement Blindspot uses, and the reason it is
 * allowed to exist.
 *
 * ── WHAT IS DELIBERATELY NOT IN HERE ───────────────────────────────────────
 * Anything derived by comparing two sources that do not share a basis, any
 * projection, and any figure this repo would have had to invent. A brief that
 * runs short is a brief that ran out of evidence, and saying so is the point.
 *
 * Every entry carries `source` and `period`. A caller that drops them has
 * broken rule 6 and the shape of this object is meant to make that obvious.
 */

const pct = x => (typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null);
const day = s => (s ? String(s).slice(0, 10) : null);

/** Year-on-year from a quarterly series: this quarter against four back. */
function yoyOf(points) {
  if (!points || points.length < 5) return null;
  const now = points.at(-1), then = points.at(-5);
  return pct((now.index / then.index - 1) * 100);
}

export function brief(now = new Date()) {
  const figures = [];
  const missing = [];

  /* ── the two price indices ─────────────────────────────────────────────── */
  const h = hdbIndex();
  if (h?.latest) {
    figures.push({
      id: 'hdb-index',
      what: 'HDB Resale Price Index',
      value: h.latest.index,
      basis: h.base,
      qoq: pct(h.qoq),
      yoy: pct(h.yoy),
      period: h.latest.quarter,
      source: 'HDB, via data.gov.sg',
      retrieved: day(h.accessedAt),
    });
  } else missing.push('HDB Resale Price Index');

  const p = ppi();
  if (p?.series) {
    for (const [key, label] of [
      ['all', 'URA Private Residential Property Price Index, all residential'],
      ['nonLanded', 'URA private index, non-landed'],
      ['landed', 'URA private index, landed'],
    ]) {
      const pts = p.series[key]?.points;
      if (!pts?.length) continue;
      figures.push({
        id: 'ura-' + key,
        what: label,
        value: pts.at(-1).index,
        basis: p.base,
        yoy: yoyOf(pts),
        period: pts.at(-1).quarter,
        source: 'URA, via SingStat Table Builder',
        retrieved: day(p.accessedAt),
        /* Both indices share 1Q2009 = 100, which is the only reason they may
           be set beside each other without either being rebased here. */
        comparableWith: 'hdb-index',
      });
    }
  } else missing.push('URA Private Residential Property Price Index');

  /* ── the mortgage rate, when MAS is answering ──────────────────────────── */
  const s = sora();
  if (s?.latest) {
    figures.push({
      id: 'sora',
      what: 'SORA, 3-month compounded',
      value: s.latest.rate ?? s.latest.value ?? null,
      period: day(s.latest.date),
      source: 'MAS',
      retrieved: day(s.accessedAt),
    });
  } else missing.push('SORA (npm run ingest:sora has not run)');

  /* ── what is actually filing ───────────────────────────────────────────── */
  const idx = getIndex();
  const transactions = idx?.hdb ? {
    hdb: {
      from: idx.hdb.period?.from, to: idx.hdb.period?.to,
      towns: Object.keys(idx.hdb.towns || {}).length,
      source: idx.hdb.source, retrieved: day(idx.hdb.accessedAt),
    },
    private: {
      from: idx.private?.period?.from, to: idx.private?.period?.to,
      districts: Object.keys(idx.private?.districts || {}).length,
      source: idx.private?.source, retrieved: day(idx.private?.accessedAt),
    },
  } : null;
  if (!transactions) missing.push('filed transactions');

  /* ── supply reaching the resale market ─────────────────────────────────── */
  let mopBlock = null;
  const m = mop();
  if (m?.towns) {
    const year = Number(m.generatedForYear);
    const tally = (y) => {
      let blocks = 0, units = 0; const towns = [];
      for (const t of Object.values(m.towns)) {
        const e = Object.values(t.byYear || {}).find(x => Number(x.year) === y);
        if (!e) continue;
        blocks += e.blocks; units += e.units;
        towns.push({ town: t.town, blocks: e.blocks, units: e.units });
      }
      towns.sort((a, b) => b.units - a.units);
      return { year: y, blocks, units, topTowns: towns.slice(0, 3) };
    };
    mopBlock = {
      thisYear: tally(year),
      nextYear: tally(year + 1),
      source: m.source,
      retrieved: day(m.accessedAt),
      /* The register says when a flat BECOMES eligible, never that anyone
         intends to sell. The brief must not turn one into the other. */
      caveat: 'Eligibility to sell, not an intention to sell.',
    };
  } else missing.push('MOP register');

  /* ── the newest land price on the record ───────────────────────────────── */
  let glsBlock = null;
  const g = glsAwards();
  if (g?.sites?.length) {
    const awarded = g.sites.filter(x => x.award)
      .sort((a, b) => String(b.award).localeCompare(String(a.award)));
    const latest = awarded[0];
    const thisYear = awarded.filter(x => String(x.award).slice(0, 4) === String(now.getFullYear())).length;
    if (latest) {
      glsBlock = {
        latestAward: {
          date: latest.award, site: latest.site, use: latest.useFull || latest.use,
          lease: latest.lease, bids: latest.bids, winner: latest.winner,
          areaSqm: latest.areaSqm, planningArea: latest.planningArea,
        },
        awardsThisYear: thisYear,
        source: g.source,
        retrieved: day(g.accessedAt),
      };
    }
  } else missing.push('GLS awards');

  return {
    builtAt: now.toISOString(),
    figures,
    transactions,
    mop: mopBlock,
    gls: glsBlock,
    /* Named, not omitted. Silent truncation reads as completeness, and a brief
       that quietly drops the mortgage rate is worse than one that says the
       rate could not be read this morning. */
    missing,
  };
}
