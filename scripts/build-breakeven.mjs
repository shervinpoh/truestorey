/**
 * What a launch has to price at, given what the land cost.
 *
 * ── WHY NOT A PUBLISHED CONSTRUCTION COST ─────────────────────────────────
 * The obvious build is land + construction + finance + marketing + margin,
 * with construction from BCA's tender price index or a consultancy's cost
 * guide. Every one of those numbers arrives as a range, for a building
 * specification that is not the one being priced, and the margin is a guess
 * on top. Five assumptions compound and nothing in the result is checkable.
 *
 * So the whole non-land side is MEASURED instead, from the only evidence that
 * settles it: what developers actually launched at, on land whose price URA
 * published. The intercept below IS the construction-plus-everything-else
 * figure, in dollars per saleable square foot, and it carries its own error
 * bar because it was fitted rather than asserted. Nobody has to be trusted.
 *
 * ── THE THREE THINGS THAT WOULD MAKE THIS WRONG ───────────────────────────
 * 1. LEFT CENSORING. data/private.json begins 2021-09. A project already
 *    selling then shows its first row in Sep 2021, and reading that as "the
 *    launch" prices a mid-life project against land bought years earlier.
 *    Nineteen of forty-three joins are this, and including them moved the
 *    multiple by enough to change the answer. Only a launch whose beginning
 *    is actually in the data is used.
 * 2. AMBIGUOUS LAND. A street can carry two awards, or an award can carry two
 *    projects. Picking either is wrong about half the time and looks exactly
 *    like being right, so both cases are dropped — the same rule lib/land.js
 *    applies to HDB site names, for the same reason.
 * 3. GFA HARMONISATION. From 1 June 2023 URA, SLA, BCA and SCDF harmonised
 *    the floor-area definitions, and the rules bind GLS sites LAUNCHED FOR
 *    SALE from 1 September 2022. Air-conditioner ledges that form part of a
 *    strata unit now count as GFA, every uncovered area inside the strata
 *    area counts, and strata voids count in neither. A developer therefore
 *    gets less saleable area for the same plot ratio, and a unit's quoted
 *    size no longer carries the ledge — so post-harmonisation psf is higher
 *    for reasons that have nothing to do with the market.
 *
 *    That is a break in the LAND coefficient, not the intercept, and it is
 *    measured: fitted on harmonised launches alone the coefficient is 1.63
 *    against 1.00 before, in the direction the rule change predicts. It
 *    cannot be recovered from a dummy inside a pooled fit, because
 *    "harmonised" and "launched later" correlate at r=0.73 here and the
 *    dummy just absorbs the drift. What works is fitting the regimes apart:
 *    predicting harmonised launches from harmonised launches scores 1.9%
 *    against the pooled model's 2.9% on the same held-out set.
 *
 *    So two fits are published. The harmonised one is the live one — 24 of
 *    the 25 sites still to launch are in that regime — and the pooled fit is
 *    kept for reading a pre-harmonisation launch back.
 *    Source: URA circular URA/PB/2022/09-DCG, 20 Sep 2022.
 *
 * 4. FITTING AND ADMIRING IT. A three-parameter fit on two dozen points will
 *    always look good in-sample. The accuracy published below is rolling
 *    origin: fit on everything that launched EARLIER, predict the next one,
 *    never let the model see its own target. It beat a flat multiple (6.7%),
 *    a flat dollar gap (5.1%) and land alone (5.4%) on that test, which is
 *    the only reason the time term is in it.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VERSION = '2026-09-breakeven-v1';
/** The first month data/private.json covers. Everything censoring turns on. */
const DATA_START = '2021-10';
/** A launch is its first twelve months of new sales. */
const LAUNCH_WINDOW_MONTHS = 12;
/** Below this the launch median is one buyer's opinion. */
const MIN_LAUNCH_SALES = 10;
/** A site awarded and not launched within this is not the project we found. */
const YEARS_TO_LAUNCH = [1, 9];
/**
 * Harmonised floor-area rules bind GLS sites launched for sale on or after
 * this date (URA circular URA/PB/2022/09-DCG, 20 Sep 2022; the parallel rule
 * for development applications is 1 June 2023). The GLS tender launch date is
 * the observable one, and it is in the awards file, so assignment is read
 * rather than inferred.
 */
