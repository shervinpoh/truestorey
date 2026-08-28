import { test } from 'node:test';
import assert from 'node:assert';
import { bsd, absd, ssd } from '../lib/calc/stampDuty.js';
import { saleProceeds, cpfAccruedInterest } from '../lib/calc/proceeds.js';
import { CPF_OA_RATE } from '../lib/calc/constants.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { affordability } from '../lib/calc/affordability.js';

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

  assert.match(src, /import \{ saleProceeds \}/,
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
