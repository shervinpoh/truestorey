/**
 * "Email me this report" — the copy of a /cost result, and the things that
 * would make sending it a mistake.
 *
 *  · THE FIGURES ARRIVE FROM THE BROWSER. An endpoint that emails numbers it
 *    was handed will send anything to anyone, from a verified domain, over a
 *    licensed salesperson's registration number. The request carries the share
 *    fragment and an address; every figure is recomputed here.
 *  · THE EMAIL AND THE PAGE DISAGREE. Two copies of the same arithmetic is the
 *    Proceeds.jsx failure in CLAUDE.md. One mapping, used by both.
 *  · IT SAYS SOMETHING IT MAY NOT. Rule 2 (no valuation), rule 7 (four
 *    forbidden words), rule 8 (CEA particulars), rule 6 (source and period on
 *    every rate).
 *  · IT COLLECTS SOMEBODY. The address is used once and stored nowhere, so
 *    there is no consent to take and no list to leave — and the page has to
 *    say that rather than imply a subscription.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderCostReport, costLedger } from '../lib/report/cost.js';
import { renderPlanReport, planResult } from '../lib/report/plan.js';
import { renderProgressiveReport, progressiveResult } from '../lib/report/progressive.js';
import { renderBlindspotReport } from '../lib/report/blindspot.js';
import { analyse } from '../lib/blindspot/analyse.js';
import { ledger } from '../lib/calc/ledger.js';
import { plan, maxPrice } from '../lib/calc/plan.js';
import { progressive } from '../lib/calc/buc.js';
import { COST_DEFAULTS, COST_SHARE, PLAN_DEFAULTS, PROGRESSIVE_DEFAULTS, encodeShare } from '../lib/share.js';
import { EVENTS } from '../lib/analytics.js';

const code = (...p) => readFileSync(path.join(process.cwd(), ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const AGENT = { name: 'Shervin Poh', cea: 'R066925H', agency: 'Huttons Asia Pte Ltd' };
const values = { ...COST_DEFAULTS, price: 1_600_000, held: 9, rate: 2.95, profile: 'SPR' };
const render = (v = values, extra = {}) => renderCostReport({
  values: v, link: 'https://truestorey.vercel.app/cost#v=1&price=1600000', agent: AGENT,
  siteUrl: 'https://truestorey.vercel.app', now: new Date('2026-09-18T00:00:00Z'), ...extra,
});

test('every figure in the email is the one the page computes', () => {
  /* Recomputed straight from lib/calc/ledger.js with the mapping written out
     by hand: if costLedger ever stops deriving the loan, or reads a field by
     another name, the email quietly reports a different purchase. */
  const { r } = costLedger(values);
  const direct = ledger({
    price: 1_600_000, purchaseDate: '2021-06-01', propertyType: 'PRIVATE', buyerProfile: 'SPR',
    propertyCount: 1, loan: 1_600_000 - 200_000 - 200_000, loanRate: 0.0295, loanYears: 30,
    cashDown: 200_000, cpfDown: 200_000, cpfMonthly: 2_500, yearsHeld: 9, agentFeePct: 2,
    monthlyRent: null,
  });
  assert.equal(r.breakEven.returnOfCash, direct.breakEven.returnOfCash);
  assert.equal(r.friction, direct.friction);
  assert.equal(r.cpf.total, direct.cpf.total);

  const money = n => 'S$' + n.toLocaleString('en-SG');
  const { text, html, subject } = render();
  for (const part of [text, html]) {
    assert.ok(part.includes(money(direct.breakEven.returnOfCash)), 'the headline figure is missing');
    assert.ok(part.includes(money(direct.cpf.total)), 'the CPF refund is missing');
    assert.ok(part.includes(money(direct.holding.outstanding)), 'the outstanding loan is missing');
    assert.ok(part.includes(money(direct.entry.bsd)), 'the stamp duty is missing');
  }
  assert.match(subject, /S\$1,600,000, held 9 years/);
});

