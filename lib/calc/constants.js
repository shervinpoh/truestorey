/**
 * SINGLE SOURCE OF TRUTH for every rate, threshold and rule.
 * Every figure carries its source and effective date — CEA PG 02-11 s3.1
 * requires market/return claims to be substantiated from credible sources.
 * When a rate changes, change it HERE and nowhere else.
 */

export const RATES_REVIEWED = '2026-08-21';

/** HDB concessionary loan rate. Pegged 0.1% above CPF OA. */
export const HDB_CONCESSIONARY_RATE = 0.026;

/** CPF Ordinary Account rate — governs accrued interest on refund. NOT the loan rate. */
export const CPF_OA_RATE = 0.025;

/** Buyer's Stamp Duty, residential. Effective 15 Feb 2023. */
export const BSD_RESIDENTIAL = [
  { upTo: 180_000, rate: 0.01 },
  { upTo: 360_000, rate: 0.02 },
  { upTo: 1_000_000, rate: 0.03 },
  { upTo: 1_500_000, rate: 0.04 },
  { upTo: 3_000_000, rate: 0.05 },
  { upTo: Infinity, rate: 0.06 },
];

/** ABSD, residential. Effective 27 Apr 2023. Confirmed unchanged as at Jun 2026. */
export const ABSD = {
  SC:  { 1: 0.00, 2: 0.20, 3: 0.30 },
  SPR: { 1: 0.05, 2: 0.30, 3: 0.35 },
  FOREIGNER: 0.60,
  ENTITY: 0.65,
  TRUSTEE: 0.65,
};

/**
 * Seller's Stamp Duty, residential.
 * ⚠ Changed 4 Jul 2025 — holding period extended 3y → 4y and rates raised.
 * Which schedule applies depends on the PURCHASE date, not the sale date.
 */
export const SSD_FROM_2025_07_04 = [
  { withinYears: 1, rate: 0.16 },
  { withinYears: 2, rate: 0.12 },
  { withinYears: 3, rate: 0.08 },
  { withinYears: 4, rate: 0.04 },
];
export const SSD_LEGACY_2017_03_11 = [
  { withinYears: 1, rate: 0.12 },
  { withinYears: 2, rate: 0.08 },
  { withinYears: 3, rate: 0.04 },
];
export const SSD_REGIME_CHANGE = new Date('2025-07-04');

/** Financing limits. */
export const TDSR_LIMIT = 0.55;         // all property
export const MSR_LIMIT  = 0.30;         // HDB and EC from developer only

/**
 * The four ways a home is financed here, which is not the same as the four
 * kinds of home. An EC is the one that catches people: from the developer it is
 * assessed like an HDB flat and repaid like a private one.
 *
 *   HDB           MSR + TDSR · 25-year cap
 *   EC_DEVELOPER  MSR + TDSR · 30-year cap · bank financing only
 *   EC_RESALE     TDSR only  · 30-year cap — a resale EC is private for this
 *   PRIVATE       TDSR only  · 30-year cap
 *
 * Source: content/guides/absd-tdsr-ssd.md, "MSR 30% — HDB flats and ECs bought
 * from developer only", itself from the build pack. The guide has said this
 * since it was written; the calculators did not implement it, which is the
 * two-places-disagreeing failure this file exists to prevent.
 */
export const MSR_APPLIES = ['HDB', 'EC_DEVELOPER'];
export const PROPERTY_TYPES = ['HDB', 'EC_DEVELOPER', 'EC_RESALE', 'PRIVATE'];
/* MAS medium-term rate floor, residential. Confirmed at 4.0% by Shervin on
 * 24 Aug 2026, resolving a disagreement with the deck research base, which had
 * said 4.0% while this file said 4.2%. Both now say 4.0%. */
export const STRESS_TEST_RATE = 0.04;
export const VARIABLE_INCOME_HAIRCUT = 0.30;

/** HDB minimum occupation period. */
export const MOP_YEARS = 5;

export const GST_RATE = 0.09;

export const SOURCES = {
  bsd:  { name: 'IRAS — Buyer’s Stamp Duty', effective: '2023-02-15' },
  absd: { name: 'IRAS — Additional Buyer’s Stamp Duty', effective: '2023-04-27' },
  ssd:  { name: 'IRAS — Seller’s Stamp Duty', effective: '2025-07-04' },
  hdbLoan: { name: 'HDB concessionary loan rate', effective: '2026-08-21' },
  cpf:  { name: 'CPF Ordinary Account interest rate', effective: '2026-08-21' },
};

/**
 * Loan-to-value ceilings, the minimum cash portion, and mortgage duty.
 *
 * Source: sales-deck-build-pack-v3.md A3, itself sourced from the MAS notices
 * and HDB's own page. Reconciled against this file on 24 Aug 2026.
 *
 * Two things worth keeping in the comment rather than only in the table:
 *   - HDB's concessionary LTV was cut 80% -> 75% on 20 Aug 2024 and now sits
 *     level with the banks. Anything written before that date is wrong.
 *   - "Extended" means a tenure over 30 years (25 for HDB) OR one that runs
 *     past the borrower's 65th birthday. It is not only about age.
 */
export const LTV = [
  { loansOutstanding: 0, max: 0.75, extended: 0.55, cashMin: 0.05, cashMinExtended: 0.10 },
  { loansOutstanding: 1, max: 0.45, extended: 0.25, cashMin: 0.25, cashMinExtended: 0.25 },
  { loansOutstanding: 2, max: 0.35, extended: 0.15, cashMin: 0.25, cashMinExtended: 0.25 },
];
export const LTV_REVIEWED = '2026-08-24';

/**
 * Extended tenure thresholds, by property type.
 *
 * An EC is private property and carries the 30-year cap, on both sides of its
 * MOP. Assessing one over 25 years understates the loan by about S$54,000 on a
 * S$9,000 household — which is what /tools did while its own button read
 * "HDB or EC".
 */
export const TENURE_CAP = { HDB: 25, EC_DEVELOPER: 30, EC_RESALE: 30, PRIVATE: 30 };
export const TENURE_AGE_LIMIT = 65;

/**
 * The minimum cash share of the downpayment, when the loan is from HDB.
 *
 * An HDB concessionary loan takes the whole 25% downpayment from CPF OA if the
 * OA can carry it — there is no cash floor. Every bank loan has one, including
 * a bank loan on an HDB flat, and that 5% is the figure that decides whether a
 * buyer can complete.
 *
 * This is why the "Loan from" control exists. It was inert before: the LTV
 * ceilings levelled at 75% in Aug 2024, the code stopped using `hdbLoan` for
 * anything, and the control stayed on the page changing nothing while its hint
 * text described two differences that were both out of date.
 *
 * Confirmed by Shervin on 30 Aug 2026, resolving the same way the 4.0% stress
 * rate was: asked directly, answered directly — "ask if taking hdb loan or
 * bank loan, and then different options would have the specific cash floors".
 * The planner asks, and each answer carries its own floor.
 */
export const HDB_LOAN_CASH_MIN = 0;
export const HDB_LOAN_CASH_MIN_REVIEWED = '2026-08-30';

/**
 * Mortgage stamp duty. 0.4% of the loan, capped at $500, paid by the borrower.
 * The build pack calls it "the one everybody forgets" and it is left out of
 * every competitor calculator, so it is in the chain here.
 */
export const MORTGAGE_DUTY = { rate: 0.004, cap: 500 };
