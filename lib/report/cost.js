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

const money = n => 'S$' + Math.round(Number(n) || 0).toLocaleString('en-SG');
const pct = (n, dp = 1) => `${(Number(n) || 0).toFixed(dp)}%`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
/** "2021-06" → "June 2021". A YYYY-MM string is a database value, not prose. */
export function monthName(m) {
  const [y, mm] = String(m || '').split('-');
  return MONTHS[Number(mm) - 1] ? `${MONTHS[Number(mm) - 1]} ${y}` : String(m || '');
}

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
  const rows = sections(r, values);
  const asked = assumptions(values, loan, ltv);

  const headline = clear == null ? null : [
    'A sale must clear',
    money(clear),
    `to return every dollar of cash you have put in — after settling the loan${r.cpfReturns ? ', refunding CPF with its interest,' : ''} and paying the commission and legal fees${r.exit.ssd.rate ? ', and Seller’s Stamp Duty' : ''}.`
    + (overPaid !== null ? ` That is ${pct(overPaid)} above what you paid.` : ''),
  ];

  const text = [
    subject,
    `Run on truestorey.vercel.app/cost, ${dated}. Every figure below is arithmetic on what you`,
    'entered and on published rates. None of it is a valuation of your home.',
    '',
    ...(headline ? [`${headline[0].toUpperCase()}: ${headline[1]}`, headline[2], ''] : []),
    ...(r.cpfReturns ? [
      `GOES BACK TO CPF, NOT TO YOU: ${money(r.cpfReturns.total)}`,
      `${money(r.cpfReturns.principal)} you took out, plus ${money(r.cpfReturns.interest)} of accrued interest — `
      + `${pct(r.cpfReturns.interestShare * 100, 0)} of the refund is money you never had. It returns to your `
      + 'Ordinary Account at completion, so it is not part of what you walk away with.',
      '',
    ] : []),
    'WHAT YOU ENTERED',
    ...asked.map(([k, val]) => `  ${k}: ${val}`),
    '',
    ...rows.flatMap(([title, lines]) => [title.toUpperCase(), ...lines.map(([k, val]) => `  ${k}  ${val}`), '']),
    ...(r.renting ? [
      'AGAINST RENTING THE SAME THING',
      `  Gone for good, owning  ${money(r.renting.friction)}`,
      `  Rent over the same ${r.yearsHeld} year${r.yearsHeld === 1 ? '' : 's'}  ${money(r.renting.paid)} (${money(r.renting.monthlyRent)} a month, held flat)`,
      `  ${r.renting.difference > 0 ? 'Owning cost more' : 'Owning cost less'}  ${money(Math.abs(r.renting.difference))}`,
      ...(market?.rent ? [`  ${market.rent.source} · ${market.rent.n} filed contracts, ${market.rent.from} to ${market.rent.to}`] : []),
      '',
    ] : []),
    'WHAT IS NOT IN THIS LEDGER',
    ...r.omissions.map(o => `  · ${o}`),
    '',
    'THE RULES BEING APPLIED',
    ...r.caveats.map(c => `  · ${c}`),
    '',
    'THIS IS NOT A VALUATION. Every figure above comes from what you entered and from published',
    'rates. None of it is an opinion about what your home is worth or what it would fetch — that',
    'is a separate question, and the filed transaction ranges on the site are the evidence for it.',
    '',
    `Open this result again: ${link}`,
    '',
    r.sources.map(s => `${s.name} (effective ${s.effective})`).join(' · '),
    '',
    `${agent.name} · CEA Reg. No. ${agent.cea} · ${agent.agency}`,
    'You asked for this copy at truestorey.',
    'Your address was used once to send it and was not stored, and neither were your figures.',
    'There is no list here, and nothing to unsubscribe from.',
  ].join('\n');

  const H = {
    wrap: 'font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111414;max-width:620px',
    lab: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#666E6A',
    fig: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:27px;font-weight:600;letter-spacing:-.01em;color:#164F52',
    hint: 'margin:6px 0 0;font-size:13.5px;color:#48514F',
    mono: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    rule: 'border:0;border-top:1px solid #E2E0D9;margin:26px 0',
  };
  const table = lines => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:8px 0 0">
${lines.map(([k, val], i) => `<tr>
<td style="padding:8px 10px 8px 0;border-top:${i ? '1px solid #EDEBE5' : '0'};color:#48514F;font-size:14px">${esc(k)}</td>
<td style="padding:8px 0;border-top:${i ? '1px solid #EDEBE5' : '0'};text-align:right;white-space:nowrap;${H.mono};font-size:14px;color:#111414">${esc(val)}</td>
</tr>`).join('')}
</table>`;

  const html = `<div style="${H.wrap}">
