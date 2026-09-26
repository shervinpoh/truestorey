import { test } from 'node:test';
import assert from 'node:assert';
import { bsd, absd, ssd } from '../lib/calc/stampDuty.js';
import { saleProceeds, cpfAccruedInterest, proceedsStatement } from '../lib/calc/proceeds.js';
import { CPF_OA_RATE, HDB_LOAN_CASH_MIN_REVIEWED } from '../lib/calc/constants.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { affordability } from '../lib/calc/affordability.js';
import { plan } from '../lib/calc/plan.js';

test('BSD on $1,000,000 = $24,600', () => {
  assert.strictEqual(bsd(1_000_000).total, 24_600);
});
test('BSD on $600,000 = $12,600', () => {
  assert.strictEqual(bsd(600_000).total, 12_600);
});
test('ABSD SC first property is zero', () => {
  assert.strictEqual(absd(1_000_000, 'SC', 1).total, 0);
});
test('ABSD SC second property is 20%', () => {
  assert.strictEqual(absd(1_000_000, 'SC', 2).total, 200_000);
});
test('ABSD foreigner is 60%', () => {
  assert.strictEqual(absd(1_000_000, 'FOREIGNER').total, 600_000);
});
test('SSD uses the 4-year schedule for post-Jul-2025 purchases', () => {
  const r = ssd(1_000_000, '2025-08-01', '2029-02-01');
  assert.strictEqual(r.regime, '2025');
  assert.strictEqual(r.rate, 0.04); // 3–4 years
});
test('SSD uses the legacy 3-year schedule for pre-Jul-2025 purchases', () => {
  const r = ssd(1_000_000, '2024-01-01', '2027-06-01');
  assert.strictEqual(r.regime, 'legacy');
  assert.strictEqual(r.rate, 0); // held > 3 years
});
test('SSD changes tier on the calendar anniversary, including across a leap year', () => {
  assert.strictEqual(ssd(1_000_000, '2025-07-07', '2026-07-06').rate, 0.16);
  assert.strictEqual(ssd(1_000_000, '2025-07-07', '2026-07-07').rate, 0.12);
  assert.strictEqual(ssd(1_000_000, '2025-07-07', '2029-07-07').rate, 0);
  assert.strictEqual(ssd(1_000_000, '2024-02-29', '2025-02-27').rate, 0.12);
  assert.strictEqual(ssd(1_000_000, '2024-02-29', '2025-02-28').rate, 0.08);
});
test('SSD follows IRAS dollar rounding and minimum duty', () => {
  assert.strictEqual(ssd(1_000_009, '2025-07-07', '2026-07-06').total, 160_001);
  assert.strictEqual(ssd(1, '2025-07-07', '2026-07-06').total, 1);
});
test('CPF accrued interest compounds', () => {
  assert.ok(cpfAccruedInterest(150_000, 12) > 45_000);
});
test('HDB resale attracts no SSD', () => {
  const p = saleProceeds({ salePrice: 700_000, propertyType: 'HDB', purchaseDate: '2025-01-01' });
  assert.strictEqual(p.ssd.total, 0);
});
test('MSR binds before TDSR for HDB', () => {
  const a = affordability({ applicants: [{ fixedIncome: 8000, age: 35 }], propertyType: 'HDB' });
  assert.strictEqual(a.bindingConstraint, 'MSR');
});

/*
 * A sale that does not clear its own debts.
 *
 * components/Proceeds.jsx used to compute this itself and wrap the answer in
 * Math.max(0, …), so a seller who had to bring money to completion was shown
 * S$0. Measured on the defaults the component ships with: -S$31,864 reported as
 * zero on thin equity, -S$197,747 reported as zero underwater.
 *
 * The floor is the kind of thing that looks like defensive coding and is
 * actually a lie — the number it hides is the only one that changes what a
 * seller does next. saleProceeds returns the negative; the component now names
 * it a shortfall rather than flooring it.
 */
