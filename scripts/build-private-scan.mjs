/**
 * Which condominiums trade below what their own district says they should,
 * and whether a big unit is dear or cheap where you are standing.
 *
 * ── WHY A RAW PROJECT-VS-DISTRICT MEDIAN IS WORTHLESS ─────────────────────
 * "This project trades 14% under its district" is almost always a sentence
 * about something other than value. A 99-year project in a district full of
 * freehold is not cheap. A 1998 project beside a 2019 one is not cheap. A
 * project of 1,500 sqft units has a lower psf than one of 600 sqft units by
 * arithmetic. A project whose recent sales happened to be on low floors is
 * not cheap either, and nor is one that last transacted in 2021.
 *
 * So every one of those is controlled for before anything is called cheap.
 * Within each district a hedonic fit explains log(psf) from size, tenure,
 * remaining lease, floor and property type, and a project's position is what
 * is LEFT after all of it. Same discipline as the storey curve that turned
 * out to be measuring building age, and the stack premium that turned out to
 * be measuring which floors happened to sell.
 *
 * ── AND WHY THE PERSISTENCE TEST DECIDES WHETHER THIS SHIPS ───────────────
 * A residual can be a real, durable discount or it can be the last eleven
 * sales being unlucky. The two look identical in a ranking. The only way to
 * tell them apart is to ask whether a project's position PERSISTS: fit the
 * early half, fit the late half, and see whether the early residual predicts
 * the late one across projects. If it does not, the ranking is noise wearing
 * a decimal point and it should not be farmed off. The figure is published
 * whichever way it comes out.
 *
 * ── THE LEVEL IS NOT THE SIGNAL. THE MOVE IS. ─────────────────────────────
 * The first build of this ranked projects by that residual and the two ends
 * of the list were Ardmore Park, Nassim Park and the Ritz-Carlton Residences
 * at the top, Wing Fong Court and Wing Fong Mansions at the bottom. That is
 * not a list of mispricings. It is a list of ADDRESSES, and it tells an agent
 * who works this market precisely nothing he did not know before breakfast.
 *
 * What the fit is really measuring there is everything it was never given:
 * prestige, outlook, the road outside, how the block was built. Those are
 * real, they are why the residual persists at r=0.81, and they are not an
 * opportunity — Ardmore Park is not overpriced by 72%.
 *
 * The signal is a project moving against ITS OWN level. Ardmore Park at +60%
 * when it has always been +72% is the finding. So the level is reported as
 * context and the DRIFT is what gets ranked, measured across thirds of the
 * window so the middle third can referee whether a move carries on or comes
 * back.
 *
 * ── AND THE MOVE IS MOSTLY THE DISTRICT'S, NOT THE PROJECT'S ──────────────
 * Ranking by drift put Marina One, Scotts Square, Corals at Keppel Bay and
 * Cliveden at Grange at the cheapening end and Bishan 8, Kovan Melody and
 * Waterview at the firming end — CCR and Sentosa down, OCR up. That is a
 * true and useful thing about this market, and it is also not a fact about
 * any of those projects. Every psf here is restated on the NATIONAL index,
 * so a district that has lagged the nation drags every project in it down
 * together.
 *
 * So the drift is split. The district's own average move is reported as what
 * it is — the segment story — and each project is then measured against its
 * OWN district's move. What survives that is the part that belongs to the
 * building.
 *
 * ── SIZE ──────────────────────────────────────────────────────────────────
 * The coefficient on log(area) IS the size gradient, per district, and it
 * falls out of the same fit rather than needing a second tool. Negative means
 * bigger units carry a lower psf there — the usual shape — and the size of it
 * says how much. Where it is unusually flat or positive, large units are
 * expensive relative to small ones, which is a different conversation with a
 * downgrader than with an upgrader.
 */
import fs from 'node:fs';
import path from 'node:path';
import { timebase } from '../lib/consult/timebase.js';

const ROOT = process.cwd();
export const VERSION = '2026-09-private-scan-v1';

