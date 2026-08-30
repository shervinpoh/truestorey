import test from 'node:test';
import assert from 'node:assert/strict';
import { progressive, totalPct, STAGES, BUC_SOURCE, NOTICE_DAYS, STAMPING } from '../lib/calc/buc.js';

/* The schedule is statute. If it does not account for the whole price, it is
 * not the schedule. */
test('the nine stages account for the entire purchase price', () => {
  assert.equal(STAGES.length, 9);
  assert.equal(totalPct(), 100);
});

/*
 * THE WORDING IS A QUOTATION AND THESE ARE THE TWO THAT GET PARAPHRASED.
 * The competitor calculator this was checked against renders stage 3 as "brick
 * walls" — partition walls are routinely drywall or precast — and stage 4 as
 * "ceiling", which is a different building element from roofing. Both send a
 * buyer to watch for the wrong milestone.
 */
test('the statutory wording is not paraphrased', () => {
  const walls = STAGES.find(s => s.on === 'Partition walls');
  assert.match(walls.wording, /partition walls of the Building have been completed/);
  assert.doesNotMatch(walls.wording, /brick/i, 'the Rules do not specify a material');

  const roof = STAGES.find(s => s.on === 'Roofing');
  assert.match(roof.wording, /roofing of the Building has been completed/);
  assert.doesNotMatch(roof.wording, /ceiling/i, 'roofing and ceiling are different things');

  // "of the Building", never "for unit" — these are building-level milestones.
  for (const s of STAGES.slice(1, 7)) {
    assert.match(s.wording, /of the Building|serving the Housing Estate/,
      `"${s.on}" no longer says whose completion it is`);
  }
});

/* The last 15% is not all the developer's, and that is the part a buyer most
 * needs to know. */
test('the stakeholder on the final 15% is named', () => {
  const last = STAGES.at(-1);
  assert.equal(last.pct, 15);
  assert.match(last.wording, /Singapore Academy of Law as stakeholder/);
  assert.match(last.wording, /2%/);
  assert.match(last.wording, /13%/);
});

/* Every stage falls due on NOTICE. Publishing durations beside statutory
 * percentages implies a calendar nobody has promised. */
test('no stage carries a duration', () => {
  assert.equal(NOTICE_DAYS, 14);
  for (const s of STAGES) {
    assert.ok(!('months' in s) && !('duration' in s),
      `"${s.on}" has grown a duration — the Rules do not set one`);
  }
  // The DATA, not the prose. The first version of this scanned the whole
  // source file and went red on the comment that explains why durations are
  // absent — which quotes the competitor's "6-9 months" as the thing not to do.
  assert.doesNotMatch(JSON.stringify(STAGES), /\d\s*-\s*\d\s*months|weeks after/i,
    'a duration has appeared in the schedule data');
});

/* ── the ladder ─────────────────────────────────────────────────────────────
 * Cross-checked against an independent implementation of the same schedule on
 * a S$1,000,000 purchase at 75% / 2.5% / 25 years. The figures agree to the
 * dollar, which is the point: the maths was never what differed.
 */
test('the drawdown ladder splits equity first, then the bank', () => {
  const r = progressive({ price: 1_000_000, ltv: 0.75, rate: 0.025, tenureYears: 25 });
  assert.equal(Math.round(r.cashCpfTotal), 250_000);
  assert.equal(Math.round(r.loanTotal), 750_000);
  assert.equal(Math.round(r.rows[0].own), 200_000, 'the 20% on signing is all the buyer');
  assert.equal(Math.round(r.rows[0].loan), 0, 'no bank money before the equity is in');
  assert.equal(Math.round(r.rows[1].own), 50_000, 'foundation takes the last of the 25%');
  assert.equal(Math.round(r.rows[1].loan), 50_000);
  assert.equal(Math.round(r.rows[2].own), 0, 'everything after is a drawdown');
});

