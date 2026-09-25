/**
 * The paragraph under a Blindspot score, written from the report itself.
 *
 * ── IT USED TO BE WRITTEN BY A MODEL, AND IT GOT THE NUMBERS WRONG ─────────
 * The route sent the finished analysis to a language model with a rule — never
 * produce a number that is not already in the analysis — and nothing enforced
 * the rule. On 25 Sep a check on Blk 242 Bishan St 22 scored 3 of 15, lease 1
 * and resale activity 2, and the paragraph beside it said the lease added one
 * point and "the remaining four points come from transaction thinness". A
 * second summary gave an approval date a day off. Two wrong figures in seven
 * summaries, in the most-used tool, under a CEA registration.
 *
 * CLAUDE.md already records that a prompt rule alone does not hold (the
 * Manchester case), and that a model never assigns a number. A check that
 * compared the paragraph's numbers against the report could not have caught
 * the first error either: 4 was a real number in that report — four HDB blocks
 * in the cohort — used in the wrong sentence.
 *
 * So the paragraph is assembled here, from the score, the band and each
 * check's own `finding`, which the rubric already publishes as a fixed
 * sentence. Every figure it prints was computed before it was written. It also
 * took seven to ten seconds off every check, which was the model's round trip.
 *
 * ── WHAT IT MUST ALWAYS SAY ────────────────────────────────────────────────
 * Which checks the points came from, which could not run — never as a pass —
 * and which do not apply, which is a different statement from "not measured".
 */

import { titleCase } from '../name.js';

const list = items => items.length <= 1 ? (items[0] || '')
  : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

export function summarise(report) {
  if (!report || !Array.isArray(report.checks)) return null;
  const { points, max, band } = report;
  // The page's own form of the name: "Blk 242 Bishan St 22", not the filed
  // capitals, and a landed street without the "Landed ·" index prefix.
  const label = report.record?.label
    ? titleCase(String(report.record.label).replace(/^Landed\s*·\s*/i, ''))
    : 'This property';
  const checks = report.checks;
  const flagged = checks.filter(c => c.points > 0);
  const skipped = report.skipped || [];
  const notApplicable = report.notApplicable || [];

  const first = [];
  first.push(`${label} scores ${points} of a possible ${max} — ${band}.`);
  if (flagged.length) {
    first.push(`The points come from ${list(flagged.map(c =>
      `${lower(c.title)} (${c.points} of ${c.max})`))}.`);
    for (const c of flagged) first.push(`${c.title}: ${c.finding}`);
  } else if (checks.length) {
    first.push('None of the checks that ran added a point.');
  }

  const second = [];
  const ran = checks.length;
  const total = report.rubric?.length || ran + skipped.length + notApplicable.length;
  second.push(ran === total ? `All ${total} checks ran.` : `${ran} of the ${total} checks ran.`);
  if (skipped.length) {
    second.push(`${list(skipped.map(s => s.title))} could not run, so ${skipped.length === 1 ? 'it adds' : 'they add'} `
      + 'no points — which is not the same as finding no risk there.');
  }
  if (notApplicable.length) {
    second.push(`${list(notApplicable.map(s => s.title))} ${notApplicable.length === 1 ? 'does' : 'do'} not apply `
      + 'to this property and is left out of the possible total.');
  }
  second.push(points <= max / 3
    ? 'A low score means few things this tool measures stood out, not that nothing is worth asking about.'
    : 'A higher score means more to look into before you commit, not that the home is a bad buy.');

  return `${first.join(' ')}\n\n${second.join(' ')}`;
}