/* Non-landed private only. An EC's discount is about who may buy it, not
   about the building, and landed has no psf comparability with a flat. */
const TYPES = new Set(['Condominium', 'Apartment']);
/* Resale only. A new sale is priced by a developer against a launch book, not
   by the market against its neighbours, and mixing the two puts a developer's
   pricing decision into a signal about second-hand value. */
const RESALE = '3';

/** A project needs this many resales before it gets a position at all. */
const MIN_PROJECT_SALES = 8;
/**
 * A "project" spanning more streets than this is not a project.
 *
 * URA files unnamed developments under catch-all names, and RESIDENTIAL
 * APARTMENTS covers 90 different streets. Ranked as one row it is ninety
 * buildings averaged together and presented as a building, which is the most
 * confidently wrong thing in a farming list. A genuinely large development
 * can carry two or three street names; ninety cannot.
 */
const MAX_STREETS = 3;
/** A district needs this many before its own fit means anything. */
const MIN_DISTRICT_SALES = 300;
/** And this many in EACH half before it is used in the persistence test. */
const MIN_HALF = 5;

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const ym = d => { const s = String(d).padStart(4, '0'); return (2000 + Number(s.slice(2))) + '-' + s.slice(0, 2); };
const mo = m => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));

/** OLS with an intercept. Returns coefficients, or null if singular. */
function fit(X, y) {
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const b = Array.from({ length: k }, (_, i) => X.reduce((s, r, n) => s + r[i] * y[n], 0));
  for (let i = 0; i < k; i++) {
    const p = A[i][i];
    if (!p || Math.abs(p) < 1e-12) return null;
    for (let j = i; j < k; j++) A[i][j] /= p;
    b[i] /= p;
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = A[r][i];
      for (let j = i; j < k; j++) A[r][j] -= f * A[i][j];
      b[r] -= f * b[i];
    }
  }
  return b;
}
const pearson = (a, b) => {
  const n = a.length; if (n < 3) return null;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
};

/** Every row, cleaned and with its confounds made numeric. */
function rowsFor() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'private.json'), 'utf8')).rows;
  const tb = timebase('PRIVATE', 'Condominium', { asOf: new Date() });
  const out = [];
  for (const r of raw) {
    if (r.typeOfSale !== RESALE || !TYPES.has(r.propertyType)) continue;
    if (!(r.psf > 0) || !(r.areaSqm > 0)) continue;

    const month = ym(r.contractDate);
    const year = Number(month.slice(0, 4));
    const t = String(r.tenure || '');
    /* A 999- or 9999-year lease behaves like freehold and is treated as one;
       calling it "99 years remaining" would put it in the wrong cohort. */
    const yrs = Number((t.match(/^(\d+)\s*yrs/) || [])[1]) || null;
    const freehold = /freehold/i.test(t) || (yrs !== null && yrs > 900);
    const start = Number((t.match(/commencing from (\d{4})/) || [])[1]) || null;
    let remaining = null;
    if (!freehold && yrs && start) remaining = yrs - (year - start);
    if (!freehold && !(remaining > 0)) continue;   // unparseable tenure is dropped, not guessed

    const fm = String(r.floorRange).match(/^(\d+)\s*-\s*(\d+)/);
    if (!fm) continue;
    const floor = (Number(fm[1]) + Number(fm[2])) / 2;

    /* Restated to one quarter on the same index the AVM uses, so a project
       whose recent sales all landed in 2021 is not read as a discount. */
    const moved = tb ? tb.adjust(r.psf, month) : null;
    out.push({
      project: r.project, street: r.street, district: String(r.district).padStart(2, '0'),
      segment: r.marketSegment, propertyType: r.propertyType,
      month, areaSqm: r.areaSqm, floor, freehold, remaining: freehold ? null : remaining,
      psf: moved ? moved.psf : r.psf,
    });
  }
  return { rows: out, restatedTo: tb?.targetQuarter || null };
}

/* Predictors. log(psf) is the response so every coefficient reads as a
   percentage, and a 1,500 sqft unit and a 600 sqft one are on one scale. */
