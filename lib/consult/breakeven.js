/**
 * What a launch has to price at, given what its land cost.
 *
 * The fit lives in data/breakeven.json and is produced by
 * scripts/build-breakeven.mjs, which is where the method and its three
 * failure modes are written down. Nothing is fitted here at request time —
 * same rule as the Blindspot rubric: the formula is built, published and
 * then applied, so two lookups a week apart cannot disagree.
 *
 * ── WHAT THE COEFFICIENTS MEAN ────────────────────────────────────────────
 *   launch psf = intercept + land x (land psf ppr) + perMonth x months
 *
 * `intercept` is the non-land cost of a square foot of saleable area —
 * construction, finance, marketing and profit, together. It is not taken from
 * a cost guide; it is what developers' own launch prices imply, which is the
 * only version of that number nobody has to be trusted for.
 *
 * `land` is above 1 for a structural reason worth knowing: URA prices land
 * per square foot of GROSS floor area, and a condominium sells less than its
 * GFA as strata area. How much less is not asserted here — the coefficient
 * carries the conversion AND whatever margin is taken on the land, and this
 * repo holds nothing that separates them. What it does show is that the
 * conversion moved: fitted on harmonised launches the coefficient is 1.63
 * against 1.00 before, which is the rule change doing exactly what it says.
 *
 * ── GFA HARMONISATION ─────────────────────────────────────────────────────
 * From 1 June 2023 URA, SLA, BCA and SCDF harmonised the floor-area
 * definitions; the rules bind GLS sites launched for sale from 1 September
 * 2022. Air-conditioner ledges forming part of a strata unit count as GFA,
 * every uncovered area within the strata area counts, and strata voids count
 * in neither. A developer gets less saleable area for the same plot ratio,
 * and a quoted unit size no longer carries the ledge — so post-harmonisation
 * psf is higher for reasons that have nothing to do with the market.
 *
 * Two fits are therefore published. `fit` is harmonised and is the live one,
 * because every site still to launch is in that regime and because it
 * predicts that regime measurably better. `pooledFit` reads a
 * pre-harmonisation launch back against its own rules. Passing
 * `harmonised: false` selects it; the default is the current regime.
 * Source: URA circular URA/PB/2022/09-DCG, 20 Sep 2022.
 *
 * `perMonth` is drift in the non-land cost. It is in the model because it
 * won a rolling-origin test against three simpler alternatives, not because
 * construction inflation is a thing one would expect to find.
 *
 * ── THE LINE THIS DOES NOT CROSS ──────────────────────────────────────────
 * This says what a launch PRICE implies, and what land implies a price must
 * be. It does not say whether a launch will sell, and it is not a valuation
 * of any unit in it — a launch is priced as a book, with the stack and floor
 * spread around this median, which is what the AVM and the stack table are
 * for. It also cannot see a site's own economics: a difficult basement, a
 * conservation facade or an unusually generous unit mix all land in the
 * residual and none of them is observable here.
 */
import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '2026-09-breakeven-v1';

let cache = null;
export function model(root = process.cwd()) {
  if (cache && cache.root === root) return cache.data;
  const p = path.join(root, 'data', 'breakeven.json');
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    cache = { root, data };
    return data;
  } catch { return null; }
}
/** Tests rebuild the file underneath us; nothing else needs this. */
export function _clearCache() { cache = null; }

const mo = m => Number(String(m).slice(0, 4)) * 12 + Number(String(m).slice(5, 7));
const monthNow = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * What a launch on this land would have to price at.
 *
 * `when` is the month it launches. For a site that has not launched, the
 * honest answer is priced at TODAY and the drift is reported separately,
 * because a launch two years out needs the time term extrapolated two years
 * past the last observation and that is a different claim from the one the
 * rolling-origin test scored.
 */