test('the instalment climbs because only what is drawn is charged', () => {
  const r = progressive({ price: 1_000_000, ltv: 0.75, rate: 0.025, tenureYears: 25 });
  const m = r.rows.map(x => Math.round(x.monthly));
  assert.equal(m[0], 0, 'no loan has been disbursed yet');
  assert.deepEqual(m.slice(1), [224, 673, 897, 1122, 1346, 1570, 2692, 3365]);
  for (let i = 2; i < m.length; i++) assert.ok(m[i] > m[i - 1], 'the ladder must only climb');
});

/* The booking fee is per project — the Rules say "such amount as set out in
 * item 2 of the Fourth Schedule". 5% is convention, so it is a default. */
test('the booking fee is an input, not a constant', () => {
  const a = progressive({ price: 1_000_000, bookingFeePct: 0.05 });
  const b = progressive({ price: 1_000_000, bookingFeePct: 0.10 });
  assert.equal(a.bookingFee, 50_000);
  assert.equal(b.bookingFee, 100_000);
  // Either way the first statutory stage is still 20% of the price.
  assert.equal(Math.round(a.bookingFee + a.signingBalance), 200_000);
  assert.equal(Math.round(b.bookingFee + b.signingBalance), 200_000);
});

test('a lower LTV moves the crossover later, not the percentages', () => {
  const r = progressive({ price: 1_000_000, ltv: 0.55 });
  assert.equal(Math.round(r.cashCpfTotal), 450_000);
  assert.equal(Math.round(r.loanTotal), 550_000);
  assert.equal(totalPct(), 100, 'the statutory schedule never moves with the LTV');
});

test('a zero price produces zeroes rather than NaN', () => {
  const r = progressive({ price: 0 });
  assert.equal(r.loanTotal, 0);
  assert.ok(r.rows.every(x => Number.isFinite(x.monthly)));
});

/* CEA PG 02-11 s3.1 — the figures are only defensible with the source beside
 * them, and this one is a statute with a version date. */
test('the schedule carries its source and the version it was read against', () => {
  assert.match(BUC_SOURCE.name, /Housing Developers Rules/);
  assert.match(BUC_SOURCE.url, /^https:\/\/sso\.agc\.gov\.sg\//);
  assert.match(BUC_SOURCE.versionAsAt, /^\d{4}-\d{2}-\d{2}$/);
});

/* ── stamp duty timing ──────────────────────────────────────────────────────
 *
 * "Stamp Duty must be paid within 14 days of signing the S&P" is correct and
 * it is half the rule. It omits the 30-day limb, which is the one a foreign
 * buyer needs, and the penalties — and the penalty is the part that changes
 * behaviour. Four times the duty on a S$1.5m purchase is not a late fee.
 */
test('the stamping deadline carries both limbs and both penalties', () => {
  assert.equal(STAMPING.withinDaysInSingapore, 14);
  assert.equal(STAMPING.withinDaysAbroad, 30);
  assert.equal(STAMPING.penalties.length, 2);
  assert.match(STAMPING.penalties[1].rule, /FOUR TIMES/);
  // s 47: the clock starts the day AFTER execution. Off by one in the buyer's
  // favour, and the kind of detail a paraphrase loses.
  assert.match(STAMPING.clockStarts, /day after/);
  assert.match(STAMPING.source, /Stamp Duties Act 1929/);
  assert.match(STAMPING.url, /^https:\/\/sso\.agc\.gov\.sg\//);
});

/* Duty is money ON TOP of the price. Folding it into a stage percentage would
 * corrupt a statutory schedule with a figure the schedule does not contain. */
test('stamp duty never enters the statutory ladder', () => {
  const r = progressive({ price: 1_500_000 });
  assert.equal(totalPct(), 100);
  assert.equal(Math.round(r.rows.reduce((a, x) => a + x.due, 0)), 1_500_000,
    'the stages must still sum to exactly the price, with no duty mixed in');
});
