/**
 * The /cost ledger as an email a reader keeps.
 *
 * ── THE FIGURES ARE RECOMPUTED HERE, NEVER SENT BY THE BROWSER ─────────────
 * The request carries the same fragment the share link carries, and nothing
 * else. Every number below is derived on the server from lib/calc/ledger.js,
 * for two reasons. A posted figure is a figure anyone can type, and this email
 * goes out from a verified domain over a licensed salesperson's registration
 * number — an endpoint that emails whatever it is handed is a way to send
 * anything to anyone in Shervin's name. And a second copy of the arithmetic is
 * how the page and the email start disagreeing, which is the Proceeds.jsx
 * failure already recorded in CLAUDE.md.
 *
 * `costLedger` is therefore the ONE mapping from what the page holds to what
 * lib/calc/ledger.js takes, and components/Ledger.jsx renders the screen from
 * this same function.
 *
 * ── WHAT IT MAY SAY ────────────────────────────────────────────────────────
 * Arithmetic on figures the reader supplied and rates that are published. No
 * valuation (rule 2) — the two headline figures are what a SALE MUST CLEAR to
 * return their own money, which is a fact about their bank statement. Nothing
 * about whether to sell, none of the seven forbidden words (rule 7), and the
 * CEA particulars on the footer (rule 8). Every rate carries its source and
 * effective date (rule 6), taken from the ledger's own `sources`.
 *
 * ── HTML EMAIL ─────────────────────────────────────────────────────────────
 * Inline styles, no stylesheet, no web font, no image — the discipline
 * lib/digest.js sets out, for the same reason: every client mangles something
 * different and the fallback for all of it is the plain-text part.
 */
import { ledger } from '../calc/ledger.js';
/* The shell is shared with /plan and /progressive: one house style, one set of
   email rules, one closing block with the CEA particulars on it. */
import { S, bullets, esc, figure, footer, head, money, monthName, pct, table } from './shell.js';

const TYPE_NAMES = {
  HDB: 'HDB flat', EC_DEVELOPER: 'EC from the developer', EC_RESALE: 'EC resale', PRIVATE: 'Private',
};
const PROFILE_NAMES = { SC: 'Singapore Citizen', SPR: 'Permanent Resident', FOREIGNER: 'Foreigner' };

/**
 * One mapping from the page's fields to the calculator's arguments.
 * The loan is DERIVED — price less what went down — for the reason the page
 * gives: asking for all three lets a reader enter a set that cannot be true.
 */
export function costLedger(v, { monthlyRent = null } = {}) {
  const price = Number(v.price) || 0;
  const cashDown = Number(v.cashDown) || 0;
  const cpfDown = Number(v.cpfDown) || 0;
  const loan = Math.max(0, price - cashDown - cpfDown);
  const r = ledger({
    price,
    purchaseDate: `${v.bought}-01`,
    propertyType: v.type,
    buyerProfile: v.profile,
    propertyCount: Number(v.owned) || 1,
    loan,
    loanRate: (Number(v.rate) || 0) / 100,
    loanYears: Number(v.tenure) || 25,
    cashDown,
    cpfDown,
    cpfMonthly: Number(v.cpfMonthly) || 0,
    yearsHeld: Number(v.held) || 0,
    agentFeePct: Number(v.agent) || 0,
    monthlyRent,
  });
  return { r, loan, ltv: price > 0 ? loan / price : 0 };
}

/** The reader's own inputs, echoed back so every figure can be checked. */
function assumptions(v, loan, ltv) {
  return [
    ['Price paid', money(v.price)],
    ['Bought', monthName(v.bought)],
    ['Property', TYPE_NAMES[v.type] || v.type],
    ['Buyer', `${PROFILE_NAMES[v.profile] || v.profile} · ${v.owned === 1 ? 'only property' : v.owned === 2 ? 'second property' : 'third or later'}`],
    ['Cash down', money(v.cashDown)],
    ['CPF down', money(v.cpfDown)],
    ['CPF each month', `${money(v.cpfMonthly)} towards the instalment`],
    ['Loan', `${money(loan)} · ${pct(ltv * 100, 0)} of the price`],
    ['Rate and tenure', `${pct(Number(v.rate), 2)} over ${v.tenure} years`],
    ['Held for', `${v.held} year${Number(v.held) === 1 ? '' : 's'}`],
    ['Agent fee assumed', pct(Number(v.agent), 2)],
    /* The home, when one was named — it is what the rent comparison is read
       from, and a reader checking the email should see which one it was. It is
       a label from a link, so it is escaped like everything else. */
    ...(v.home ? [['Home named', v.label || v.home]] : []),
  ];
}

/** The ledger itself, as the page groups it. */
function sections(r, v) {
  const years = `${r.yearsHeld} year${r.yearsHeld === 1 ? '' : 's'}`;
  const ssd = r.exit.ssd.rate
    ? pct(r.exit.ssd.rate * 100, 0)
    : (r.exit.ssd.regime ? 'None — held past the schedule' : 'Not applicable — MOP governs instead');
  return [
    ['Gone for good — no sale returns these', [
      ['Buyer’s Stamp Duty', money(r.entry.bsd)],
      ...(r.entry.absd > 0 ? [[`Additional Buyer’s Stamp Duty, ${pct(r.entry.absdRate * 100, 0)}`, money(r.entry.absd)]] : []),
      ['Legal fees on purchase', money(r.entry.legal)],
      [`Interest paid to the bank over ${years}`, money(r.holding.interestPaid)],
      ['Legal fees on sale', money(r.exit.legal)],
      ['Subtotal, before commission', money(r.friction)],
    ]],
    ['Charged on the sale price, so it depends what you get', [
      [`Agent commission at ${r.exit.agentFeePct}% plus GST`, pct(r.exit.agentRate * 100, 2)],
      ['Seller’s Stamp Duty', ssd],
    ]],
    ['Comes back, but to CPF and not to you', [
      ['CPF principal used', money(r.cpf.principal)],
      [`Accrued interest at ${pct(r.cpf.rate * 100, 1)}`, money(r.cpf.interest)],
      ['Refunded to your Ordinary Account', money(r.cpf.total)],
    ]],
    ['Still owed', [
      [`Outstanding loan after ${years}`, money(r.holding.outstanding)],
      [`Monthly instalment — ${money(r.cash.perMonth)} of it cash`, money(r.holding.instalment)],
    ]],
  ];
}