const HARMONISED_FROM = '2022-09-01';

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
const mo = m => Number(m.slice(0, 4)) * 12 + Number(m.slice(5));
const EPOCH = '2022-01';
/** URA files a contract date as MMYY. */
const ym = d => { const s = String(d).padStart(4, '0'); return (2000 + Number(s.slice(2))) + '-' + s.slice(0, 2); };

function read(f) { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); }

/** Ordinary least squares, k predictors plus an intercept. */
function fit(X, y) {
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r, n) => s + r[i] * r[j], 0)));
  const b = Array.from({ length: k }, (_, i) => X.reduce((s, r, n) => s + r[i] * y[n], 0));
  for (let i = 0; i < k; i++) {
    const p = A[i][i];
    if (!p) return null;
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
const predict = (c, landPsf, month, epoch = EPOCH) => c[0] + c[1] * landPsf + c[2] * (mo(month) - mo(epoch));

function build() {
  const awards = read('gls-awards.json').sites
    .filter(r => /condominium|residential|flat|apartment|executive/i.test(r.use || '') && r.psmGfaOrGpr > 0);
  const rows = read('private.json').rows.filter(r => r.typeOfSale === '1');

  const byProj = new Map();
  for (const r of rows) {
    if (!byProj.has(r.project)) byProj.set(r.project, { street: r.street, seg: r.marketSegment, district: r.district, sales: [] });
    byProj.get(r.project).sales.push({ m: ym(r.contractDate), psf: r.psf });
  }
  for (const v of byProj.values()) v.sales.sort((a, b) => a.m.localeCompare(b.m));

  /* Site name to project, by exact normalised street and a plausible gap to
     launch. Exact or nothing — see note 2 in the header. */
  const hits = new Map();
  const unlaunched = [];
  for (const a of awards) {
    const site = norm(String(a.site).split(/[\/(]/)[0]);
    const ok = [...byProj.entries()].filter(([, v]) => {
      if (norm(v.street) !== site) return false;
      const y = Number(v.sales[0].m.slice(0, 4)) - Number(a.award.slice(0, 4));
      return y >= YEARS_TO_LAUNCH[0] && y <= YEARS_TO_LAUNCH[1];
    });
    if (ok.length === 1) {
      const p = ok[0][0];
      if (!hits.has(p)) hits.set(p, []);
      hits.get(p).push(a);
    } else if (!ok.length && a.award >= '2021-01-01') {
      /* Awarded recently and nothing selling on that street yet: a site still
         to come, which is the half of this the forward view is built on. */
      unlaunched.push(a);
    }
  }

  const obs = [];
  const dropped = { censored: 0, ambiguous: 0, thin: 0 };
  for (const [proj, aw] of hits) {
    const v = byProj.get(proj);
    const start = v.sales[0].m;
    if (start <= DATA_START) { dropped.censored++; continue; }
    if (aw.length > 1) { dropped.ambiguous++; continue; }
    const a = aw[0];
    const within = v.sales.filter(s => (mo(s.m) - mo(start)) < LAUNCH_WINDOW_MONTHS);
    if (within.length < MIN_LAUNCH_SALES) { dropped.thin++; continue; }
    obs.push({
      project: proj, segment: v.seg, district: v.district, site: a.site,
      award: a.award, winner: a.winner, bids: a.bids,
      launch: start, launchSales: within.length,
      tenderLaunched: a.launched || null,
      harmonised: Boolean(a.launched && a.launched >= HARMONISED_FROM),
      landPsfPpr: Math.round(a.psmGfaOrGpr / 10.7639),
      launchPsf: Math.round(med(within.map(s => s.psf))),
    });
  }
  obs.sort((a, b) => a.launch.localeCompare(b.launch));

  /* A street can carry more than one parcel over the years, so an award with
     nothing selling on its street is not automatically a site still to come:
     it may be the SAME parcel, failing the launch-window join for some other
     reason. The discriminator is the award date. A later award on a street
     that already produced a launch is a genuinely new parcel — Dunearn Road
     2026 beside the 2025 award that became Dunearn House, Lentor Central
     2026 beside the one that became Lentor Central Residences. An EARLIER
     one cannot be, so it is dropped rather than published as a site to come. */
  const launchedByStreet = new Map();
  for (const o of obs) launchedByStreet.set(norm(String(o.site).split(/[\/(]/)[0]), o);
  dropped.behindALaunch = 0;
  const forward = [];
  for (const a of unlaunched) {
    const prior = launchedByStreet.get(norm(String(a.site).split(/[\/(]/)[0]));
    if (prior && a.award <= prior.award) { dropped.behindALaunch++; continue; }
    forward.push({ award: a, sameStreetAs: prior ? prior.project : null });
  }

  /* Rolling origin. The first eight launches are the seed and are never
     scored, because a fit on fewer is not a model. `only` restricts BOTH the
     training set and the scored target to one regime. */
  const roll = (rows, seed = 8) => {
    const errs = [];
    for (let i = seed; i < rows.length; i++) {
      const tr = rows.slice(0, i), p = rows[i];
      const e = tr[Math.floor(tr.length / 2)].launch;
      const c = fit(tr.map(o => [1, o.landPsfPpr, mo(o.launch) - mo(e)]), tr.map(o => o.launchPsf));
      if (!c) continue;
      errs.push(Math.abs(predict(c, p.landPsfPpr, p.launch, e) - p.launchPsf) / p.launchPsf);
    }
    errs.sort((a, b) => a - b);
    return errs.length ? {
      trials: errs.length, mdape: errs[(errs.length - 1) >> 1],
      p90: errs[Math.floor(errs.length * 0.9)], worst: errs.at(-1),
    } : null;
  };
  /**
   * Each fit is centred on the MIDDLE of its own window.
   *
   * With a shared 2022-01 epoch the harmonised intercept sat 33 months before
   * the first harmonised launch, so it was an extrapolation backwards into a
   * regime that did not exist yet — and it behaved like one: leaving a single
   * launch out moved it between 1 and 357. Predictions are identical either
   * way, this is a reparameterisation, but the intercept only means
   * "non-land cost" if it is quoted somewhere the data actually is.
   */
  const epochOf = rows => rows[Math.floor(rows.length / 2)].launch;
  const coefOf = (rows, epoch) => fit(rows.map(o => [1, o.landPsfPpr, mo(o.launch) - mo(epoch)]), rows.map(o => o.launchPsf));
  const r2Of = (rows, c, epoch) => {
    const yh = rows.map(o => predict(c, o.landPsfPpr, o.launch, epoch));
    const my = rows.reduce((s, o) => s + o.launchPsf, 0) / rows.length;
    return 1 - rows.reduce((s, o, i) => s + (o.launchPsf - yh[i]) ** 2, 0)
             / rows.reduce((s, o) => s + (o.launchPsf - my) ** 2, 0);
  };

  const harm = obs.filter(o => o.harmonised);
  const pooledEpoch = epochOf(obs);
  const harmEpoch = harm.length ? epochOf(harm) : pooledEpoch;
  const pooledCoef = coefOf(obs, pooledEpoch);
  const harmCoef = harm.length >= 10 ? coefOf(harm, harmEpoch) : null;

  /**
   * Bootstrap, because the drift is the load-bearing term and the least
   * pinned one. Dropping it costs real accuracy (5.4% against 2.9% on the
   * same held-out launches, so it is carrying signal) — but resampling 17
   * launches puts its 90% interval at roughly 30 to 215 psf a year. That
   * range is most of the uncertainty in any site launching later, and a band
   * that ignores it reads far more confident than the evidence allows.
   */
  const bootstrap = (rows, epoch, B = 4000) => {
    const drifts = [];
    for (let b = 0; b < B; b++) {
      const s2 = Array.from({ length: rows.length }, () => rows[Math.floor(Math.random() * rows.length)]);
      const c = fit(s2.map(o => [1, o.landPsfPpr, mo(o.launch) - mo(epoch)]), s2.map(o => o.launchPsf));
      if (c && Number.isFinite(c[2])) drifts.push(c[2]);
    }
    drifts.sort((a, b) => a - b);
    return drifts.length ? {
      resamples: drifts.length,
      perMonthLow: drifts[Math.floor(drifts.length * 0.05)],
      perMonthHigh: drifts[Math.floor(drifts.length * 0.95)],
      shareNotPositive: drifts.filter(d => d <= 0).length / drifts.length,
    } : null;
  };

  /* Both models scored on the SAME targets — harmonised launches — so the
     comparison is like with like. Seeded at 8 for pooled and 4 for the
     harmonised fit, which has fewer rows to give. */
  const harmIdx = obs.map((o, i) => (o.harmonised ? i : -1)).filter(i => i >= 0);
  const head2head = { pooled: [], harmonised: [] };
  for (let k = 8; k < harmIdx.length; k++) {
    const i = harmIdx[k], p = obs[i];
    const trAll = obs.slice(0, i), trH = trAll.filter(o => o.harmonised);
    const e1 = epochOf(trAll);
    const c1 = coefOf(trAll, e1);
    if (c1) head2head.pooled.push(Math.abs(predict(c1, p.landPsfPpr, p.launch, e1) - p.launchPsf) / p.launchPsf);
    if (trH.length >= 4) {
      const e2 = epochOf(trH);
      const c2 = coefOf(trH, e2);
      if (c2) head2head.harmonised.push(Math.abs(predict(c2, p.landPsfPpr, p.launch, e2) - p.launchPsf) / p.launchPsf);
    }
  }
  /* p90 is not decoration: impliedLaunch builds its band from it, and a
     summary without it silently collapses every range to a single point —
     which is precisely the thing this repo will not publish. */
  const summarise = e => {
    const s2 = [...e].sort((a, b) => a - b);
    return s2.length ? {
      trials: s2.length, mdape: s2[(s2.length - 1) >> 1],
      p90: s2[Math.floor(s2.length * 0.9)], worst: s2.at(-1),
    } : null;
  };

  const coef = pooledCoef;
  const live = harmCoef || pooledCoef;
  const liveEpoch = harmCoef ? harmEpoch : pooledEpoch;
  const bySeg = {};
  for (const o of obs) {
    const p = predict(live, o.landPsfPpr, o.launch, liveEpoch);
    (bySeg[o.segment] ||= []).push((o.launchPsf - p) / o.launchPsf);
  }

  return {
    version: VERSION, builtAt: new Date().toISOString(),
    /* The live fit. Harmonised, because every site still to launch is, and
       because it predicts that regime measurably better — see note 3. */
    fit: harmCoef
      ? { intercept: harmCoef[0], land: harmCoef[1], perMonth: harmCoef[2], epoch: harmEpoch, regime: 'harmonised', n: harm.length,
          from: harm[0].launch, to: harm.at(-1).launch, r2: r2Of(harm, harmCoef, harmEpoch),
          drift: bootstrap(harm, harmEpoch) }
      : { intercept: pooledCoef[0], land: pooledCoef[1], perMonth: pooledCoef[2], epoch: pooledEpoch, regime: 'pooled', n: obs.length,
          from: obs[0].launch, to: obs.at(-1).launch, r2: r2Of(obs, pooledCoef, pooledEpoch), drift: bootstrap(obs, pooledEpoch) },
    /* Kept for reading a pre-harmonisation launch back against its own rules. */
    pooledFit: { intercept: pooledCoef[0], land: pooledCoef[1], perMonth: pooledCoef[2], epoch: pooledEpoch, regime: 'pooled', n: obs.length,
                 from: obs[0].launch, to: obs.at(-1).launch, r2: r2Of(obs, pooledCoef, pooledEpoch), drift: bootstrap(obs, pooledEpoch) },
    harmonisation: {
      from: HARMONISED_FROM,
      basis: 'GLS tender launch date',
      source: 'URA circular URA/PB/2022/09-DCG, 20 Sep 2022 — floor-area definitions harmonised across URA, SLA, BCA and SCDF',
      effect: 'Air-conditioner ledges forming part of a strata unit count as GFA, every uncovered area within the strata area counts, and strata voids count in neither. Less saleable area per unit of plot ratio, and a quoted unit size that no longer carries the ledge — so psf rises for reasons unrelated to the market.',
      counts: { harmonised: harm.length, pre: obs.length - harm.length },
      headToHead: { pooled: summarise(head2head.pooled), harmonised: summarise(head2head.harmonised) },
    },
    accuracy: {
      method: 'rolling origin — fit on everything launched earlier, predict the next',
      ...((harmCoef ? summarise(head2head.harmonised) : null) || roll(obs)),
      r2: harmCoef ? r2Of(harm, harmCoef, harmEpoch) : r2Of(obs, pooledCoef, pooledEpoch),
      scoredOn: harmCoef ? 'harmonised launches, by a fit on harmonised launches' : 'all launches',
    },
    segmentBias: Object.fromEntries(Object.entries(bySeg)
      .map(([k, v]) => [k, { n: v.length, meanResidual: v.reduce((s, x) => s + x, 0) / v.length }])),
    window: { dataStart: DATA_START, launchWindowMonths: LAUNCH_WINDOW_MONTHS, minLaunchSales: MIN_LAUNCH_SALES },
    dropped, observations: obs,
    unlaunched: forward.sort((x, y) => y.award.award.localeCompare(x.award.award)).map(({ award: a, sameStreetAs }) => ({
      sameStreetAs,
      site: a.site, planningArea: a.planningArea, award: a.award, winner: a.winner,
      bids: a.bids, gfaSqm: a.gfaSqm, lease: a.lease,
      tenderLaunched: a.launched || null,
      harmonised: Boolean(a.launched && a.launched >= HARMONISED_FROM),
      landPsfPpr: Math.round(a.psmGfaOrGpr / 10.7639),
    })),
    sources: [
      'URA Government Land Sales — past tender results (data/gls-awards.json)',
      'URA private residential transactions, new sales only (data/private.json)',
    ],
  };
}

const out = build();
fs.writeFileSync(path.join(ROOT, 'data', 'breakeven.json'), JSON.stringify(out, null, 1));
console.log(`Wrote data/breakeven.json — ${out.observations.length} launches joined to their land`);
console.log(`  dropped: ${out.dropped.censored} left-censored · ${out.dropped.ambiguous} ambiguous land · ${out.dropped.thin} too few launch sales`);
console.log(`  launch psf = ${Math.round(out.fit.intercept)} + ${out.fit.land.toFixed(3)} x land psf ppr + ${out.fit.perMonth.toFixed(2)} x months from ${out.fit.epoch} (${out.fit.regime}, n=${out.fit.n})`);
console.log(`  drift ${Math.round(12 * out.fit.perMonth)} psf/yr, 90% interval ${Math.round(12 * out.fit.drift.perMonthLow)} to ${Math.round(12 * out.fit.drift.perMonthHigh)} over ${out.fit.drift.resamples} resamples`);
console.log(`  rolling-origin MdAPE ${(100 * out.accuracy.mdape).toFixed(1)}% over ${out.accuracy.trials} held-out launches · R2 ${out.accuracy.r2.toFixed(3)}`);
console.log(`  ${out.unlaunched.length} awarded sites still to launch (${out.dropped.behindALaunch} dropped as older than a launch already on their street)`);
