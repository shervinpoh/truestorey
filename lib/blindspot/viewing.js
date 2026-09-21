/**
 * The human bridge after a Blindspot result.
 *
 * These are questions, not new findings. They are deliberately selected from
 * the checks the rubric already ran (or explicitly could not run), so this
 * layer cannot smuggle a model's opinion into the score. One in-person unit
 * question always remains: public records cannot see condition, noise or
 * alterations, however complete the transaction data is.
 */

const QUESTION = {
  price: {
    label: 'Asking price',
    flagged: 'Which unit-specific differences support this asking price against the filed comparables shown below?',
    context: 'What condition, renovation or unit-specific features are not captured by the filed comparables?',
    skipped: 'What recent comparable supports the asking price, since the public record held too little to assess it?',
  },
  lease: {
    label: 'Remaining lease',
    flagged: 'If I sell after my likely holding period, how much lease will remain—and which buyers or financing rules may matter then?',
    skipped: 'Can the tenure and lease commencement date be confirmed, since the public record could not establish the remaining lease?',
  },
  liquidity: {
    label: 'Resale demand',
    flagged: 'Why do homes here change hands less often, and how long has this particular unit been on the market?',
    context: 'How long has this unit been on the market, and how does that compare with the filed sales activity here?',
    skipped: 'How often do similar homes here find a buyer, since the filed record was not enough to measure resale activity?',
  },
  supply: {
    label: 'Nearby MOP supply',
    flagged: 'Which nearby flats reach their Minimum Occupation Period before I may sell, and how similar are they to this home?',
    skipped: 'What nearby HDB supply may reach its Minimum Occupation Period during my holding period, since this check could not run?',
  },
  gls: {
    label: 'Land coming',
    flagged: 'Where is the nearby Government Land Sales site relative to this unit, and what construction or future supply could it bring?',
    skipped: 'Which Government Land Sales sites sit nearby, and what has URA actually published about them, since this check could not run?',
  },
  view: {
    label: 'Approved nearby work',
    flagged: 'Where is the approved development relative to this stack, and what could it change about light, noise or access?',
    skipped: 'What URA-approved work sits nearby, since the planning record could not be read for this check?',
  },
};

const INSIDE = {
  key: 'inside',
  label: 'Inside the unit',
  status: 'in-person',
  question: 'What cannot be seen in the listing photos—water ingress, noise at different times, alterations, defects or renovation work nearing replacement?',
};

const asQuestion = (check, status) => {
  const copy = QUESTION[check?.key];
  const question = copy?.[status];
  return question ? { key: check.key, label: copy.label, status, question } : null;
};

/**
 * At most three questions: the strongest flag, one unknown if there is one,
 * then the unit itself. Remaining space goes to the next flag, followed by
 * price and resale context. This keeps the brief useful without reproducing
 * all six checks in a second format.
 */
export function viewingQuestions(report, limit = 3) {
  const count = Math.max(0, Math.floor(limit));
  if (!count) return [];

  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const skipped = Array.isArray(report?.skipped) ? report.skipped : [];
  const flagged = checks.filter(c => c.points > 0).sort((a, b) =>
    (b.points / (b.max || 1)) - (a.points / (a.max || 1)));
  const room = Math.max(0, count - 1);
  const chosen = [];
  const used = new Set();
  const add = q => {
    if (q && !used.has(q.key) && chosen.length < room) {
      chosen.push(q);
      used.add(q.key);
    }
  };

  add(asQuestion(flagged[0], 'flagged'));
  add(asQuestion(skipped[0], 'skipped'));
  for (const c of flagged.slice(1)) add(asQuestion(c, 'flagged'));
  for (const s of skipped.slice(1)) add(asQuestion(s, 'skipped'));

  // A clean result is not a clean bill. Price and resale context remain useful
  // questions even when neither added a point.
  for (const key of ['price', 'liquidity']) {
    add(asQuestion(checks.find(c => c.key === key), 'context'));
  }

  return [...chosen, INSIDE].slice(0, count);
}
