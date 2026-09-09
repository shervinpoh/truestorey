import fs from 'node:fs';
import path from 'node:path';

/* Its own reader rather than query.js's, which is private to that module. The
   fallback matters: a dataset absent from the build must make a candidate
   return null, not throw — findings() would then swallow it and the day would
   look quiet when it was actually broken. */
const load = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8'));
  } catch { return fallback; }
};

/**
 * What is worth writing about today, decided by arithmetic.
 *
 * ── WHY A FINDING IS COMPUTED AND NOT PROMPTED ─────────────────────────────
 * The pipeline that exists writes about agency announcements, and it works —
 * every article it has filed carries its source. Its ceiling is the government:
 * one to three releases a week, and some weeks none. Asking a model to "find
 * something interesting in the data" instead would break the rule the whole
 * site rests on, because the model would be choosing which number matters and
 * then writing prose to justify it.
 *
 * So the finding is arithmetic. Each candidate below is a comparison this file
 * performs, scored by how far it departs from ordinary, carrying every figure
 * with its period and agency already attached. The model receives a fixed
 * finding and writes around it. That is the same arrangement as Blindspot and
 * the morning brief: a model never assigns a number.
 *
 * ── WHY IT MUST BE ALLOWED TO FIND NOTHING ─────────────────────────────────
 * A generator that must produce something every day produces filler on the
 * days it has nothing, and filler is how a desk becomes a content farm. Every
 * candidate carries a score; nothing under MIN_SCORE is offered. A quiet
 * Tuesday files no draft, which is the same discipline as the NONE filter on
 * the news chain.
 */

/** Below this, the finding is not worth a reader's time. */
export const MIN_SCORE = 0.55;

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const round = (n, d = 0) => Number(n.toFixed(d));

/* ── the candidates ─────────────────────────────────────────────────────────
   Each returns null when it cannot run — never a zero, never a shape full of
   nulls. A check that cannot run scores nothing and says so. */

/**
 * A town whose filed median moved further this quarter than the rest.
 *
 * The comparison is against the OTHER towns in the same quarter, not against
 * its own history, because a market-wide quarter moves everything and is a
 * different story. What is notable is a town that moved when its neighbours
 * did not.
 */
function townOutlier() {
  const h = load('hdb.json', null);
  const rows = h?.rows;
  if (!Array.isArray(rows) || rows.length < 5000) return null;

  /* Whole quarters only, and never the current one. The most recent weeks are
     always thinner than they will become — HDB registers a resale after it
     completes — so a quarter still filling up would show a median drawn from
     whichever sales happened to arrive first. /methodology says this about
     every recency figure on the site; a generator that ignored it would be
     writing the site's own documented mistake. */
  const q = m => { const [y, mo] = m.split('-').map(Number); return y * 4 + Math.floor((mo - 1) / 3); };
  const qLabel = n => `${Math.floor(n / 4)}-Q${(n % 4) + 1}`;
  const latest = Math.max(...rows.map(r => q(r.month)));
  const [now, prev] = [latest - 1, latest - 2];      // latest is partial: skip it

  const byTown = new Map();
  for (const r of rows) {
    const qq = q(r.month);
    if (qq !== now && qq !== prev) continue;
    if (!Number.isFinite(r.psf)) continue;
    if (!byTown.has(r.town)) byTown.set(r.town, { now: [], prev: [], typeNow: {}, typePrev: {} });
    const t = byTown.get(r.town);
    t[qq === now ? 'now' : 'prev'].push(r.psf);
    const bucket = qq === now ? t.typeNow : t.typePrev;
    bucket[r.flatType] = (bucket[r.flatType] || 0) + 1;
  }

  const moves = [];
  for (const [town, v] of byTown) {
    /* Thirty a quarter on both sides. A town with eight sales can move 9% on
       one unusual flat, and that is a fact about the flat. */
    if (v.now.length < 30 || v.prev.length < 30) continue;
    const a = median(v.now), b = median(v.prev);
    /* ── A MEDIAN MOVES WHEN THE MIX MOVES ────────────────────────────────
       Central Area came out of the first run at +11.8% on 46 sales, which
       reads as a price story and may be a composition one: sell more
       four-rooms than three-rooms this quarter and the median psf falls
       without a single seller changing their price.

       So the share of each flat type is compared across the two quarters and
       the total absolute change reported. A town whose mix barely moved has a
       price story; one whose mix moved a lot has a mix story, and the piece
       has to say which it cannot separate. This is not a filter — it is a
       figure the article must carry. */
    const share = (counts, total) => Object.fromEntries(
      Object.entries(counts).map(([k, n]) => [k, n / total]));
    const sNow = share(v.typeNow, v.now.length), sPrev = share(v.typePrev, v.prev.length);
    const mixShift = [...new Set([...Object.keys(sNow), ...Object.keys(sPrev)])]
      .reduce((sum, k) => sum + Math.abs((sNow[k] || 0) - (sPrev[k] || 0)), 0) / 2;
    moves.push({ town, n: v.now.length, psf: a, prev: b, pct: (a / b - 1) * 100, mixShift });
  }
  if (moves.length < 8) return null;

  const mid = median(moves.map(m => Math.abs(m.pct)));
  const top = moves.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a));
  if (!mid) return null;

  const ratio = Math.abs(top.pct) / mid;
  const slug = String(top.town).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    id: `town-move-${slug}-${qLabel(now)}`,
    kind: 'town-move',
    /* Twice the ordinary move is mildly interesting; four times is a story. */
    score: Math.min(1, (ratio - 1.5) / 2.5),
    subject: top.town,
    href: `/hdb/${slug}`,
    claim: `${top.town} moved ${top.pct > 0 ? 'up' : 'down'} ${Math.abs(round(top.pct, 1))}% on the quarter `
         + `while the median town moved ${round(mid, 1)}%`,
    /* Named on the finding so the article cannot omit it. A tenth of the
       sales changing type is enough to move a median on its own. */
    caveat: top.mixShift >= 0.10
      ? `The mix of flat types sold also changed by ${Math.round(top.mixShift * 100)} points between the two quarters. `
        + 'A median moves when the mix moves, and these figures cannot separate the two.'
      : `The mix of flat types sold barely changed — ${Math.round(top.mixShift * 100)} points between the two quarters — `
        + 'so this is not simply a different set of flats being sold.',
    figures: [
      { what: `${top.town} median psf`, value: round(top.psf), period: qLabel(now), source: h.source },
      { what: 'change in the mix of flat types sold', value: `${Math.round(top.mixShift * 100)} points`, period: `${qLabel(prev)} to ${qLabel(now)}`, source: h.source },
      { what: 'the quarter before', value: round(top.prev), period: qLabel(prev), source: h.source },
      { what: 'filed resales behind it', value: top.n, period: qLabel(now), source: h.source },
      { what: 'median move across the ' + moves.length + ' towns with enough sales', value: `${round(mid, 1)}%`, period: qLabel(now), source: h.source },
    ],
    chart: { type: 'towns', top: slug, q: qLabel(now) },
  };
}