export function impliedLaunch({ landPsfPpr, when = null, harmonised = true, root = process.cwd() } = {}) {
  const m = model(root);
  if (!m) return { ok: false, reason: 'No breakeven model has been built. Run `npm run build:breakeven`.' };
  if (!(landPsfPpr > 0)) return { ok: false, reason: 'A land price in dollars per square foot per plot ratio is required.' };

  const f = harmonised ? m.fit : (m.pooledFit || m.fit);
  const month = when || monthNow();
  /* Extrapolation is measured against the fit's OWN last launch, not the
     dataset's. The harmonised fit spans a shorter window, so it runs out of
     evidence sooner and must say so sooner. */
  const rows = harmonised ? m.observations.filter(o => o.harmonised) : m.observations;
  const last = rows.at(-1)?.launch || f.epoch;
  const monthsPast = mo(month) - mo(last);
  const psf = f.intercept + f.land * landPsfPpr + f.perMonth * (mo(month) - mo(f.epoch));

  /* The band is the rolling-origin p90, not a fitted interval — no
     distribution was assumed, so none is claimed. It is derived from the
     ROUNDED point so that the printed band is reproducible from the printed
     figure; deriving it from the unrounded value put the two a dollar apart,
     which is the kind of discrepancy that costs a reader their trust in
     everything else on the page.
     ──
     THE p90 ALONE IS NOT ENOUGH PAST THE FIT'S OWN WINDOW. It was measured
     at dates inside it, where the drift term is interpolating. Beyond it the
     drift is doing real work and it is the least pinned thing in the model:
     bootstrapping 17 launches puts its 90% interval at roughly 30 to 215 psf
     a year. Dropping the term is worse (5.4% against 2.9% on the same
     held-out launches, so it is carrying signal), but pretending it is known
     to the nearest dollar is how a fourteen-month forecast ends up quoted
     like a measurement. So the band widens with the months extrapolated,
     asymmetrically, because the interval around the drift is not symmetric.
     The two are combined in quadrature rather than added: the p90 already
     carries some parameter uncertainty and adding would double-count it. */
  const p90 = m.accuracy.p90 ?? 0;
  const point = Math.round(psf);
  const d = f.drift;
  const perMo = f.perMonth;
  const driftLow = d && monthsPast > 0 ? Math.max(0, (perMo - d.perMonthLow) * monthsPast) : 0;
  const driftHigh = d && monthsPast > 0 ? Math.max(0, (d.perMonthHigh - perMo) * monthsPast) : 0;
  const base = point * p90;
  const lowSpan = Math.sqrt(base ** 2 + driftLow ** 2);
  const highSpan = Math.sqrt(base ** 2 + driftHigh ** 2);
  return {
    ok: true, version: m.version,
    psf: point, month,
    low: Math.round(point - lowSpan), high: Math.round(point + highSpan),
    /* What the band is made of, so a reader can see when it is mostly
       forecast uncertainty rather than fit error. */
    bandParts: {
      modelError: Math.round(base),
      driftLow: Math.round(driftLow), driftHigh: Math.round(driftHigh),
      driftPerYearLow: d ? Math.round(d.perMonthLow * 12) : null,
      driftPerYearHigh: d ? Math.round(d.perMonthHigh * 12) : null,
      driftNotPositiveShare: d ? d.shareNotPositive : null,
    },
    landPsfPpr, regime: f.regime, fit: f,
    harmonisation: m.harmonisation,
    /** What the land itself contributes. Exact — no efficiency is assumed. */
    landComponent: Math.round(f.land * landPsfPpr),
    nonLand: Math.round(f.intercept + f.perMonth * (mo(month) - mo(f.epoch))),
    driftPerYear: Math.round(f.perMonth * 12),
    fittedFrom: rows[0]?.launch || null, fittedTo: last,
    accuracy: m.accuracy,
    extrapolated: monthsPast > 0 ? monthsPast : 0,
    says: `Land at ${landPsfPpr} psf ppr contributes ${Math.round(f.land * landPsfPpr)} psf of the launch price. `
        + `Everything else — construction, finance, marketing and profit — has been running at `
        + `${Math.round(f.intercept + f.perMonth * (mo(month) - mo(f.epoch)))} psf, `
        + `measured from ${f.n} ${harmonised ? 'post-harmonisation ' : ''}launches rather than taken from a cost guide. `
        + `A launch here prices around ${Math.round(psf)} psf.`
      + (monthsPast > 0
        ? ` This is ${monthsPast} month(s) past the last launch the model has seen, so the drift term is extrapolated: every further year adds about ${Math.round(m.fit.perMonth * 12)} psf.`
        : ''),
  };
}

