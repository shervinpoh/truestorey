/**
 * The /progressive ladder as an email: what you pay before the bank pays
 * anything, and what the instalment climbs to as the building goes up.
 *
 * Same two rules as the other reports. The figures are recomputed here from
 * lib/calc/buc.js rather than posted, and `progressiveResult` is the ONE
 * mapping the page renders from too.
 *
 * WHAT IT MAY SAY. The statutory ladder, the reader's own price and loan terms,
 * and the two stamp duties. The stage percentages are the Housing Developers
 * Rules; the booking fee is not fixed by law and the report says so, because
 * the difference between a tool and a brochure is admitting which numbers the
 * Rules do not set.
 */
import { progressive, BUC_SOURCE, NOTICE_DAYS, STAMPING } from '../calc/buc.js';
import { bsd, absd } from '../calc/stampDuty.js';
import { SOURCES } from '../calc/constants.js';
import { S, bullets, esc, figure, footer, head, money, pct, table } from './shell.js';

const PROFILE_NAMES = { SC: 'Singapore Citizen', SPR: 'Permanent Resident', FOREIGNER: 'Foreigner' };

/** One mapping from the page's fields to lib/calc/buc.js and the duties. */
export function progressiveResult(v) {
  const price = Number(v.price) || 0;
  const r = progressive({
    price,
    ltv: Number(v.ltv),
    bookingFeePct: Number(v.fee),
    rate: (Number(v.rate) || 0) / 100,
    tenureYears: Number(v.tenure) || 25,
  });
  /* Stamp duty is NOT part of the price, so it is not part of the ladder — it
     is money on top, due on its own clock. Folding it into a stage percentage
     would corrupt a statutory schedule with a figure the schedule does not
     contain. */
  const b = bsd(price), a = absd(price, v.profile, Number(v.owned) || 1);
  const duty = { bsd: b.total, absd: a.total, absdRate: a.rate, total: b.total + a.total };
  return { r, duty, firstDraw: r.rows.findIndex(x => x.loan > 0) };
}

export function renderProgressiveReport({ values, link, agent, siteUrl, now = new Date() }) {
  const { r, duty, firstDraw } = progressiveResult(values);
  const dated = now.toISOString().slice(0, 10);
  const subject = `Paying for a home still being built — ${money(values.price)}`;
  const standfirst = 'The nine stages a developer may bill you for, in the order the Housing Developers Rules set them, with your own loan terms applied.';
  const h = head({ kind: 'progressive payments', subject, siteUrl, path: '/progressive', dated, standfirst });

  const upfront = r.cashCpfTotal + duty.total;
  const upfrontNote = `${money(r.cashCpfTotal)} of the price — ${pct((1 - Number(values.ltv)) * 100, 0)}, out of your own cash and CPF, across the first ${firstDraw >= 0 ? firstDraw + 1 : ''} stages, before the bank has disbursed anything — plus ${money(duty.total)} of stamp duty, which is not part of the price and runs on its own clock.`;

  const asked = [
    ['Price', money(values.price)],
    ['Loan-to-value', pct(Number(values.ltv) * 100, 0)],
    ['Booking fee', pct(Number(values.fee) * 100, 0)],
    ['Rate and tenure', `${pct(Number(values.rate), 2)} over ${values.tenure} years`],
    ['Buyer', `${PROFILE_NAMES[values.profile] || values.profile} · ${Number(values.owned) === 1 ? 'only property' : Number(values.owned) === 2 ? 'second property' : 'third or later'}`],
  ];

  const ladder = r.rows.map(row => [
    `${row.pct}% — ${row.on}`,
    /* Math.round, not truthiness: a stage before the bank has drawn anything
       carries a fraction of a dollar, and `row.monthly ?` printed
       "instalment S$0" against it. */
    `${money(row.due)} · ${row.own > 0 ? `${money(row.own)} yours` : 'all loan'}${Math.round(row.monthly) > 0 ? ` · instalment ${money(row.monthly)}` : ''}`,
  ]);

  const totals = [
    ['Cash that cannot be CPF — the booking fee', money(r.bookingFee)],
    ['Your own money across the ladder', money(r.cashCpfTotal)],
    ['Buyer’s Stamp Duty', money(duty.bsd)],
    ...(duty.absd > 0 ? [[`Additional Buyer’s Stamp Duty, ${pct(duty.absdRate * 100, 0)}`, money(duty.absd)]] : []),
    ['Loan drawn in total', money(r.loanTotal)],
    ['Instalment at TOP', money(r.monthlyAtTop)],
    ['Instalment once fully drawn', money(r.monthlyFinal)],
  ];

  const notes = [
    'The booking fee buys the Option, which exists before the Sale and Purchase Agreement — and CPF cannot be used until that agreement does. That is why it is the one payment that must be cash.',
    'The Rules do not fix the booking fee: it is “such amount as set out in item 2 of the Fourth Schedule” of the agreement you are actually signing. 5% is the usual figure at a launch.',
    `Each stage is billed on the developer's notice, and payment is due within ${NOTICE_DAYS} days of it. The dates are the builder's progress, not a schedule anyone can publish in advance.`,
    'Interest is charged only on what has been drawn, so the instalments before TOP are genuinely smaller — which is the figure most people are surprised by, in both directions.',
    `Stamp duty is due within ${STAMPING.withinDaysInSingapore} days of ${STAMPING.clockStarts}, `
    + `under ${STAMPING.source}. It is not part of the price and no part of the ladder pays it.`,
  ];

  /* Rule 6 again: the ladder's percentages are the law's, and the law is named
     with the version this repo checked it against. */
  const f = footer({ link, sources: [SOURCES.bsd, SOURCES.absd], agent,
    extraNote: `Stage percentages: ${BUC_SOURCE.name} (as at ${BUC_SOURCE.versionAsAt})` });

  const text = [
    h.text,
    `BEFORE THE BANK PAYS ANYTHING: ${money(upfront)}`,
    upfrontNote,
    '',
    'WHAT YOU ENTERED',
    ...asked.map(([k, v2]) => `  ${k}: ${v2}`),
    '',
    'THE LADDER',
    ...ladder.map(([k, v2]) => `  ${k}\n      ${v2}`),
    '',
    'WHAT IT ADDS UP TO',
    ...totals.map(([k, v2]) => `  ${k}  ${v2}`),
    '',
    'WORTH KNOWING',
    ...notes.map(n => `  · ${n}`),
    '',
    f.text,
  ].join('\n');

  const html = `<div style="${S.wrap}">
${h.html}
${figure('Before the bank pays anything', money(upfront), upfrontNote)}
${figure('Cash that cannot be CPF', money(r.bookingFee), 'The booking fee buys the Option, which exists before the Sale and Purchase Agreement — and CPF cannot be used until that agreement does.', '#58BCC3')}
<hr style="${S.rule}">
<p style="${S.lab};margin:0">What you entered</p>
${table(asked)}
<hr style="${S.rule}">
<p style="${S.lab};margin:0">The ladder — ${esc(String(r.rows.length))} stages</p>
${table(ladder)}
<hr style="${S.rule}">
<p style="${S.lab};margin:0">What it adds up to</p>
${table(totals)}
<hr style="${S.rule}">
<p style="${S.lab};margin:0 0 8px">Worth knowing</p>
${bullets(notes)}
${f.html}
</div>`;

  return { subject, text, html };
}