test('the page renders from the same mapping, not a second copy of it', () => {
  const src = code('components', 'Ledger.jsx');
  assert.match(src, /costLedger\(shareValues/, 'the page computes its own ledger again');
  assert.doesNotMatch(src, /\bledger\(\{/, 'the page calls ledger() directly, so the email can drift from the screen');
});

test('the report says what it is, and never what the home is worth', () => {
  const { text, html } = render();
  for (const part of [text, html]) {
    assert.match(part, /not a valuation/i, 'the report stopped saying it is not a valuation');
    assert.doesNotMatch(part, /under[-\s]?valued|best deal|\bexpert\b|\bspecialist\b/i, 'rule 7');
    /* A denial is not a claim: the report says in as many words that nothing
       in it is an opinion about what the home is worth, and an earlier version
       of this test failed on that sentence. What rule 2 forbids is a FIGURE —
       so the check is a money amount standing next to "worth", plus the
       prompts a licensed salesperson may not put in a reader's inbox. */
    assert.doesNotMatch(part, /worth[\s\S]{0,40}S\$\d/i, 'a figure is being presented as what the home is worth');
    assert.doesNotMatch(part, /should sell|sell now|time to sell|ready to sell|eligible to sell|estimated value|we estimate/i);
    assert.match(part, /None of it is an opinion about what your home is worth or what it would fetch/,
      'the report stopped disclaiming a valuation, in the same words in both parts');
    assert.match(part, /R066925H/, 'rule 8 — the CEA particulars');
    assert.match(part, /IRAS — Buyer’s Stamp Duty \(effective 2023-02-15\)/, 'rule 6 — a rate without its source');
    assert.match(part, /not added to our contact database or mailing list/,
      'the report stopped distinguishing a one-off copy from marketing consent');
    assert.match(part, /email provider received the address and report/,
      'the report hides the delivery provider that necessarily receives the copy');
  }
});

test('the email is legible without HTML, and carries no stylesheet, font or image', () => {
  const { text, html } = render();
  assert.ok(text.length > 800, 'the plain-text part is a stub — it is the part a preview shows');
  assert.match(text, /WHAT YOU ENTERED/);
  assert.match(text, /WHAT IS NOT IN THIS LEDGER/);
  assert.match(text, /Open this result again: https:\/\/truestorey/);
  assert.doesNotMatch(html, /<img|<link|<style|class=|@font-face|<script/i,
    'every client mangles a different one of these; the fallback for all of them is the text part');
  assert.match(html, /style="/, 'the HTML part lost its inline styles');
});

test('a home named in the link is reported and escaped', () => {
  const { html, text } = render({ ...values, home: '/condo/normanton-park', label: 'Normanton "Park" <b>' });
  assert.match(text, /Home named: Normanton "Park" <b>/);
  assert.match(html, /Normanton &quot;Park&quot; &lt;b&gt;/, 'a label from a link reached the HTML unescaped');
  /* Both cells, not only the one that carries reader input today. A row label
     is built from figures and could grow one, and an unescaped cell is not a
     bug anybody notices until it is. */
  const src = code('lib', 'report', 'shell.js');
  assert.match(src, /\$\{esc\(k\)\}/, 'the row label is written into the HTML unescaped');
  assert.match(src, /\$\{esc\(val\)\}/, 'the row value is written into the HTML unescaped');
});

test('the rent comparison appears only when a filed cohort was read', () => {
  const plain = render();
  assert.doesNotMatch(plain.text, /AGAINST RENTING/);
  const withRent = render(values, { market: { rent: { median: 4200, n: 61, from: '2024-01', to: '2026-06', source: 'URA filed tenancy contracts' } } });
  assert.match(withRent.text, /AGAINST RENTING THE SAME THING/);
  assert.match(withRent.text, /61 filed contracts, 2024-01 to 2026-06/, 'rule 6 — the cohort without its period');
  assert.match(withRent.html, /median monthly rent, not a projection/);
});

test('the route recomputes from the fragment and never from posted figures', () => {
  const src = code('app', 'api', 'report', 'route.js');
  assert.match(src, /decodeShare\(tool\.schema, String\(body\.hash \|\| ''\)\)/);
  assert.match(src, /const values = \{ \.\.\.tool\.defaults, \.\.\.got\.values \};/,
    'a field the link leaves out must mean the page’s own starting value');
  for (const field of ['price', 'clear', 'figures', 'total', 'ledger']) {
    assert.ok(!new RegExp(`body\\.${field}`).test(src), `the route reads body.${field} — a posted figure is a figure anyone can type`);
  }
});

test('the route will not send before it checks it can, and guards the rest', () => {
  const src = code('app', 'api', 'report', 'route.js');
  const gate = src.indexOf('mailConfigured()');
  const sendAt = src.indexOf('await send(');
  assert.ok(gate > 0 && gate < sendAt, 'the sender check must come before the send');
  assert.match(src, /if \(isBot\(body\)\) return NextResponse\.json\(\{ ok: true \}\)/, 'no honeypot');
  assert.match(src, /byIp\(ipOf\(req\)\) \|\| byAddress\(email\.toLowerCase\(\)\)/,
    'without a per-address throttle this route posts one inbox as often as it is asked to');
  assert.match(src, /readJson\(req, \{ max: MAX_BODY \}\)/, 'no body cap');
  assert.doesNotMatch(src, /writeContact|consentFields|upsertWatch/,
    'this route stores nobody — a CRM write here needs its own consent wording first');
  /* Accepted is not delivered. The first real send came back 200 with an id and
     arrived in no inbox, and nothing had been written down to look up. */
  assert.match(src, /console\.log\(`report sent · tool=\$\{body\.tool\} · resend=\$\{sent\.id \|\| 'no id'\}`\)/,
    'a send leaves no provider id in the log, so a missing email cannot be traced');
  assert.doesNotMatch(src, /console\.(log|error)\([^)]*\bemail\b/,
    'the recipient address is written to a log — this route promises to store it nowhere');
});

test('the guards are one implementation, shared with the lead form', () => {
  const lead = code('app', 'api', 'lead', 'route.js');
  assert.match(lead, /from '\.\.\/\.\.\/\.\.\/lib\/formguard\.js'/);
  assert.doesNotMatch(lead, /const hits = new Map\(\)/, 'the lead route grew its own throttle back');
});

test('the form is absent unless the server can send, and promises no list', () => {
  const page = code('app', 'cost', 'page.jsx');
  assert.match(page, /canEmail=\{mailConfigured\(\)\}/, 'the page no longer asks whether email works');
  const ledgerSrc = code('components', 'Ledger.jsx');
  assert.match(ledgerSrc, /\{canEmail && <EmailReport tool="cost"/, 'the form renders where nothing can send');
  const form = code('components', 'EmailReport.jsx');
  assert.doesNotMatch(form, /type="checkbox"/, 'a consent tick records a permission, and none is being taken here');
  assert.match(form, /not added to our contact database or/);
  assert.match(form, /Our email provider receives the address and report/);
  assert.match(form, /There is no subscription or follow-up/);
  assert.match(form, /name="website"/, 'no honeypot on the form');
});

test('the report event carries the tool and nothing else', () => {
  assert.equal(EVENTS.REPORT, 'report');
  assert.match(code('lib', 'analytics.js'), /\[EVENTS\.REPORT\]:\s*\['tool'\]/);
  const privacy = readFileSync(path.join(process.cwd(), 'app', 'privacy', 'page.jsx'), 'utf8');
  assert.match(privacy, /REPORT: 'A written copy/, '/privacy lists the event with a blank description');
});

test('the page stops claiming nothing is ever sent anywhere', () => {
  const src = code('components', 'Ledger.jsx');
  assert.doesNotMatch(src, /nothing on this page is saved or sent anywhere\./,
    'the page promises nothing is sent while offering to email the reader a copy');
  assert.match(src, /figures leave the browser only if you ask for\s*\n?\s*the emailed copy/i);
  assert.match(src, /WhatsApp handoff includes no figures/i);
});

/* ── THE OTHER TWO REPORTS ───────────────────────────────────────────────────
   Asserted over all three rather than once per file: every rule below is a
   rule about what may be emailed under a CEA registration number, and a third
   report added next year must satisfy them without anyone remembering to
   write these tests again. */
const REPORTS = [
  ['cost', () => renderCostReport({ values: values, link: 'https://truestorey.vercel.app/cost#v=1', agent: AGENT, siteUrl: 'https://truestorey.vercel.app' })],
  ['plan', () => renderPlanReport({ values: { ...PLAN_DEFAULTS, price: 720_000 }, link: 'https://truestorey.vercel.app/plan#v=1', agent: AGENT, siteUrl: 'https://truestorey.vercel.app' })],
  ['progressive', () => renderProgressiveReport({ values: { ...PROGRESSIVE_DEFAULTS, price: 2_100_000 }, link: 'https://truestorey.vercel.app/progressive#v=1', agent: AGENT, siteUrl: 'https://truestorey.vercel.app' })],
];

test('every report obeys the rules a licensed email has to obey', () => {
  for (const [name, render] of REPORTS) {
    const { subject, text, html } = render();
    assert.ok(subject.length > 10 && subject.length < 120, `${name}: the subject is not a subject`);
    for (const part of [text, html]) {
      assert.match(part, /None of it is an opinion about what your home is worth or what it would fetch/, `${name}: rule 2`);
      /* The heading as well as the sentence: an earlier mutation removed the
         bold "This is not a valuation." and every assertion still passed. */
      assert.match(part, /This is not a valuation\.|THIS IS NOT A VALUATION\./, `${name}: the valuation heading is gone`);
      assert.doesNotMatch(part, /worth[\s\S]{0,40}S\$\d/i, `${name}: a figure is presented as what the home is worth`);
      assert.doesNotMatch(part, /under[-\s]?valued|best deal|\bexpert\b|\bspecialist\b/i, `${name}: rule 7`);
      assert.doesNotMatch(part, /should sell|sell now|time to sell|you should buy|we recommend/i, `${name}: advice`);
      assert.match(part, /R066925H/, `${name}: rule 8 — the CEA particulars`);
      assert.match(part, /effective \d{4}-\d{2}-\d{2}/, `${name}: rule 6 — a rate with no source and date`);
      assert.match(part, /not added to our contact database or mailing list/, `${name}: the privacy line`);
      assert.doesNotMatch(part, /\[object Object\]|undefined|NaN/, `${name}: a value leaked into the prose`);
    }
    assert.ok(text.length > 800, `${name}: the plain-text part is a stub`);
    assert.doesNotMatch(html, /<img|<link|<style|class=|@font-face|<script/i, `${name}: an email client will mangle this`);
    assert.match(text, /Open this result again: https:\/\/truestorey/, `${name}: no way back to the result`);
  }
});

test('/plan and /progressive emails quote the figures their pages compute', () => {
  const pv = { ...PLAN_DEFAULTS, price: 720_000, a1: 6200, cash: 90_000 };
  const { r, cap, input } = planResult(pv);
  const direct = plan({
    applicants: [{ fixedIncome: 6200, age: 34 }, { fixedIncome: 5000, age: 32 }],
    monthlyDebts: 800, propertyType: 'HDB', hdbLoan: true, existingLoans: 0, profile: 'SC',
    propertyCount: 1, cashAvailable: 90_000, cpfAvailable: 120_000, price: 720_000,
  });
  assert.equal(r.cashNeeded, direct.cashNeeded);
  assert.equal(r.loan, direct.loan);
  assert.equal(cap, maxPrice(input));
  const planText = renderPlanReport({ values: pv, link: 'https://x/plan#v=1', agent: AGENT, siteUrl: 'https://x' }).text;
  assert.ok(planText.includes('S$' + direct.cashNeeded.toLocaleString('en-SG')), 'the cash figure is missing');
  assert.ok(planText.includes('S$' + cap.toLocaleString('en-SG')), 'the budget is missing');
  assert.match(planText, /Limited by\s+(TDSR|MSR|LTV|cash|Cash)/i, 'the binding rule is not named');

  const gv = { ...PROGRESSIVE_DEFAULTS, price: 2_100_000, ltv: 0.55, fee: 0.1 };
  const { r: g, duty } = progressiveResult(gv);
  const gDirect = progressive({ price: 2_100_000, ltv: 0.55, bookingFeePct: 0.1, rate: 0.025, tenureYears: 25 });
  assert.equal(g.loanTotal, gDirect.loanTotal);
  assert.equal(g.bookingFee, gDirect.bookingFee);
  const gText = renderProgressiveReport({ values: gv, link: 'https://x/progressive#v=1', agent: AGENT, siteUrl: 'https://x' }).text;
  assert.ok(gText.includes('S$' + Math.round(g.cashCpfTotal + duty.total).toLocaleString('en-SG')), 'the upfront total is missing');
  assert.equal((gText.match(/^  \d+% — /gm) || []).length, gDirect.rows.length, 'the ladder lost stages');
  /* The SOURCE LINE, not the phrase: the standfirst also names the Rules, so a
     dropped source note passed this test until it asked for the citation. */
  assert.match(gText, /Stage percentages: Housing Developers Rules[^\n]*as at \d{4}-\d{2}-\d{2}/,
    'the percentages are quoted without the citation and version they came from');
});

test('a Blindspot email reruns the rubric and preserves every limitation and comparable', () => {
  const input = { home: '/hdb/bishan/242-bishan-st-22', price: 1_200_000, area: 1292, flatType: '5 ROOM' };
  const now = new Date('2026-09-23T00:00:00Z');
  const r = analyse({ href: input.home, askPrice: input.price, areaSqft: input.area, flatType: input.flatType, now });
  const { text, html } = renderBlindspotReport({
    values: input, link: 'https://truestorey.vercel.app/blindspot#v=2',
    agent: AGENT, siteUrl: 'https://truestorey.vercel.app', now,
  });
  assert.match(text, new RegExp(`RISK POINTS: ${r.points} of ${r.max}`), 'the email changed the published score');
  assert.match(text, /could not run; .* did not apply\. A check that could not run scores nothing, not a pass/);
  for (const c of r.checks) {
    assert.ok(text.includes(c.finding), `${c.key} changed between page and email`);
    assert.ok(text.includes(c.source), `${c.key} lost its source`);
  }
  for (const c of r.skipped) assert.ok(text.includes(c.needs), `${c.key} was silently treated as safe`);
  for (const c of r.notApplicable) assert.ok(text.includes(c.reason), `${c.key} became an unmeasured risk`);
  assert.match(text, /FILED COMPARABLES/);
  assert.match(text, /HDB flat type supplied: 5 ROOM/);
  assert.match(text, /matched to the 5 ROOM selected from the listing/);
  assert.ok(text.includes(`${r.detail.price.period.from} to ${r.detail.price.period.to}`),
    'the filed evidence has no source period');
  assert.match(text, /TAKE THESE QUESTIONS INTO THE VIEWING/);
  assert.match(text, /This is not a valuation|THIS IS NOT A VALUATION/);
  assert.match(html, /R066925H/);
  assert.doesNotMatch(html, /<img|<link|<style|class=|@font-face|<script/i);
  assert.doesNotMatch(text + html, /under[-\s]?valued|best deal|\bexpert\b|\bspecialist\b/i);
  assert.ok(text.length > 800, 'plain text is not a real report');
});

test('a private-home copy says MOP does not apply, not that it passed', () => {
  const out = renderBlindspotReport({
    values: { home: '/condo/parc-clematis', price: 2_100_000, area: 950, bedrooms: 3 },
    link: 'https://truestorey.vercel.app/blindspot#v=2',
    agent: AGENT, siteUrl: 'https://truestorey.vercel.app',
    now: new Date('2026-09-23T00:00:00Z'),
  });
  assert.match(out.text, /NOT APPLICABLE/);
  assert.match(out.text, /Bedrooms supplied: 3/);
  assert.match(out.text, /not the bedroom count supplied from the listing/);
  assert.match(out.text, /MOP is the five-year occupation rule for HDB flats, not private condominiums/);
  assert.doesNotMatch(out.text, /MOP.*passed/i);
});

test('the Blindspot email refuses a missing unit detail instead of guessing it', () => {
  const base = { link: 'https://truestorey.vercel.app/blindspot#v=2', agent: AGENT,
    siteUrl: 'https://truestorey.vercel.app' };
  const hdb = renderBlindspotReport({ ...base,
    values: { home: '/hdb/bishan/242-bishan-st-22', price: 1_200_000, area: 1292 } });
  assert.match(hdb.error, /flat type/i);
  const privateHome = renderBlindspotReport({ ...base,
    values: { home: '/condo/parc-clematis', price: 2_100_000, area: 950 } });
  assert.match(privateHome.error, /bedrooms/i);
});

test('the Blindspot email is never sent for a partial shared link', () => {
  const route = code('app', 'api', 'report', 'route.js');
  assert.match(route, /blindspotShareInput\(String\(body\.hash \|\| ''\)\)/);
  assert.match(route, /render: renderBlindspotReport/);
  assert.match(code('app', 'blindspot', 'page.jsx'), /canEmail=\{mailConfigured\(\)\}/);
  assert.match(code('components', 'BlindspotReport.jsx'), /<EmailReport tool="blindspot" hash=\{shareHash\}/);
  const tracing = code('next.config.mjs');
  assert.match(tracing, /'\/api\/report': \[[\s\S]*?'\.\/data\/comps\.json'/);
  assert.match(tracing, /'\/api\/report': \[[\s\S]*?'\.\/data\/planning\.json'/);
});

test('all three pages render from the shared mapping and offer the copy', () => {
  for (const [file, call, tool, title] of [
    ['components/Ledger.jsx', 'costLedger(shareValues', 'cost', 'the ledger'],
    ['components/Planner.jsx', 'planResult(shareValues)', 'plan', 'the assessment'],
    ['components/Progressive.jsx', 'progressiveResult(shareValues)', 'progressive', 'the ladder'],
  ]) {
    const src = code(...file.split('/'));
    assert.ok(src.includes(call), `${file} computes its own figures instead of the shared mapping`);
    assert.match(src, new RegExp(`\\{canEmail && <EmailReport tool="${tool}" hash=\\{shareHash\\} title="${title}" />\\}`),
      `${file} has no emailed copy, or renders it where nothing can send`);
  }
  for (const [page, comp] of [['app/cost/page.jsx', 'Ledger'], ['app/plan/page.jsx', 'Planner'], ['app/progressive/page.jsx', 'Progressive']]) {
    assert.match(code(...page.split('/')), /canEmail=\{mailConfigured\(\)\}/, `${page} does not ask whether email works`);
  }
  const route = code('app', 'api', 'report', 'route.js');
  for (const tool of ['cost', 'plan', 'progressive']) {
    assert.ok(new RegExp(`\\b${tool}: \\{`).test(route), `/api/report cannot render the ${tool} report`);
  }
});

test('no page still promises that nothing is ever sent anywhere', () => {
  for (const f of ['components/Ledger.jsx', 'components/Planner.jsx']) {
    const src = code(...f.split('/'));
    assert.doesNotMatch(src, /Nothing here is sent anywhere|nothing on this page is saved or sent anywhere/,
      `${f} promises nothing is sent while offering to email a copy`);
    assert.match(src, /figures leave the browser only if you ask for\s*\n?\s*the emailed copy/i,
      `${f} stopped naming the one thing that does leave the browser`);
    assert.match(src, /WhatsApp handoff includes no figures/i,
      `${f} does not distinguish a generic handoff from transmitting calculator figures`);
  }
});
