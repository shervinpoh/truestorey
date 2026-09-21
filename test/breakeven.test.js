/**
 * Land to launch price. The failures worth guarding are all about a small
 * sample being made to look like a large one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { impliedLaunch, assessLaunch, pipeline, forProject, model, _clearCache } from '../lib/consult/breakeven.js';

const ROOT = process.cwd();
const M = model(ROOT);

test('a missing model is a reason, never a throw', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'be-'));
  _clearCache();
  const r = impliedLaunch({ landPsfPpr: 1000, root: d });
  assert.equal(r.ok, false);
  assert.match(r.reason, /build:breakeven/);
  _clearCache();
});

test('a land price is required — psf of a launch is not one', () => {
  for (const bad of [0, null, undefined, -100, NaN]) {
    assert.equal(impliedLaunch({ landPsfPpr: bad }).ok, false);
  }
});

const monthsFrom = (epoch, when) =>
  (Number(when.slice(0, 4)) * 12 + Number(when.slice(5, 7))) - (Number(epoch.slice(0, 4)) * 12 + Number(epoch.slice(5, 7)));

test('the published formula is what gets applied, from the published epoch', () => {
  /* Same rule as the Blindspot rubric: the fit is built, written down and
     then used. The epoch is part of what is published — each fit is centred
     on the middle of its OWN window, because a harmonised intercept quoted
     33 months before the first harmonised launch is an extrapolation into a
     regime that did not exist, and it behaved like one (leave-one-out moved
     it between 1 and 357). */
  const when = '2025-06';
  const expected = M.fit.intercept + M.fit.land * 1200 + M.fit.perMonth * monthsFrom(M.fit.epoch, when);
  assert.equal(impliedLaunch({ landPsfPpr: 1200, when }).psf, Math.round(expected));
  /* Centred means the epoch sits inside the window it was fitted on. */
  assert.ok(M.fit.epoch >= M.fit.from && M.fit.epoch <= M.fit.to,
    `epoch ${M.fit.epoch} is outside the fitted window ${M.fit.from}–${M.fit.to}`);
});

test('the band is the measured p90, not an assumed interval', () => {
  /* Inside the fitted window the band IS the p90 and nothing else. */
  const r = impliedLaunch({ landPsfPpr: 1200, when: M.fit.to });
  assert.equal(r.extrapolated, 0);
  assert.equal(r.low, Math.round(r.psf * (1 - M.accuracy.p90)));
  assert.equal(r.high, Math.round(r.psf * (1 + M.accuracy.p90)));
  /* Thin, and it is meant to be read as thin: nine held-out launches is the
     whole post-harmonisation record, and a p90 over nine is a ninth-worst,
     not a percentile. It is published because the alternative is publishing
     no error at all. */
  assert.ok(M.accuracy.trials >= 8, `only ${M.accuracy.trials} held-out trials`);
});

test('a date past the last observed launch is flagged as extrapolated', () => {
  /* The drift term is fitted over 2022–2026 and projecting it forward assumes
     that continues. That assumption is the one thing here nobody can check,
     so it is stated rather than folded silently into the figure. */
  const last = M.observations.at(-1).launch;
  assert.equal(impliedLaunch({ landPsfPpr: 1200, when: last }).extrapolated, 0);
  const far = impliedLaunch({ landPsfPpr: 1200, when: '2029-01' });
  assert.ok(far.extrapolated > 24);
  assert.match(far.says, /extrapolated/);
  assert.ok(far.driftPerYear > 0);
});

test('inside its own error the model declines to call it, and says that is what it is doing', () => {
  const imp = impliedLaunch({ landPsfPpr: 1200, when: '2025-01' });
  const a = assessLaunch({ landPsfPpr: 1200, askingPsf: imp.psf, when: '2025-01' });
  assert.equal(a.code, 'in line');
  /* "In line" must not read as a finding of fair value — a verdict narrower
     than the measurement is a decoration. */
  assert.match(a.says, /declining to call it/);

  const high = assessLaunch({ landPsfPpr: 1200, askingPsf: Math.round(imp.psf * 1.3), when: '2025-01' });
  assert.equal(high.code, 'above what the land implies');
  const low = assessLaunch({ landPsfPpr: 1200, askingPsf: Math.round(imp.psf * 0.7), when: '2025-01' });
  assert.equal(low.code, 'below what the land implies');
});

