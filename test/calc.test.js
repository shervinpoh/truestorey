import { test } from 'node:test';
import assert from 'node:assert';
import { bsd, absd, ssd } from '../lib/calc/stampDuty.js';
import { saleProceeds, cpfAccruedInterest } from '../lib/calc/proceeds.js';
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
