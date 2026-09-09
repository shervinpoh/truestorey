import fs from 'node:fs';
import path from 'node:path';

/* Its own reader rather than query.js's, which is private to that module. The
   fallback matters: a dataset absent from the build must make a candidate
   return null, not throw — findings() would then swallow it and the day would
   look quiet when it was actually broken. */
import { storeysIn } from './blindspot/measure.js';
import { sunsetArc, bearingTo } from './sun.js';
import { haversine } from './geo.js';

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


/**
 * A town whose floor premium departs from the rest of the country.
 *
 * The premium is measured WITHIN a building — the same block, different storey
 * bands — never by comparing a high floor here against a low floor elsewhere,
 * which would be measuring the neighbourhood. storey.json carries that
 * distribution nationally and by town, so the comparison is like against like.
 *
 * Worth writing because it is the figure buyers argue about with no evidence
 * at all: everyone knows a higher floor costs more, almost nobody knows how
 * much, and the answer turns out to differ by where you are.
 */
function floorPremium() {
  const st = load('storey.json', null);
  const groups = st?.hdb?.groups;
  const national = st?.hdb?.national;
  if (!groups || !national) return null;

  /* One flat type, so the comparison is like for like. 4 ROOM is the most
     transacted, which means the thickest sample in most towns. */
  const TYPE = '4 ROOM';
  const nat = national[TYPE]?.within;
  if (!nat?.p50) return null;

  const rows = [];
  for (const [town, byType] of Object.entries(groups)) {
    const w = byType?.[TYPE]?.within;
    /* Twenty buildings before a town's own distribution means anything. Below
       that the median is one or two blocks and the town name is decoration. */
    if (!w?.p50 || !(w.n >= 20)) continue;
    rows.push({ town, p50: w.p50, n: w.n, neg: w.neg });
  }
  if (rows.length < 6) return null;

  const top = rows.reduce((a, b) =>
    (Math.abs(b.p50 - nat.p50) > Math.abs(a.p50 - nat.p50) ? b : a));
  const gap = top.p50 - nat.p50;

  return {
    id: `floor-premium-${top.town}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    kind: 'floor-premium',
    /* Three points off the national median is noticeable; eight is a story. */
    score: Math.min(1, (Math.abs(gap) - 2) / 6),
    subject: top.town,
    href: `/floors`,
    claim: `In ${top.town}, a ${TYPE.toLowerCase()} on a high floor carries `
         + `${round(top.p50, 1)}% more per square foot than a low one in the same block, `
         + `against ${round(nat.p50, 1)}% nationally`,
    caveat: `Measured inside single buildings — ${top.n} of them in ${top.town} — never by `
          + 'comparing a high floor in one block against a low floor in another, which would be '
          + `measuring the neighbourhood instead. In ${top.neg} of those buildings the premium ran `
          + 'the other way.',
    figures: [
      { what: `${top.town} floor premium, ${TYPE.toLowerCase()}`, value: `${round(top.p50, 1)}%`,
        period: st.builtAt?.slice(0, 10), source: st.source },
      { what: 'national median premium', value: `${round(nat.p50, 1)}%`,
        period: st.builtAt?.slice(0, 10), source: st.source },
      { what: `buildings measured in ${top.town}`, value: top.n,
        period: st.builtAt?.slice(0, 10), source: st.source },
      { what: 'of those, where the premium ran the other way', value: top.neg,
        period: st.builtAt?.slice(0, 10), source: st.source },
    ],
    chart: { type: 'floors', town: top.town },
  };
}

/**
 * A tall approval standing where somebody's afternoon sun comes from.
 *
 * The site can already answer this for one address. As a finding it runs the
 * other way: take the tallest recent permitted residential approval and ask
 * which blocks have it on their sunset bearings.
 *
 * It says nothing about whether anything is blocked — that needs the heights
 * and footprints of everything in between and no dataset here carries them.
 * What it reports is a filed decision, a bearing, and a distance.
 */
function approvalInTheSun({ now = new Date(), withinDays = 120 } = {}) {
  const pl = load('planning.json', null);
  const comps = load('comps.json', null);
  const decisions = pl?.decisions;
  const records = comps?.records;
  if (!Array.isArray(decisions) || !records) return null;

  const since = new Date(now.getTime() - withinDays * 86400000).toISOString().slice(0, 10);
  /* ── EVERY CANDIDATE, NOT JUST THE TALLEST ────────────────────────────────
     The first version took the single tallest approval in the window and
     returned null when nothing sat in its arc — so a 30-storey block with no
     neighbours to the west silenced a 22-storey one with thirty. Nine
     approvals qualified and it looked at one.

     Height is not the story on its own; height AND how many people it stands
     in front of is. That is what the score already says, so the score has to
     see all of them. */
  const candidates = [];
  for (const d of decisions) {
    if (!d.permitted || !Number.isFinite(d.lat) || !d.date || d.date < since) continue;
    /* ── A NEW ERECTION, NOT PAPERWORK ON AN OLD ONE ──────────────────────
       The first run of this found a 63-storey approval dated 2026-07-24 and
       would have written that a 63-storey tower was coming. The decision was
       "PROPOSED REGULARISATION OF GFA AND AMENDMENT TO THE APPROVED
       CONDOMINIUM HOUSING DEVELOPMENT" — an administrative amendment to a
       permission already granted, quite possibly for a building that is
       already standing.

       URA's own applType says which is which. "Amendment to New Erection" and
       "Extension of Written Permission" are the same building being re-papered
       and carry the same storey count in their text, so a height filter alone
       cannot tell them apart. Only a new erection is news. */
    if (!/^New Erection$/i.test(String(d.applType || ''))) continue;
    const storeys = storeysIn(d.what);
    if (!storeys || storeys < 12) continue;              // a 3-storey house shades nobody
    candidates.push({ ...d, storeys });
  }
  if (!candidates.length) return null;

  /* Which addresses have it on a sunset bearing. The arc is the same one the
     record pages draw; 500m because beyond that a building's own height stops
     being the deciding factor. */
  const reach = d => {
    const arc = sunsetArc(d.lat);
    const hit = [];
    for (const [href, r] of Object.entries(records)) {
      if (!Number.isFinite(r.lat)) continue;
      const m = haversine(r.lat, r.lon, d.lat, d.lon);
      if (m > 500) continue;
      const b = bearingTo(r.lat, r.lon, d.lat, d.lon);
      if (b < arc.from || b > arc.to) continue;
      hit.push({ href, label: r.label, m: Math.round(m), bearing: Math.round(b) });
    }
    hit.sort((a, b) => a.m - b.m);
    /* ── HEIGHT ALONE IS NOT THE STORY ───────────────────────────────────
       The first scoring was height plus a little reach, so a 30-storey block
       with ONE address 494m away — the far edge of the radius — scored 0.83
       and would have led the morning. Thirty storeys is only news if it
       stands in front of somebody.

       Half height, half reach, and three addresses before it counts at all.
       A 30-storey with three neighbours now scores 0.43 and stays quiet; the
       same building with fifteen scores 0.83 and does not. */
    const score = hit.length < 3 ? 0
      : Math.min(1, ((d.storeys - 10) / 30) * 0.5 + (Math.min(hit.length, 15) / 15) * 0.5);
    return { arc, hit, score };
  };

  let best = null, arc = null, hit = null;
  for (const d of candidates) {
    const r = reach(d);
    if (!r.score) continue;
    if (!best || r.score > best._score) { best = { ...d, _score: r.score }; arc = r.arc; hit = r.hit; }
  }
  if (!best) return null;

  return {
    id: `sun-approval-${best.ref || best.date}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    kind: 'sun-approval',
    /* Height and reach both matter: a 40-storey block with two neighbours in
       its arc is a smaller story than a 20-storey one with thirty. */
    score: best._score,
    subject: hit[0].label,
    href: hit[0].href,
    claim: `A ${best.storeys}-storey development was permitted on ${best.date}, and it stands on the `
         + `bearing the afternoon sun arrives from for ${hit.length} `
         + `address${hit.length === 1 ? '' : 'es'} within 500m — the nearest ${hit[0].m}m away`,
    caveat: 'This says nothing about whether anything is blocked. A shadow needs the height and '
          + 'footprint of every building in between and no public dataset here carries them. A '
          + 'permission is also not a building: some are never started.',
    figures: [
      { what: 'approved', value: `${best.storeys} storeys`, period: best.date, source: pl.source },
      { what: 'addresses with it on a sunset bearing, within 500m', value: hit.length,
        period: best.date, source: pl.source },
      { what: 'nearest', value: `${hit[0].label}, ${hit[0].m}m at ${hit[0].bearing}\u00B0`,
        period: best.date, source: pl.source },
      { what: 'the sunset arc here', value: `${Math.round(arc.from)}\u00B0 to ${Math.round(arc.to)}\u00B0`,
        period: 'across the year', source: 'Solar position from the coordinate' },
    ],
    chart: { type: 'sun', ref: best.ref },
  };
}

const CANDIDATES = [townOutlier, recentAward, mopCohort, floorPremium, approvalInTheSun];

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