/**
 * @returns {{subject:string, text:string, html:string}}
 * `link` reopens the result; its figures are in the fragment, so the link is
 * as private as the email that carries it.
 */
export function renderCostReport({ values, market = null, link, agent, siteUrl, now = new Date() }) {
  const { r, loan, ltv } = costLedger(values, { monthlyRent: market?.rent?.median ?? null });
  const clear = r.breakEven.returnOfCash;
  const overPaid = clear && values.price ? (clear / values.price - 1) * 100 : null;
  const subject = `Your ownership ledger — ${money(values.price)}, held ${values.held} year${Number(values.held) === 1 ? '' : 's'}`;
  const dated = now.toISOString().slice(0, 10);
  const standfirst = 'Every figure is arithmetic on what you entered and on published rates — none of it is a valuation of your home.';
  const h = head({ kind: 'cost of ownership', subject, siteUrl, path: '/cost', dated, standfirst });
  const rows = sections(r, values);
  const asked = assumptions(values, loan, ltv);

  const clearNote = `to return every dollar of cash you have put in — after settling the loan${r.cpfReturns ? ', refunding CPF with its interest,' : ''} and paying the commission and legal fees${r.exit.ssd.rate ? ', and Seller’s Stamp Duty' : ''}.`
    + (overPaid !== null ? ` That is ${pct(overPaid)} above what you paid.` : '');
  const cpfNote = r.cpfReturns
    ? `${money(r.cpfReturns.principal)} you took out, plus ${money(r.cpfReturns.interest)} of accrued interest — ${pct(r.cpfReturns.interestShare * 100, 0)} of the refund is money you never had. It returns to your Ordinary Account at completion, so it is not part of what you walk away with.`
    : null;

  const rent = r.renting ? [
    ['Gone for good, owning', money(r.renting.friction)],
    [`Rent over the same ${r.yearsHeld} year${r.yearsHeld === 1 ? '' : 's'} — ${money(r.renting.monthlyRent)} a month, held flat`, money(r.renting.paid)],
    [r.renting.difference > 0 ? 'Owning cost more' : 'Owning cost less', money(Math.abs(r.renting.difference))],
  ] : null;
  const rentSource = market?.rent
    ? `${market.rent.source} · ${market.rent.n} filed contracts, ${market.rent.from} to ${market.rent.to} · median monthly rent, not a projection`
    : null;

  const f = footer({
    link, sources: r.sources, agent,
    extraNote: 'CPF refund rule: cpf.gov.sg — how much must be refunded when a whole property is sold',
  });

  const text = [
    h.text,
    ...(clear == null ? [] : [`A SALE MUST CLEAR: ${money(clear)}`, clearNote, '']),
    ...(cpfNote ? [`GOES BACK TO CPF, NOT TO YOU: ${money(r.cpfReturns.total)}`, cpfNote, ''] : []),
    'WHAT YOU ENTERED',
    ...asked.map(([k, v]) => `  ${k}: ${v}`),
    '',
    ...rows.flatMap(([title, lines]) => [title.toUpperCase(), ...lines.map(([k, v]) => `  ${k}  ${v}`), '']),
    ...(rent ? ['AGAINST RENTING THE SAME THING', ...rent.map(([k, v]) => `  ${k}  ${v}`),
      ...(rentSource ? [`  ${rentSource}`] : []), ''] : []),
    'WHAT IS NOT IN THIS LEDGER',
    ...r.omissions.map(o => `  · ${o}`),
    '',
    'THE RULES BEING APPLIED',
    ...r.caveats.map(c => `  · ${c}`),
    '',
    f.text,
  ].join('\n');

  const html = `<div style="${S.wrap}">
${h.html}
${clear == null ? '' : figure('A sale must clear', money(clear), clearNote)}
${cpfNote ? figure('Goes back to CPF, not to you', money(r.cpfReturns.total), cpfNote, '#58BCC3') : ''}
<hr style="${S.rule}">
<p style="${S.lab};margin:0">What you entered</p>
${table(asked)}
${rows.map(([title, lines]) => `<hr style="${S.rule}">
<p style="${S.lab};margin:0">${esc(title)}</p>
${table(lines)}`).join('')}
${rent ? `<hr style="${S.rule}">
<p style="${S.lab};margin:0">Against renting the same thing</p>
${table(rent)}
${rentSource ? `<p style="${S.lab};margin:10px 0 0">${esc(rentSource)}</p>` : ''}` : ''}
<hr style="${S.rule}">
<p style="${S.lab};margin:0 0 8px">What is not in this ledger</p>
${bullets(r.omissions)}
<p style="${S.lab};margin:20px 0 8px">The rules being applied</p>
${bullets(r.caveats)}
${f.html}
</div>`;

  return { subject, text, html };
}
