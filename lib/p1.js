/**
 * Primary 1 registration, as MOE published it — read, not modelled.
 *
 * ── WHAT A "REACH" IS, AND WHY IT IS NOT A RATIO ───────────────────────────
 * The brief this answers coloured schools by an oversubscription ratio with
 * thresholds somebody chose. A ratio says how many applied per place; it does
 * not say who got in. MOE says exactly that, in one sentence per phase:
 * "Conducted for: Singapore Citizen children residing between 1km and 2km of
 * the school" — which means everyone nearer got a place, everyone further did
 * not, and the band in between went to a ballot. That sentence is the finding.
 * The ratio is kept, beside it, as MOE's own two numbers divided.
 *
 * So a phase's REACH is read off MOE's wording into one of six ordered
 * steps, for Singapore Citizen children — the group most readers are in:
 *
 *   0  no places were offered in this phase
 *   1  every citizen applicant got a place
 *   2  citizens within 2 km all got places; beyond 2 km was balloted or shut out
 *   3  citizens within 1 km all got places; 1–2 km went to a ballot
 *   4  only citizens within 1 km got places, no ballot needed
 *   5  even within 1 km it went to a ballot
 *
 * A ballot that MOE says was for Permanent Resident children only means every
 * citizen got a place (step 1) — and says so, because a PR family reads it
 * differently.
 *
 * ── RULE 11 ────────────────────────────────────────────────────────────────
 * This is what happened in one past exercise. Nothing here says what will
 * happen, and no step means a place is assured: every label is past tense and
 * carries its year.
 *
 * Pure. The ingest, the pages and node:test all use it.
 */

/** MOE's phase codes, in the order places are offered. "0" is not shown by
 *  MOE and is not used here; "1" carries the vacancies available at the start. */
export const PHASES = [
  { code: '1', label: 'Phase 1', who: 'A sibling already at the school' },
  { code: '2A', label: 'Phase 2A', who: 'A parent or sibling who studied there, or a parent on staff or the advisory committee' },
  { code: '2B', label: 'Phase 2B', who: 'A parent who volunteers, or is a member of a connected church, clan or community group' },
  { code: '2C', label: 'Phase 2C', who: 'Everyone not yet registered — no connection needed' },
  { code: '2CS', label: 'Phase 2C Supplementary', who: 'Those who did not get a place in 2C' },
];

export const REACH = [
  { step: 0, key: 'none', short: 'No places in this phase', long: 'No places were offered in this phase.' },
  { step: 1, key: 'open', short: 'Every citizen got a place', long: 'Every Singapore Citizen applicant was offered a place.' },
  { step: 2, key: 'within2', short: 'Within 2 km got places', long: 'Citizens within 2 km were all offered places; beyond 2 km was balloted or not reached.' },
  { step: 3, key: 'ballot12', short: 'Ballot at 1–2 km', long: 'Citizens within 1 km were all offered places; 1–2 km went to a ballot.' },
  { step: 4, key: 'within1', short: 'Only within 1 km', long: 'Only citizens within 1 km were offered places.' },
  { step: 5, key: 'ballot1', short: 'Ballot even within 1 km', long: 'Even citizens within 1 km went to a ballot.' },
];

const n = v => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * One MOE phase row → its reach, from MOE's own sentence.
 * Unrecognised wording returns step null with the wording kept, so a change
 * on MOE's side shows up as "not read" rather than as a confident colour.
 */
export function reachOf(row) {
  const copy = String(row?.balloting_content_copy || row?.copy || '').trim();
  const vac = n(row?.total_vacancies ?? row?.vacancies);
  const ballot = row?.balloting_required === true || row?.ballot === true;
  const pr = /Permanent Resident/i.test(copy);
  const band = /within 1km/i.test(copy) ? 'within1' : /between 1km and 2km/i.test(copy) ? '1to2'
    : /(outside|beyond) 2km/i.test(copy) ? 'beyond2' : /within 2km/i.test(copy) ? 'within2' : null;

  if (vac === 0) return { ...REACH[0], copy, pr: false };
  if (!copy) return { ...REACH[1], copy, pr: false };
  if (/Places were offered to all Singapore Citizen children/i.test(copy)) return { ...REACH[1], copy, pr };
  if (ballot && pr) return { ...REACH[1], copy, pr: true };
  if (ballot) {
    if (band === 'within1') return { ...REACH[5], copy, pr: false };
    if (band === '1to2') return { ...REACH[3], copy, pr: false };
    if (band === 'beyond2') return { ...REACH[2], copy, pr: false };
  } else {
    if (band === 'within1') return { ...REACH[4], copy, pr: false };
    if (band === 'within2') return { ...REACH[2], copy, pr: false };
  }
  return { step: null, key: 'unread', short: 'MOE’s wording not read', long: copy, copy, pr };
}

/** Applicants per place, as MOE's two numbers divided. Null when either is missing or zero. */
export function ratioOf(row) {
  const v = n(row?.total_vacancies ?? row?.vacancies), a = n(row?.total_applicants ?? row?.applicants);
  return v > 0 && a !== null && a > 0 ? Math.round((a / v) * 100) / 100 : null;
}

/** Names as keys: MOE writes "Admiralty Primary School", data.gov.sg "ADMIRALTY PRIMARY SCHOOL". */
export const nameKey = s => String(s || '').toUpperCase().replace(/\bST\.?\s/g, 'ST ').replace(/[’']/g, "'")
  .replace(/[^A-Z0-9()' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * MOE's name → data.gov.sg's name, where the two government lists word the
 * same school differently. Exact, not fuzzy: a school renamed upstream fails
 * the test that every MOE school resolves, instead of silently dropping off
 * the map. The three mixed-level schools drop "(Primary)" on data.gov.sg,
 * which lists the whole P1–S4 campus under one name at one coordinate.
 */
export const MOE_ALIAS = {
  'CATHOLIC HIGH SCHOOL (PRIMARY)': 'CATHOLIC HIGH SCHOOL',
  "CHIJ ST NICHOLAS GIRLS' SCHOOL (PRIMARY)": "CHIJ ST NICHOLAS GIRLS' SCHOOL",
  'MARIS STELLA HIGH SCHOOL (PRIMARY)': 'MARIS STELLA HIGH SCHOOL',
  "ST ANDREW'S JUNIOR SCHOOL": "ST ANDREW'S SCHOOL (JUNIOR)",
};
export const moeKey = s => { const k = nameKey(s); return MOE_ALIAS[k] || k; };

export const schoolSlug = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Straight-line metres between two points. Straight-line, and labelled so everywhere it is shown. */
export function metres(aLat, aLon, bLat, bLon) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