test('an assessment needs an asking price', () => {
  assert.equal(assessLaunch({ landPsfPpr: 1200 }).ok, false);
});

/**
 * ── THE BUILD'S OWN GUARDS ────────────────────────────────────────────────
 * These read the built file. They are the three things that would make the
 * whole model wrong, and each one already changed the answer once while this
 * was being written.
 */
test('no launch predates the transaction data — left censoring is what fakes a launch', () => {
  /* data/private.json begins 2021-09. A project already selling then shows
     its first row in Sep 2021, and reading that as "the launch" prices a
     mid-life project against land bought years earlier. Nineteen of the
     forty-three joins are this, and keeping them moved the multiple enough
     to change the answer. */
  for (const o of M.observations) {
    assert.ok(o.launch > M.window.dataStart,
      `${o.project} launched ${o.launch}, at or before the data start ${M.window.dataStart}`);
  }
  assert.ok(M.dropped.censored > 0, 'the censoring filter should be catching real rows, or it is not wired');
});

test('every launch median rests on enough sales to be a median', () => {
  for (const o of M.observations) {
    assert.ok(o.launchSales >= M.window.minLaunchSales,
      `${o.project} has ${o.launchSales} launch-year sales`);
  }
});

test('the model is scored out of sample, and the seed is never scored', () => {
  assert.match(M.accuracy.method, /rolling origin/);
  assert.ok(M.accuracy.trials < M.observations.length,
    'scoring as many trials as observations means something was scored on itself');
  assert.ok(M.accuracy.mdape > 0 && M.accuracy.mdape < 0.15);
});

test('a site still to come is never one that already launched', () => {
  /* A street can carry several parcels over the years, so "nothing selling on
     this street" is not the test — the SAME parcel could fail the launch join
     for another reason and reappear here as a phantom site to come. The
     discriminator is the award date: a later award beside a launch is a real
     new parcel (Dunearn Road 2026 beside the 2025 award that became Dunearn
     House), an earlier one cannot be. */
  const p = pipeline();
  assert.equal(p.ok, true);
  const byStreet = new Map(M.observations.map(o => [String(o.site).toUpperCase(), o]));
  for (const s of p.sites) {
    const prior = byStreet.get(String(s.site).toUpperCase());
    if (prior) {
      assert.ok(s.award > prior.award,
        `${s.site} awarded ${s.award} is not later than the ${prior.award} award that became ${prior.project}`);
      assert.equal(s.sameStreetAs, prior.project, 'a second parcel must name the launch beside it');
    }
    assert.ok(s.impliedPsf > s.landPsfPpr, 'an implied launch below its own land cost is arithmetic gone wrong');
  }
  assert.ok(p.typicalLagMonths > 0);
  assert.ok(Number.isFinite(M.dropped.behindALaunch), 'the discriminator must be counted, not applied silently');
});

test('a joined project reports what it launched at beside what its land implied', () => {
  const o = M.observations[0];
  const f = forProject(o.project);
  assert.equal(f.launchPsf, o.launchPsf);
  assert.ok(Number.isFinite(f.gap));
  /* Case and punctuation differ between URA's project field and anything
     typed, so the lookup normalises both sides. */
  assert.ok(forProject(o.project.toLowerCase()));
  assert.equal(forProject('A PROJECT THAT DOES NOT EXIST'), null);
});

test('segment bias is measured and reported rather than silently applied', () => {
  /* Correcting a 3-launch segment is fitting noise. It is surfaced so it can
     be read, and left out of the arithmetic. */
  assert.ok(Object.keys(M.segmentBias).length >= 2);
  for (const [seg, v] of Object.entries(M.segmentBias)) {
    assert.ok(v.n > 0 && Number.isFinite(v.meanResidual), seg);
  }
  const a = impliedLaunch({ landPsfPpr: 1200, when: '2025-06' });
  const expected = M.fit.intercept + M.fit.land * 1200 + M.fit.perMonth * monthsFrom(M.fit.epoch, '2025-06');
  assert.equal(a.psf, Math.round(expected), 'a bias correction has crept into the estimate');
});