<p style="${H.lab};margin:0 0 4px">Truestorey · cost of ownership</p>
<h1 style="font-size:21px;line-height:1.25;margin:0 0 6px">${esc(subject)}</h1>
<p style="margin:0 0 20px;font-size:13.5px;color:#48514F">Run on <a href="${esc(siteUrl)}/cost" style="color:#164F52">truestorey/cost</a> on ${esc(dated)}. Every figure is arithmetic on what you entered and on published rates — none of it is a valuation of your home.</p>
${headline ? `<div style="background:#F6F5F2;border-left:3px solid #164F52;padding:16px 18px;margin:0 0 14px">
<p style="${H.lab};margin:0 0 6px">${esc(headline[0])}</p>
<p style="${H.fig};margin:0">${esc(headline[1])}</p>
<p style="${H.hint}">${esc(headline[2])}</p>
</div>` : ''}
${r.cpfReturns ? `<div style="background:#F6F5F2;border-left:3px solid #58BCC3;padding:16px 18px;margin:0 0 14px">
<p style="${H.lab};margin:0 0 6px">Goes back to CPF, not to you</p>
<p style="${H.fig};margin:0">${esc(money(r.cpfReturns.total))}</p>
<p style="${H.hint}">${esc(money(r.cpfReturns.principal))} you took out, plus <strong>${esc(money(r.cpfReturns.interest))}</strong> of accrued interest — ${esc(pct(r.cpfReturns.interestShare * 100, 0))} of the refund is money you never had. It returns to your Ordinary Account at completion, so it is not part of what you walk away with.</p>
</div>` : ''}
<hr style="${H.rule}">
<p style="${H.lab};margin:0">What you entered</p>
${table(asked)}
${rows.map(([title, lines]) => `<hr style="${H.rule}">
<p style="${H.lab};margin:0">${esc(title)}</p>
${table(lines)}`).join('')}
${r.renting ? `<hr style="${H.rule}">
<p style="${H.lab};margin:0">Against renting the same thing</p>
${table([
    ['Gone for good, owning', money(r.renting.friction)],
    [`Rent over the same ${r.yearsHeld} year${r.yearsHeld === 1 ? '' : 's'} — ${money(r.renting.monthlyRent)} a month, held flat`, money(r.renting.paid)],
    [r.renting.difference > 0 ? 'Owning cost more' : 'Owning cost less', money(Math.abs(r.renting.difference))],
  ])}
${market?.rent ? `<p style="${H.lab};margin:10px 0 0">${esc(market.rent.source)} · ${esc(market.rent.n)} filed contracts, ${esc(market.rent.from)} to ${esc(market.rent.to)} · median monthly rent, not a projection</p>` : ''}` : ''}
<hr style="${H.rule}">
<p style="${H.lab};margin:0 0 8px">What is not in this ledger</p>
<ul style="margin:0;padding-left:18px;font-size:13.5px;color:#48514F">${r.omissions.map(o => `<li style="margin:0 0 8px">${esc(o)}</li>`).join('')}</ul>
<p style="${H.lab};margin:20px 0 8px">The rules being applied</p>
<ul style="margin:0;padding-left:18px;font-size:13.5px;color:#48514F">${r.caveats.map(c => `<li style="margin:0 0 8px">${esc(c)}</li>`).join('')}</ul>
<hr style="${H.rule}">
<p style="margin:0 0 16px;font-size:13.5px;color:#48514F"><strong style="color:#111414">This is not a valuation.</strong> Every figure above comes from what you entered and from published rates. None of it is an opinion about what your home is worth or what it would fetch — that is a separate question, and the filed transaction ranges on the site are the evidence for it.</p>
<p style="margin:0 0 18px"><a href="${esc(link)}" style="color:#164F52;font-weight:600">Open this result again, with every figure editable &rarr;</a></p>
<p style="${H.lab};margin:0 0 4px">${r.sources.map(s => `${esc(s.name)} (effective ${esc(s.effective)})`).join(' · ')}</p>
<p style="${H.lab};margin:0 0 18px">CPF refund rule: <a href="https://www.cpf.gov.sg/service/article/how-much-do-i-need-to-refund-to-my-cpf-account-if-i-am-selling-my-whole-property" style="color:#666E6A">CPF Board</a></p>
<p style="margin:0;padding-top:14px;border-top:1px solid #E2E0D9;font-size:12px;color:#666E6A">
${esc(agent.name)} · CEA Reg. No. ${esc(agent.cea)} · ${esc(agent.agency)}<br>
You asked for this copy at truestorey.<br>
Your address was used once to send it and was not stored, and neither were your figures. There is no list here, and nothing to unsubscribe from.
</p>
</div>`;

  return { subject, text, html };
}