test('a sale that cannot cover its debts returns a negative, not zero', () => {
  const p = saleProceeds({
    salePrice: 450_000,
    outstandingLoan: 400_000,
    cpfPrincipal: 150_000,
    yearsHeld: 18,
    agentFeePct: 2,
    propertyType: 'HDB',
  });
  assert.ok(p.cashInHand < 0,
    `expected a shortfall, got ${p.cashInHand} — a floor here tells a seller in ` +
    'negative equity that they walk away with nothing');
  assert.ok(p.cashInHand < -150_000,
    'the shortfall should reflect loan, CPF refund, accrued interest and fees');
});

test('a CPF refund gap is separated from cash genuinely needed at completion', () => {
  const p = saleProceeds({
    salePrice: 700_000, outstandingLoan: 400_000, cpfPrincipal: 350_000,
    yearsHeld: 8, agentFeePct: 2, propertyType: 'HDB',
  });
  assert.equal(p.cashProceedsAtMarketValue, 0);
  assert.equal(p.nonCpfCompletionShortfall, 0);
  assert.ok(p.cpfRefundGap > 0);
  assert.ok(p.cpfRefundFromProceeds > 0);
  assert.equal(p.cpfRefundFromProceeds + p.cpfRefundGap, p.cpfTotalReturned);
});

test('an entered CPF accrued-interest figure replaces the rough lump estimate', () => {
  const p = saleProceeds({ salePrice: 700_000, cpfPrincipal: 150_000, yearsHeld: 12,
    cpfAccruedInterestOverride: 21_345 });
  assert.equal(p.cpfAccruedInterest, 21_345);
  assert.equal(p.cpfAccruedInterestEstimated, false);
  assert.equal(p.cpfTotalReturned, 171_345);
});

test('the proceeds figures come from the constants, not from literals', () => {
  // Rates drifting between a component and lib/calc/constants.js is a bug this
  // repo has already had once, with the stress rate. Assert the accrual really
  // is the constant rather than a copy that happens to agree today.
  const oneYear = cpfAccruedInterest(100_000, 1);
  const byConstant = Math.round(100_000 * (Math.pow(1 + CPF_OA_RATE / 12, 12) - 1));
  assert.equal(oneYear, byConstant);
});

/*
 * Guards the component itself, by reading it. Same technique as
 * test/motion.test.js and test/guides.test.js: Node does not strip JSX, and a
 * transform would cost more than the three-dependency rule is worth.
 *
 * The failure this catches is someone reintroducing the maths inline — which is
 * not a hypothetical, it is what the file did until 28 Aug.
 */
