/**
 * The private farming list. Every test here is a confound that already
 * changed the answer while this was being built.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { districts, projects, forProject, model, MIN_R2, _clearCache } from '../lib/consult/privatescan.js';

const M = model(process.cwd());

test('a missing scan is a reason, never a throw', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-'));
  _clearCache();
  assert.equal(districts({ root: d }).ok, false);
  assert.equal(projects({ root: d }).ok, false);
  _clearCache();
});

test('resale only, and condominiums only', () => {
  /* A developer's launch price is set against a launch book, not against the
     neighbours, and an EC's discount is about who may buy it. Either one
     inside a "trades below its district" signal is measuring the wrong thing. */
  assert.equal(M.basis.saleType, 'resale only');
  assert.deepEqual([...M.basis.types].sort(), ['Apartment', 'Condominium']);
});

test('the confounds are all controlled, not just the obvious one', () => {
  /* Size alone is the one everybody thinks of. A 99-year project in a
     freehold district, a 1998 block beside a 2019 one, and a project whose
     recent sales happened to land on low floors are the three that actually
     move the answer. */
  for (const c of ['log floor area', 'freehold', 'remaining lease', 'storey']) {
    assert.ok(M.basis.controls.includes(c), `${c} is not controlled for`);
  }
  assert.ok(M.restatedTo, 'psf must be restated to one quarter or an old project reads as a discount');
});

test('a district whose fit explains almost nothing is kept out of the ranking, and counted', () => {
  /* D04 is Sentosa Cove and sits at R2 0.06 — size, lease and storey do not
     describe it. Ranking its projects against districts the fit describes
     well would be comparing two different measurements. */
  const weak = M.districts.filter(d => d.r2 < MIN_R2).map(d => d.district);
  assert.ok(weak.length, 'no weak district found — has the threshold drifted?');
  const p = projects({ limit: 5000 });
  for (const row of p.rows) assert.ok(!weak.includes(row.district), `D${row.district} is ranked despite a weak fit`);
  assert.ok(p.hidden > 0, 'the exclusion must be counted, not silent');
  assert.ok(districts().rows.some(d => d.weakFit), 'the district table must mark them');
});

test('the project level persists — that is what makes it worth showing at all', () => {
  assert.ok(M.persistence.r > 0.35, `early vs late residual correlates at only ${M.persistence.r}`);
  assert.ok(M.persistence.cheapestFifthStayed > M.persistence.chance,
    'the cheapest fifth is no stickier than chance, so the level is noise');
});

test('a project move is measured against its own district, not against the nation', () => {
  /* Ranking raw drift put Marina One, Scotts Square and Corals at Keppel Bay
     at one end and Bishan 8 and Kovan Melody at the other — CCR down, OCR up.
     True about the market, and not a fact about any of those buildings. Every
     psf is restated on the NATIONAL index, so a lagging district drags all of
     its projects down together. */
  const withBoth = M.projects.filter(p => p.drift != null && p.districtDrift != null && Math.abs(p.districtDrift) > 0.01);
  assert.ok(withBoth.length > 50, 'not enough projects to check the de-meaning');
  for (const p of withBoth.slice(0, 200)) {
    assert.notEqual(p.driftVsDistrict, p.drift, `${p.project} was not de-meaned by its district`);
  }
  /* And the de-meaning is what killed the apparent signal: raw drift looked
     mildly predictive at r=0.20 purely because CCR kept lagging. */
  assert.ok(Math.abs(M.driftBehaviour.r) < 0.2,
    `de-meaned drift correlates at ${M.driftBehaviour.r}; if this is now real, the copy calling it noise must change`);
});

test('the drift column never claims to forecast', () => {
  const p = projects({ by: 'drift' });
  assert.match(p.says + p.driftBehaviour.says, /describes what HAS happened|carries on|REVERSES/);
  if (Math.abs(M.driftBehaviour.r) < 0.2) {
    assert.match(p.driftBehaviour.says, /never to time one/);
  }
});

test('the level ranking says out loud that it is mostly address', () => {
  /* Ardmore Park at +72% is not overpriced. A tool that lets that read as a
     mispricing is worse than no tool. */
  const p = projects({ by: 'gap' });
  assert.match(p.says, /address and build quality/);
  assert.match(p.says, /not as a list of mispricings/);
});

test('the size gradient is published per district, because it is not the same everywhere', () => {
  const d = districts();
  const vals = d.rows.map(x => x.per10PctLarger).filter(Number.isFinite);
  assert.equal(vals.length, d.rows.length);
  /* The finding: near zero in the prime districts, clearly negative outside
     them. If that spread ever collapses, one national figure would do and
     this column would be pointless. */
  assert.ok(Math.max(...vals) - Math.min(...vals) > 0.01,
    'every district has the same size gradient — a single figure would do');
  assert.ok(d.sizeSays && /quantum ceiling/.test(d.sizeSays));
});

test('a 999-year lease is treated as freehold, not as a long leasehold', () => {
  const odd = M.projects.filter(p => p.freehold && p.medianRemaining !== null);
  assert.equal(odd.length, 0, 'a freehold project is carrying a remaining-lease figure');
});

test('filters narrow the list rather than silently returning everything', () => {
  const all = projects({ limit: 5000 }).total;
  const fh = projects({ freehold: true, limit: 5000 }).total;
  const d15 = projects({ district: '15', limit: 5000 }).total;
  const big = projects({ minSales: 30, limit: 5000 }).total;
  for (const [label, n] of [['freehold', fh], ['district', d15], ['minSales', big]]) {
    assert.ok(n > 0 && n < all, `${label} filter returned ${n} of ${all}`);
  }
});

test('one project can be looked up beside its district fit', () => {
  const p = forProject(M.projects[0].project);
  assert.ok(p.districtFit && Number.isFinite(p.districtFit.r2));
  assert.equal(forProject('NOT A REAL PROJECT ANYWHERE'), null);
});

test('a catch-all bucket is not ranked as if it were a building', () => {
  /* URA files unnamed developments under RESIDENTIAL APARTMENTS, which spans
     90 streets. Ranked as one row it is ninety buildings averaged together
     and presented as a building — the most confidently wrong thing a farming
     list can contain. Caught by street count, so a new bucket name needs no
     edit here. */
  assert.ok(M.catchAllNames.includes('RESIDENTIAL APARTMENTS'));
  assert.ok(M.bucketed > 0, 'the exclusion must be counted');
  for (const name of M.catchAllNames) {
    assert.ok(!M.projects.some(p => p.project === name), `${name} is still in the ranking`);
  }
});

test('a project with sales under both tenures is flagged rather than averaged quietly', () => {
  for (const p of M.projects) {
    assert.equal(typeof p.mixedTenure, 'boolean');
    if (p.freehold) assert.equal(p.medianRemaining, null);
    else assert.ok(p.medianRemaining > 0, `${p.project} is leasehold with no remaining lease`);
  }
});