/**
 * A land award, which is a dated public event with bids attached.
 *
 * Only while it is recent: an award from three months ago is not news, and
 * dressing it as news is exactly what a content farm does.
 */
function recentAward({ now = new Date(), withinDays = 21 } = {}) {
  const g = load('gls-awards.json', null);
  const sites = g?.sites;
  if (!Array.isArray(sites) || !sites.length) return null;

  const latest = sites
    .filter(s => s.award && s.use === 'Residential')
    .sort((a, b) => String(b.award).localeCompare(String(a.award)))[0];
  if (!latest) return null;

  const age = Math.round((now - Date.parse(latest.award + 'T00:00:00Z')) / 86400000);
  if (age > withinDays || age < 0) return null;

  /* One bid on a residential site is a story about appetite; six is a story
     about competition. Both beat three, which is a Tuesday. */
  const bids = Number(latest.bids);
  const unusual = Number.isFinite(bids) ? Math.abs(bids - 3) / 4 : 0;
  return {
    id: `award-${latest.site}-${latest.award}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    kind: 'land-award',
    score: Math.min(1, 0.5 + unusual - age / (withinDays * 3)),
    subject: latest.site,
    href: '/land',
    claim: `${latest.site} was awarded on ${latest.award} with ${bids} bid${bids === 1 ? '' : 's'}`,
    figures: [
      { what: 'site', value: latest.site, period: latest.award, source: g.source },
      { what: 'bids received', value: bids, period: latest.award, source: g.source },
      { what: 'winner', value: latest.winner, period: latest.award, source: g.source },
      ...(Number.isFinite(latest.areaSqm)
        ? [{ what: 'site area', value: `${Math.round(latest.areaSqm).toLocaleString('en-SG')} sqm`, period: latest.award, source: g.source }] : []),
    ],
    chart: { type: 'bids', site: latest.site },
  };
}

/**
 * The MOP cohort, which is the most misread figure in this market.
 *
 * Worth writing precisely because it is routinely reported as incoming
 * supply. It is eligibility to sell and nothing more, and every piece built
 * on it has to say so — the caveat travels with the figure.
 */
function mopCohort() {
  const m = load('mop.json', null);
  if (!m?.towns || !m.generatedForYear) return null;

  const year = m.generatedForYear;
  const rows = Object.values(m.towns)
    .map(t => ({ town: t.town, units: t.byYear?.[year]?.units || 0 }))
    .filter(r => r.units > 0)
    .sort((a, b) => b.units - a.units);
  if (rows.length < 3) return null;

  const total = rows.reduce((a, r) => a + r.units, 0);
  const share = rows[0].units / total;
  return {
    id: `mop-${year}-${rows[0].town}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    kind: 'mop',
    /* A leader with a quarter of the cohort is a story about one town; an
       even spread is a story about nothing. */
    score: Math.min(1, (share - 0.12) / 0.2),
    subject: rows[0].town,
    href: '/mop',
    claim: `${rows[0].units.toLocaleString('en-SG')} flats in ${rows[0].town} reach their fifth year in ${year}, `
         + `${Math.round(share * 100)}% of the whole cohort`,
    caveat: 'Eligibility to sell, not an intention to sell. It is not incoming supply.',
    figures: [
      { what: `${rows[0].town} reaching MOP`, value: rows[0].units, period: String(year), source: m.source },
      { what: 'the whole cohort', value: total, period: String(year), source: m.source },
      { what: 'next largest', value: `${rows[1].town}, ${rows[1].units}`, period: String(year), source: m.source },
    ],
    chart: { type: 'mop', year },
  };
}

const CANDIDATES = [townOutlier, recentAward, mopCohort];

/**
 * Everything worth writing today, best first. Empty is a valid answer and the
 * common one.
 */
export function findings(opts = {}) {
  const out = [];
  for (const fn of CANDIDATES) {
    let f = null;
    try { f = fn(opts); } catch { f = null; }        // a broken candidate must not stop the rest
    if (f && Number.isFinite(f.score) && f.score >= MIN_SCORE) out.push(f);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The one to write about, or null on a quiet day. */
export const topFinding = (opts = {}) => findings(opts)[0] || null;