/**
 * Is this launch priced above or below what its land implied?
 *
 * The question behind "is a new launch good value" — not against other
 * launches, which all moved together, but against its own cost base.
 */
export function assessLaunch({ askingPsf, landPsfPpr, when = null, harmonised = true, root = process.cwd() } = {}) {
  const imp = impliedLaunch({ landPsfPpr, when, harmonised, root });
  if (!imp.ok) return imp;
  if (!(askingPsf > 0)) return { ok: false, reason: 'An asking psf is required to assess a launch against it.' };

  const gap = askingPsf / imp.psf - 1;
  const p90 = imp.accuracy.p90 ?? 0;
  /* Inside the band the model cannot tell them apart, and saying so is the
     finding. A verdict narrower than the measurement is a decoration. */
  const code = Math.abs(gap) <= p90 ? 'in line'
    : gap > 0 ? 'above what the land implies' : 'below what the land implies';
  return {
    ok: true, version: imp.version,
    askingPsf, implied: imp, gap, code,
    says: code === 'in line'
      ? `At ${askingPsf} psf this is within the model's own ${(100 * p90).toFixed(0)}% error of the ${imp.psf} psf its land implies. `
        + 'That is not a finding that it is fairly priced — it is the model declining to call it either way.'
      : `At ${askingPsf} psf this is ${(100 * Math.abs(gap)).toFixed(1)}% ${gap > 0 ? 'above' : 'below'} the ${imp.psf} psf its land implies, `
        + `which is outside the ${(100 * p90).toFixed(0)}% band nine in ten past launches fell inside. `
        + (gap > 0
          ? 'Either the developer is taking more than the recent norm, or this site carries a cost the land price does not show.'
          : 'Either it is priced to move, or the land was bought well.'),
  };
}

/**
 * Sites awarded with nothing selling on that street yet, and what each one's
 * land implies. The forward view: what is coming, and at what price it has to
 * come, before any of it is marketed.
 */
export function pipeline({ root = process.cwd(), limit = 40 } = {}) {
  const m = model(root);
  if (!m) return { ok: false, reason: 'No breakeven model has been built. Run `npm run build:breakeven`.' };

  const lags = m.observations.map(o => mo(o.launch) - mo(o.award.slice(0, 7))).sort((a, b) => a - b);
  const typicalLag = lags.length ? lags[(lags.length - 1) >> 1] : null;

  const sites = m.unlaunched.slice(0, limit).map(s => {
    /* Each site priced under its OWN regime — one of the 25 pre-dates
       harmonisation and pricing it on the harmonised fit would be wrong. */
    const imp = impliedLaunch({ landPsfPpr: s.landPsfPpr, harmonised: s.harmonised !== false, root });
    return { ...s, impliedPsf: imp.ok ? imp.psf : null, low: imp.ok ? imp.low : null, high: imp.ok ? imp.high : null };
  });
  return {
    ok: true, version: m.version, typicalLagMonths: typicalLag, sites,
    says: `${m.unlaunched.length} awarded site(s) have nothing selling on their street yet. `
        + (typicalLag ? `Past sites took a median of ${typicalLag} months from award to first sale. ` : '')
        + 'Each price below is what that land implies IF it launched today; a later launch carries the drift on top.',
  };
}

/** A launch the model has already seen, and how it actually priced. */
export function forProject(project, { root = process.cwd() } = {}) {
  const m = model(root);
  if (!m) return null;
  const key = String(project || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const o = m.observations.find(x => x.project.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() === key);
  if (!o) return null;
  /* Read back against the rules it was actually built under. */
  const imp = impliedLaunch({ landPsfPpr: o.landPsfPpr, when: o.launch, harmonised: o.harmonised, root });
  return { ...o, implied: imp.ok ? imp.psf : null, gap: imp.ok ? o.launchPsf / imp.psf - 1 : null };
}