test('Proceeds.jsx uses the tested module and does not floor the result', () => {
  const src = readFileSync(path.join(process.cwd(), 'components', 'Proceeds.jsx'), 'utf8');

  assert.match(src, /import \{ saleProceeds[ ,]/,
    'Proceeds.jsx no longer imports saleProceeds. The sale-proceeds maths must ' +
    'exist in exactly one place, and lib/calc/proceeds.js is it.');

  assert.ok(!/Math\.max\(\s*0\s*,[^)]*cash/i.test(src) && !/cash\s*=\s*Math\.max\(\s*0/.test(src),
    'Proceeds.jsx floors cash at zero again. That reports S$0 to a seller who ' +
    'would have to bring money to completion — the one figure that changes ' +
    'what they do next.');

  assert.ok(!/0\.025|1\.09\b/.test(src),
    'A rate literal is back in Proceeds.jsx. Rates come from ' +
    'lib/calc/constants.js; two copies is how the stress rate drifted before.');
});

/* ── MSR, TDSR and tenure, by what is actually being bought ──────────────────
 *
 * The guide has said "MSR 30% — HDB flats and ECs bought from developer only"
 * since it was written. The calculators had two categories where there are
 * four, so an EC could not be expressed: sent as HDB it was assessed over 25
 * years instead of 30, and sent as private it escaped MSR. /tools offered a
 * button reading "HDB or EC" and took the first of those.
 */
test('MSR applies to an HDB flat and to a new EC, and to nothing else', () => {
  const who = { applicants: [{ fixedIncome: 9000, age: 35 }], monthlyDebts: 500 };
  assert.strictEqual(affordability({ ...who, propertyType: 'HDB' }).msrApplies, true);
  assert.strictEqual(affordability({ ...who, propertyType: 'EC_DEVELOPER' }).msrApplies, true);
  assert.strictEqual(affordability({ ...who, propertyType: 'EC_RESALE' }).msrApplies, false);
  assert.strictEqual(affordability({ ...who, propertyType: 'PRIVATE' }).msrApplies, false);
});

test('an EC runs to 30 years on both sides of its MOP, an HDB flat to 25', () => {
  const who = { applicants: [{ fixedIncome: 9000, age: 30 }] };
  assert.strictEqual(affordability({ ...who, propertyType: 'HDB' }).tenureCap, 25);
  assert.strictEqual(affordability({ ...who, propertyType: 'EC_DEVELOPER' }).tenureCap, 30);
  assert.strictEqual(affordability({ ...who, propertyType: 'EC_RESALE' }).tenureCap, 30);
  assert.strictEqual(affordability({ ...who, propertyType: 'PRIVATE' }).tenureCap, 30);
});

/* The exact regression: same MSR limit, different tenure, S$54,023 apart. */
test('a new EC is not an HDB flat with a shorter tenure', () => {
  const who = { applicants: [{ fixedIncome: 9000, age: 35 }], monthlyDebts: 500 };
  const hdb = affordability({ ...who, propertyType: 'HDB' });
  const ec = affordability({ ...who, propertyType: 'EC_DEVELOPER' });
  assert.strictEqual(hdb.bindingConstraint, 'MSR');
  assert.strictEqual(ec.bindingConstraint, 'MSR');
  assert.strictEqual(hdb.maxMonthlyRepayment, ec.maxMonthlyRepayment);   // same MSR
  assert.ok(ec.maxLoan > hdb.maxLoan + 50_000, `EC should clear more: ${ec.maxLoan} vs ${hdb.maxLoan}`);
});

/* A resale EC must not be assessed on MSR — that is the whole point of asking
 * which side of the MOP it is on. */
test('a resale EC borrows on TDSR alone', () => {
  const who = { applicants: [{ fixedIncome: 9000, age: 35 }], monthlyDebts: 500 };
  const dev = affordability({ ...who, propertyType: 'EC_DEVELOPER' });
  const resale = affordability({ ...who, propertyType: 'EC_RESALE' });
  assert.strictEqual(resale.bindingConstraint, 'TDSR');
  assert.strictEqual(resale.msrCapacity, null);
  assert.ok(resale.maxLoan > dev.maxLoan);
});

/* An EC is bank financing on both sides. Only an HDB flat can be HDB-financed,
 * and only an HDB loan has no cash floor. */
test('only an HDB flat on an HDB loan escapes the cash floor', () => {
  const base = {
    price: 650_000, applicants: [{ fixedIncome: 6000, age: 35 }, { fixedIncome: 5000, age: 32 }],
    cashAvailable: 80_000, cpfAvailable: 120_000,
  };
  assert.strictEqual(plan({ ...base, propertyType: 'HDB', hdbLoan: true }).cashFloor, 0);
  assert.ok(plan({ ...base, propertyType: 'HDB', hdbLoan: false }).cashFloor > 0);
  assert.ok(plan({ ...base, propertyType: 'EC_DEVELOPER', hdbLoan: true }).cashFloor > 0);
  assert.strictEqual(affordability({ ...base, propertyType: 'EC_DEVELOPER' }).actualRateIfHdbLoan, null);
});

/* The unreviewed figure lowers the cash needed, so it must announce itself. */
test('an unreviewed cash floor is reported as unreviewed', () => {
  const base = { price: 650_000, applicants: [{ fixedIncome: 6000, age: 35 }] };
  assert.strictEqual(plan({ ...base, propertyType: 'HDB', hdbLoan: true }).cashFloorUnverified,
    HDB_LOAN_CASH_MIN_REVIEWED === null);
  assert.strictEqual(plan({ ...base, propertyType: 'HDB', hdbLoan: false }).cashFloorUnverified, false);
});

/**
 * A calculator you cannot see the result of while you change it is a form.
 *
 * .planlayout carries the reason it is two columns: "the answer sticky, so the
 * two figures that matter stay visible while you argue with the assumptions
 * that produce them." Below 900px the aside goes static and that intent is
 * lost — measured on /cost at 375px, the last input sat at 656px and the
 * answer at 2,011px, so every adjustment meant scrolling 1,355px to find out
 * whether anything had moved.
 *
 * .planbar, its CSS and the scroll-padding that stops it covering a focused
 * input have existed since Planner.jsx got them. /cost shares the same layout
 * and never got one, which is why this asserts on both rather than on the one
 * that was broken.
 */
import { readFileSync as readSrc } from 'node:fs';
import { join } from 'node:path';

test('every two-column calculator pins its answer below the breakpoint', () => {
  /* All four, not the one that was broken. /cost was found first, and looking
     for the same shape found /progressive and /lease with it too — the fix had
     reached one of four pages that share this layout. */
  for (const f of ['components/Planner.jsx', 'components/Ledger.jsx',
                   'components/Progressive.jsx', 'components/LeaseView.jsx']) {
    const src = readSrc(join(process.cwd(), f), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.match(code, /className="planlayout"/,
      `${f} is not the two-column calculator this test describes`);
    assert.match(code, /className="planbar"/,
      `${f} has no sticky answer below 900px, so its result is off-screen while you type`);
    /* It repeats the aside verbatim. A screen reader has already been given
       both figures and does not need them announced again on every keystroke. */
    assert.match(code, /className="planbar" aria-hidden="true"/,
      `${f}'s bar is announced twice to a screen reader`);
  }
});

test('the bar cannot cover the input being typed into', () => {
  const css = readSrc(join(process.cwd(), 'app', 'globals.css'), 'utf8');
  assert.match(css, /scroll-padding-bottom:76px/,
    'the page no longer reserves room for the pinned bar');
  assert.match(css, /\.planform input,\.planform select,\.seg button\{scroll-margin-bottom:76px\}/,
    'a focused input can scroll to where the bar covers it');
});

/**
 * A result is not finished when it has only printed a number. The reader also
 * needs to know what moved it, where the arithmetic stops, and what to do with
 * it next. Compact answers keep this inside the sticky summary; denser ones
 * put it immediately below at full width rather than creating a nested scroll
 * region in a result taller than the viewport.
 */
test('the main calculators finish the answer with context and one next step', () => {
  const pairs = [
    ['components/Planner.jsx', 'budget-market'],
    ['components/Ledger.jsx', 'downside'],
    ['components/Progressive.jsx', 'construction-heading'],
    ['components/LeaseView.jsx', 'lease-evidence'],
  ];
  for (const [f, target] of pairs) {
    const src = readSrc(join(process.cwd(), f), 'utf8');
    assert.equal((src.match(/className="resultguide(?:\s[^\"]*)?"/g) || []).length, 1,
      `${f} does not keep one explanation with its headline result`);
    for (const label of ['What changed it', 'What this cannot know', 'Next useful step']) {
      assert.ok(src.includes(label), `${f} omits “${label}” from the result hierarchy`);
    }
    assert.ok(src.includes(`href="#${target}"`),
      `${f}'s next step does not lead to the evidence it names`);
  }
});

test('the affordability answer is conditional on the inputs, not a verdict', () => {
  const src = readSrc(join(process.cwd(), 'components', 'Planner.jsx'), 'utf8');
  assert.match(src, /Answer on these inputs/,
    'the page again makes the reader compare the price and cap to infer an answer');
  assert.match(src, /price \{clears \? 'clears' : 'does not clear'\} the rules and funds you entered/,
    'the answer is no longer explicitly tied to the entered figures');
  assert.match(src, /bank[^<]*approval or valuation/i,
    'the planner does not name the lender decision it cannot make');
});

test('every result-guide anchor exists on the same page', () => {
  const planner = readSrc(join(process.cwd(), 'components', 'Planner.jsx'), 'utf8');
  const ledger = readSrc(join(process.cwd(), 'components', 'Ledger.jsx'), 'utf8');
  const downside = readSrc(join(process.cwd(), 'components', 'Downside.jsx'), 'utf8');
  const progressive = readSrc(join(process.cwd(), 'components', 'Progressive.jsx'), 'utf8');
  const construction = readSrc(join(process.cwd(), 'components', 'ConstructionStudy.jsx'), 'utf8');
  const lease = readSrc(join(process.cwd(), 'components', 'LeaseView.jsx'), 'utf8');
  assert.match(planner, /id="budget-market"/);
  assert.match(ledger, /href="#downside"/);
  assert.match(downside, /id="downside"/);
  assert.match(progressive, /href="#construction-heading"/);
  assert.match(construction, /id="construction-heading"/);
  assert.match(lease, /href="#lease-evidence"/);
  assert.match(lease, /id="lease-evidence"/);
});

test('new-build and lease results name the unknown instead of implying a forecast', () => {
  const progressive = readSrc(join(process.cwd(), 'components', 'Progressive.jsx'), 'utf8');
  const lease = readSrc(join(process.cwd(), 'components', 'LeaseView.jsx'), 'utf8');
  assert.match(progressive, /developer[^<]*notices will arrive/i,
    'the new-build result implies a construction calendar it does not have');
  assert.match(progressive, /interest-only before TOP/i,
    'the new-build result hides the bank-package assumption');
  assert.match(lease, /not a market forecast/i,
    'the lease schedule again reads as a prediction');
});

test('every compact calculator explains its boundary and gives one next action', () => {
  const src = readSrc(join(process.cwd(), 'components', 'Tools.jsx'), 'utf8');
  for (const label of [
    'Understand the HDB selling date', 'Understand the private-property selling date',
    'Understand your borrowing estimate', 'Understand the stamp-duty result',
    'Understand your repayment',
  ]) assert.match(src, new RegExp(`aria-label="${label}"`));
  assert.match(src, /Which HDB classification or scheme/);
  assert.match(src, /\[5, 'Unclassified \/ Standard'\].*\[10, 'Plus \/ Prime'\].*\[20, 'Fresh Start'\]/s);
});

test('the proceeds statement adds up as printed, and counts the CPF refund once', () => {
  /* The block page listed the required refund and the refund paid from the
     proceeds as two deductions, so the column never summed. What is left must
     be the printed arithmetic, match what the module reports within rounding,
     and go negative — never to zero — when the sale does not cover the loan. */
  const cases = [
    { salePrice: 650_000, outstandingLoan: 200_000, cpfPrincipal: 150_000, yearsHeld: 8 },          // enough for everything
    { salePrice: 368_000, outstandingLoan: 180_000, cpfPrincipal: 150_000, yearsHeld: 12 },         // CPF gap
    { salePrice: 300_000, outstandingLoan: 320_000, cpfPrincipal: 100_000, yearsHeld: 5 },          // does not clear the loan
    { salePrice: 1_500_000, outstandingLoan: 900_000, cpfPrincipal: 300_000, yearsHeld: 3,
      propertyType: 'PRIVATE', purchaseDate: '2024-01-01' },                                          // with SSD
  ];
  for (const c of cases) {
    const r = saleProceeds({ agentFeePct: 2, ...c });
    const st = proceedsStatement(r);
    assert.equal(st.price - st.lines.reduce((a, l) => a + l.amount, 0), st.left, 'the column does not add up');
    assert.equal(st.lines.filter(l => l.key === 'cpf').length, 1, 'the CPF refund is counted more than once');
    const expected = r.nonCpfCompletionShortfall > 0 ? -r.nonCpfCompletionShortfall : r.cashProceedsAtMarketValue;
    assert.ok(Math.abs(st.left - expected) <= 2, `left ${st.left}, the module says ${expected}`);
  }
});
