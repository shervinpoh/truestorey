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
import { ledger } from '../lib/calc/ledger.js';
import { COST_DEFAULTS, COST_SHARE, encodeShare } from '../lib/share.js';
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
    assert.match(part, /Your address was used once to send it and was not stored/,
      'the email stopped saying the address is not kept — and a line break must not split that sentence');
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
  const src = code('lib', 'report', 'cost.js');
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
  assert.match(form, /is used once, to send that email, and is not stored/);
  assert.match(form, /nothing to unsubscribe from/);
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
  assert.match(src, /unless you ask for\s*\n?\s*the emailed copy/);
});