const design = r => [
  1,
  Math.log(r.areaSqm),
  r.freehold ? 1 : 0,
  /* Remaining lease enters only for leaseholds; freeholds carry the dummy
     above and a zero here, so the two are not fighting over one slope. */
  r.freehold ? 0 : r.remaining / 100,
  r.floor / 10,
  r.propertyType === 'Apartment' ? 1 : 0,
];
const predict = (c, r) => design(r).reduce((s, v, i) => s + v * c[i], 0);

function build() {
  const { rows, restatedTo } = rowsFor();
  const byDistrict = new Map();
  for (const r of rows) {
    if (!byDistrict.has(r.district)) byDistrict.set(r.district, []);
    byDistrict.get(r.district).push(r);
  }

  /* Catch-all buckets, found by how many streets they span rather than by a
     list of names — so a new one URA invents is caught without an edit. */
  const streetsOf = new Map();
  for (const r of rows) {
    if (!streetsOf.has(r.project)) streetsOf.set(r.project, new Set());
    streetsOf.get(r.project).add(r.street);
  }
  const catchAll = new Set([...streetsOf].filter(([, v]) => v.size > MAX_STREETS).map(([k]) => k));

  const districts = [];
  const projects = [];
  let bucketed = 0;
  const persistPairs = { early: [], late: [] };
  const driftPairs = { first: [], second: [] };
  let thinDistricts = 0, thinProjects = 0;

  for (const [district, rs] of [...byDistrict].sort()) {
    if (rs.length < MIN_DISTRICT_SALES) { thinDistricts++; continue; }
    const c = fit(rs.map(design), rs.map(r => Math.log(r.psf)));
    if (!c) { thinDistricts++; continue; }

    const resid = rs.map(r => Math.log(r.psf) - predict(c, r));
    const ss = resid.reduce((s, e) => s + e * e, 0);
    const my = mean(rs.map(r => Math.log(r.psf)));
    const r2 = 1 - ss / rs.map(r => (Math.log(r.psf) - my) ** 2).reduce((s, x) => s + x, 0);

    districts.push({
      district, n: rs.length, r2,
      medianPsf: Math.round(med(rs.map(r => r.psf))),
      /* The size gradient, read straight off the fit: a 10% larger unit
         carries this much more or less psf, everything else held. */
      sizeElasticity: c[1],
      per10PctLarger: Math.pow(1.1, c[1]) - 1,
      freeholdPremium: Math.exp(c[2]) - 1,
      perDecadeOfLease: Math.exp(c[3] * 0.1) - 1,
      perTenFloors: Math.exp(c[4]) - 1,
      coefficients: c,
    });

    const byProject = new Map();
    for (const r of rs) {
      if (!byProject.has(r.project)) byProject.set(r.project, []);
      byProject.get(r.project).push(r);
    }
    /* Cut points at the district's own terciles, so each third carries about
       the same number of sales however unevenly the district transacts. */
    const months = rs.map(r => mo(r.month)).sort((a, b) => a - b);
    const cut1 = months[Math.floor(months.length / 3)];
    const cut2 = months[Math.floor((2 * months.length) / 3)];
    const third = r => (mo(r.month) <= cut1 ? 0 : mo(r.month) <= cut2 ? 1 : 2);

    for (const [project, ps] of byProject) {
      if (catchAll.has(project)) { bucketed++; continue; }
      if (ps.length < MIN_PROJECT_SALES) { thinProjects++; continue; }
      const e = ps.map(r => Math.log(r.psf) - predict(c, r));
      const gap = mean(e);
      const fhCount = ps.filter(r => r.freehold).length;
      const isFreehold = fhCount > ps.length / 2;
      const part = [0, 1, 2].map(k => ps.filter(r => third(r) === k).map(r => Math.log(r.psf) - predict(c, r)));
      const lvl = part.map(v => (v.length >= MIN_HALF ? mean(v) : null));
      const early = part[0], late = part[2];
      if (early.length >= MIN_HALF && late.length >= MIN_HALF) {
        persistPairs.early.push(mean(early));
        persistPairs.late.push(mean(late));
      }
      /* Did the move in the first half carry on, or come back? Recorded per
         project so the question can be answered across all of them. */
      if (lvl[0] !== null && lvl[1] !== null && lvl[2] !== null) {
        /* Stored with their district so the district's own move can be taken
           out before the question is asked — otherwise the test measures
           whether CCR kept lagging, which is not the question. */
        driftPairs.first.push({ district, v: lvl[1] - lvl[0] });
        driftPairs.second.push({ district, v: lvl[2] - lvl[1] });
      }
      projects.push({
        project, district, segment: ps[0].segment,
        n: ps.length,
        from: ps.map(r => r.month).sort()[0], to: ps.map(r => r.month).sort().at(-1),
        medianPsf: Math.round(med(ps.map(r => r.psf))),
        medianAreaSqm: Math.round(med(ps.map(r => r.areaSqm))),
        /* One definition, used for both. These were computed two different
           ways — a majority vote for the flag and the first sale for the
           lease figure — and a project came out flagged freehold while
           carrying 72 years remaining. */
        freehold: isFreehold,
        mixedTenure: fhCount > 0 && fhCount < ps.length,
        medianRemaining: isFreehold ? null : Math.round(med(ps.filter(r => !r.freehold).map(r => r.remaining))),
        /* In log space, so it reads as a percentage against what a home with
           these characteristics trades at ANYWHERE in the district. */
        /* The LEVEL: what this project persistently trades at against its
           district, once size, tenure, lease, floor and type are held. Mostly
           address and build quality. Context, not an opportunity. */
        gap: Math.exp(gap) - 1,
        thirds: lvl.map(v => (v === null ? null : Math.exp(v) - 1)),
        earlyGap: lvl[0] === null ? null : Math.exp(lvl[0]) - 1,
        lateGap: lvl[2] === null ? null : Math.exp(lvl[2]) - 1,
        /* The MOVE: where it sits now against where it used to sit. This is
           the thing that is not already obvious from the address. */
        drift: lvl[0] === null || lvl[2] === null ? null : Math.exp(lvl[2] - lvl[0]) - 1,
        /* Within-project scatter. A wide one means the fit does not describe
           this project's units well, whatever its average says. */
        spread: Math.exp(Math.sqrt(mean(e.map(x => (x - gap) ** 2)))) - 1,
      });
    }
  }

  /* Ranked by the move, not the level — the level is a list of addresses. */
  /* The district's own move, and each project measured against it. Without
     this the ranking is a list of postcodes wearing a decimal point. */
  const districtDrift = new Map();
  for (const d of districts) {
    const ds = projects.filter(p => p.district === d.district && p.drift != null).map(p => Math.log(1 + p.drift));
    const m2 = ds.length >= 3 ? mean(ds) : null;
    districtDrift.set(d.district, m2);
    d.drift = m2 === null ? null : Math.exp(m2) - 1;
    d.driftProjects = ds.length;
  }
  for (const p of projects) {
    const dd = districtDrift.get(p.district);
    p.districtDrift = dd === null || dd === undefined ? null : Math.exp(dd) - 1;
    p.driftVsDistrict = p.drift == null || dd == null ? null : Math.exp(Math.log(1 + p.drift) - dd) - 1;
  }

  /* Ranked by what is left once the district's own move is taken out. */
  projects.sort((a, b) => (a.driftVsDistrict ?? 0) - (b.driftVsDistrict ?? 0));

  /* ── THE TEST THAT DECIDES WHETHER ANY OF THIS IS FARMABLE ── */
  const r = pearson(persistPairs.early, persistPairs.late);
  const n = persistPairs.early.length;
  const rank = arr => { const s = [...arr].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const o = []; s.forEach(([, i], k) => { o[i] = k / (s.length - 1); }); return o; };
  const re = rank(persistPairs.early), rl = rank(persistPairs.late);
  const cheapEarly = re.map((v, i) => (v <= 0.2 ? i : -1)).filter(i => i >= 0);
  const stillCheap = cheapEarly.filter(i => rl[i] <= 0.2).length;

  return {
    version: VERSION, builtAt: new Date().toISOString(), restatedTo,
    basis: {
      types: [...TYPES], saleType: 'resale only',
      minProjectSales: MIN_PROJECT_SALES, minDistrictSales: MIN_DISTRICT_SALES,
      controls: ['log floor area', 'freehold', 'remaining lease', 'storey', 'apartment vs condominium'],
      rows: rows.length,
    },
    persistence: {
      projects: n,
      r,
      /* More legible than a correlation: of the projects in the cheapest
         fifth early on, how many were still there later. Twenty per cent is
         what chance alone would give. */
      cheapestFifthStayed: cheapEarly.length ? stillCheap / cheapEarly.length : null,
      chance: 0.2,
      says: r === null ? 'Too few projects with sales in both halves to test.'
        : r > 0.35
          ? `A project's position holds: the early gap and the late gap correlate at r=${r.toFixed(2)} across ${n} projects, and ${Math.round(100 * stillCheap / cheapEarly.length)}% of the cheapest fifth were still in it later against 20% by chance. The ranking is describing something durable.`
          : `A project's position does NOT hold: early and late gaps correlate at only r=${r.toFixed(2)} across ${n} projects. This ranking is mostly which projects had an unlucky run, and it should not be farmed.`,
    },
    /* Does a move carry on, or come back? Either is actionable; neither
       means the drift column is noise and must not be traded on. */
    driftBehaviour: (() => {
      /* De-meaned by district on both sides. */
      const dm = arr => {
        const by = new Map();
        for (const x of arr) { if (!by.has(x.district)) by.set(x.district, []); by.get(x.district).push(x.v); }
        const mu = new Map([...by].map(([k, v]) => [k, mean(v)]));
        return arr.map(x => x.v - mu.get(x.district));
      };
      const r2 = pearson(dm(driftPairs.first), dm(driftPairs.second));
      const n2 = driftPairs.first.length;
      return {
        projects: n2, r: r2,
        says: r2 === null ? 'Too few projects with sales in all three thirds to test.'
          : r2 < -0.2
            ? `A move REVERSES: once each district's own move is taken out, a project's change over the first half and its change over the second correlate at r=${r2.toFixed(2)} across ${n2} projects. A project that has cheapened against its own district has tended to come back, which is what makes the bottom of this list worth a call.`
            : r2 > 0.2
              ? `A move CARRIES ON: with each district's own move taken out, the two halves correlate at r=${r2.toFixed(2)} across ${n2} projects. A project drifting down against its district has tended to keep drifting, so the bottom of this list is a warning rather than an opening.`
              : `A move does NEITHER: with each district's own move taken out, the two halves correlate at r=${r2.toFixed(2)} across ${n2} projects, which is no relationship. This column describes what HAS happened and carries no information about what happens next. Use it to start a conversation, never to time one.`,
      };
    })(),
    districts, projects, thinDistricts, thinProjects, bucketed,
    catchAllNames: [...catchAll],
    sources: ['URA private residential transactions, resale only (data/private.json)',
              'URA private residential property price index, via SingStat M212261'],
  };
}

const out = build();
fs.writeFileSync(path.join(ROOT, 'data', 'private-scan.json'), JSON.stringify(out));
console.log(`Wrote data/private-scan.json — ${out.projects.length} projects across ${out.districts.length} districts`);
console.log(`  ${out.basis.rows.toLocaleString()} resales, restated to ${out.restatedTo}, controlling for ${out.basis.controls.join(', ')}`);
console.log(`  dropped: ${out.thinProjects} projects under ${MIN_PROJECT_SALES} sales · ${out.thinDistricts} districts under ${MIN_DISTRICT_SALES} · ${out.bucketed} catch-all bucket(s) (${out.catchAllNames.join(', ') || 'none'})`);
console.log();
console.log('  PERSISTENCE: ' + out.persistence.says);
console.log();
console.log('  DRIFT:       ' + out.driftBehaviour.says);