/**
 * ── GFA HARMONISATION ─────────────────────────────────────────────────────
 * From 1 June 2023 URA, SLA, BCA and SCDF harmonised the floor-area
 * definitions, binding GLS sites launched for sale from 1 Sep 2022. Air-con
 * ledges inside a strata unit count as GFA, every uncovered area within the
 * strata area counts, strata voids count in neither. Less saleable area per
 * unit of plot ratio, and a quoted size that no longer carries the ledge —
 * so psf rises for reasons unrelated to the market. A model that pools the
 * two regimes prices every forward-looking site under rules that no longer
 * apply, and 24 of the 25 sites still to launch are post-harmonisation.
 */
test('the regime is read from the tender date, never inferred from the launch date', () => {
  assert.equal(M.harmonisation.from, '2022-09-01');
  assert.match(M.harmonisation.basis, /tender launch/i);
  assert.match(M.harmonisation.source, /URA\/PB\/2022\/09-DCG/);
  for (const o of M.observations) {
    assert.equal(typeof o.harmonised, 'boolean');
    if (o.tenderLaunched) {
      assert.equal(o.harmonised, o.tenderLaunched >= M.harmonisation.from,
        `${o.project} tendered ${o.tenderLaunched} is assigned ${o.harmonised}`);
    }
  }
  /* The two regimes must both be present, or "fitted apart" is meaningless. */
  assert.ok(M.harmonisation.counts.harmonised >= 10);
  assert.ok(M.harmonisation.counts.pre >= 1);
});

test('the regime is not just a proxy for launching later', () => {
  /* The Sen launched 2025-11 on a 2018 tender. Without at least one case like
     it, "harmonised" and "later" would be the same variable and splitting the
     fit would be splitting on nothing. */
  const late = M.observations.filter(o => !o.harmonised).map(o => o.launch).sort().at(-1);
  const early = M.observations.filter(o => o.harmonised).map(o => o.launch).sort()[0];
  assert.ok(late > early,
    'every pre-harmonisation launch predates every harmonised one — the split is collinear with time and cannot be read as a regime effect');
});

test('the live fit is the harmonised one, and it is the one that scores better', () => {
  assert.equal(M.fit.regime, 'harmonised');
  assert.ok(M.pooledFit, 'the pooled fit is kept for reading older launches back');
  const h = M.harmonisation.headToHead;
  assert.ok(h.harmonised.mdape < h.pooled.mdape,
    `the harmonised fit (${h.harmonised.mdape}) must beat the pooled one (${h.pooled.mdape}) on the same held-out launches, or there is no reason to split`);
  assert.equal(h.harmonised.trials, h.pooled.trials, 'compared on different targets, the comparison says nothing');
});

test('harmonisation moves the land coefficient, which is the direction the rule predicts', () => {
  /* Less saleable area for the same plot ratio means each dollar of land per
     GFA foot lands on fewer saleable feet. The coefficient must RISE. */
  assert.ok(M.fit.land > M.pooledFit.land,
    `harmonised land coefficient ${M.fit.land} is not above the pooled ${M.pooledFit.land}`);
});

test('a pre-harmonisation site is priced under its own rules, not the live fit', () => {
  const a = impliedLaunch({ landPsfPpr: 1323, when: '2026-09', harmonised: true });
  const b = impliedLaunch({ landPsfPpr: 1323, when: '2026-09', harmonised: false });
  assert.equal(a.regime, 'harmonised');
  assert.equal(b.regime, 'pooled');
  assert.notEqual(a.psf, b.psf);
  /* Every site in the forward view carries its own flag and is priced by it. */
  for (const s of pipeline().sites) assert.equal(typeof s.harmonised, 'boolean');
});

test('a joined launch is read back against the rules it was built under', () => {
  const pre = M.observations.find(o => !o.harmonised);
  const f = forProject(pre.project);
  const wrong = impliedLaunch({ landPsfPpr: pre.landPsfPpr, when: pre.launch, harmonised: true });
  assert.notEqual(f.implied, wrong.psf, 'a pre-harmonisation launch was scored on the harmonised fit');
});

test('the band never collapses to a point', () => {
  /* It did: the accuracy summary was rebuilt without p90 and every range
     silently became a single number, which is the one thing this repo does
     not publish. */
  assert.ok(M.accuracy.p90 > 0, 'accuracy.p90 is missing — impliedLaunch builds its band from it');
  const r = impliedLaunch({ landPsfPpr: 1200, when: '2025-06' });
  assert.ok(r.high > r.psf && r.low < r.psf, `band collapsed: ${r.low}-${r.high}`);
});

