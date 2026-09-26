/**
 * Which record a private sale belongs to — the one rule, shared.
 *
 * scripts/build-index.mjs addresses a house by its street and everything else
 * by its project (its note says why), and lib/schools.js groups sales by the
 * same key to give each project its sizes. Two copies of this rule would
 * disagree the first time either changed; this repo has already paid for that
 * once with its rates.
 */
const STRATA = /^Strata/i;
const HOUSE = /Terrace|Semi-detached|Detached/i;

/** A Terrace, Semi-detached or Detached that is not strata: a house, on its street. */
export const isHouse = r => HOUSE.test(r.propertyType) && !STRATA.test(r.propertyType);

/** The key a record's id is built from: `P:${privateKey(row)}`. */
export const privateKey = r => (isHouse(r) ? `street|${r.street}` : `proj|${r.project}`);