test('extrapolation is measured against the live fit own last launch', () => {
  /* The harmonised fit spans a shorter window than the dataset, so it runs
     out of evidence sooner and has to say so sooner. */
  const harmLast = M.observations.filter(o => o.harmonised).map(o => o.launch).sort().at(-1);
  assert.equal(impliedLaunch({ landPsfPpr: 1200, when: harmLast }).extrapolated, 0);
  assert.ok(impliedLaunch({ landPsfPpr: 1200, when: '2028-01' }).extrapolated > 12);
});

test('the band widens past the fitted window, and says how much of it is the drift', () => {
  /* The p90 was measured at dates INSIDE the window, where the drift term is
     interpolating. Past it the drift does real work and it is the least
     pinned thing here — resampling puts it between roughly 30 and 215 psf a
     year. A band that ignores that reads like a measurement when it is a
     forecast. */
  const inside = impliedLaunch({ landPsfPpr: 1323, when: M.fit.to });
  const far = impliedLaunch({ landPsfPpr: 1323, when: '2029-09' });
  assert.equal(inside.bandParts.driftHigh, 0, 'no drift uncertainty is owed inside the window');
  assert.ok(far.bandParts.driftHigh > 0);
  assert.ok((far.high - far.low) > (inside.high - inside.low) * 1.2,
    'the band did not widen materially three years out');
  /* Quadrature, not addition — the p90 already carries some parameter
     uncertainty and adding would count it twice. */
  const expected = Math.sqrt(far.bandParts.modelError ** 2 + far.bandParts.driftHigh ** 2);
  assert.ok(Math.abs((far.high - far.psf) - expected) <= 1);
});

test('the drift is kept because dropping it is worse, not because it looks tidy', () => {
  /* Bootstrap says the drift is almost certainly positive but its magnitude
     is a seven-fold range. Both facts are published, because the second is
     what makes a forward quote a forecast rather than a figure. */
  const d = M.fit.drift;
  assert.ok(d.resamples >= 1000);
  assert.ok(d.perMonthLow > 0 || d.shareNotPositive > 0);
  assert.ok(d.perMonthHigh > d.perMonthLow * 2,
    'a drift interval this tight would be suspicious on 17 launches');
  assert.ok(d.shareNotPositive < 0.2, 'if a fifth of resamples say no drift, it should not be in the model');
});

test('every launch in the table is scored under the rules it was built under', () => {
  /* The route that feeds the observations table omitted the regime flag, so
     the seven pre-harmonisation launches were measured against the
     harmonised fit — the precise error the two-fit split exists to prevent,
     reintroduced one layer up. Checked here rather than in the route because
     this is the invariant, wherever it is called from. */
  const pre = M.observations.filter(o => !o.harmonised);
  assert.ok(pre.length >= 3, 'no pre-harmonisation launches to check');
  for (const o of pre) {
    const right = impliedLaunch({ landPsfPpr: o.landPsfPpr, when: o.launch, harmonised: false });
    const wrong = impliedLaunch({ landPsfPpr: o.landPsfPpr, when: o.launch, harmonised: true });
    assert.notEqual(right.psf, wrong.psf, 'the two fits agree, so this test proves nothing');
    assert.equal(forProject(o.project).implied, right.psf,
      `${o.project} is a pre-harmonisation launch scored on the harmonised fit`);
  }
});

test('a gap inside the model own error is not presented as a finding', () => {
  /* The table coloured a gap at ±5% while the measured p90 is ±9.9%. That
     invites reading the error bar as a mispricing, which is the one thing a
     tool built on a published error must not do. */
  const ui = fs.readFileSync(new URL('../scripts/consult-ui.html', import.meta.url), 'utf8');
  assert.match(ui, /o\.gap > A\.p90 \? 'bad' : o\.gap < -A\.p90 \? 'good'/,
    'the observations table is not thresholding on the measured p90');
  assert.match(ui, /in the noise/);
  assert.ok(!/o\.gap > 0\.05/.test(ui), 'an arbitrary 5% threshold is still in the page');
});
