/**
 * The lead form thanked people whose details were thrown away.
 *
 * scripts/crm-webhook.gs deduplicated on Mobile. Mobile stopped being required
 * on 24 Aug 2026 when consent went email-only, so most rows arrive with it
 * blank — and a blank matched the blank already sitting in the sheet. The
 * first lead with no number was saved. Every one after it was discarded as a
 * duplicate of that blank, the script answered ok:true, /api/lead saw a
 * success, and the reader was thanked.
 *
 * A silent success over a write that did not happen is the worst failure this
 * repo has a name for, and this one sat on the only path with revenue behind
 * it.
 *
 * Apps Script cannot be imported, so this reads the source — the same reason
 * test/motion.test.js reads JSX. Comments are stripped first: the note above
 * the fix explains the old behaviour and quotes 'Mobile' while doing it.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.join(process.cwd(), 'scripts', 'crm-webhook.gs'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

test('a blank identifier is never a duplicate of another blank', () => {
  assert.match(code, /if \(!want\) return null/,
    'the guard on an empty value is gone; every lead without one will be dropped as a duplicate');
});

test('the duplicate key is the field that is actually required', () => {
  assert.match(code, /keyOf\('Email'\) \|\| keyOf\('Mobile'\)/,
    'email is no longer checked first, or mobile is the key again — mobile is optional and usually blank');
  assert.doesNotMatch(code, /indexOf\(String\(body\.row\['Mobile'\]\)\)/,
    'back to matching the raw Mobile value, blanks included');
});

test('a duplicate is matched case- and whitespace-insensitively', () => {
  // " Ann@X.com " and "ann@x.com" are one person. Matching them as raw strings
  // writes the same contact twice and splits their history across two rows.
  assert.match(code, /\.trim\(\)\.toLowerCase\(\)/,
    'the comparison is raw again, so the same address in different case writes a second row');
});

/*
 * The probe that would have caught this earlier. It posts a wrong secret,
 * which crm-webhook.gs rejects before touching the sheet, so it proves the
 * deployment answers without appending anything. "Nothing here writes" is the
 * promise at the top of preflight and this is the one probe that could break
 * it.
 */
test('preflight asks the CRM whether it answers, and writes nothing doing it', () => {
  const pf = readFileSync(path.join(process.cwd(), 'scripts', 'preflight.mjs'), 'utf8');
  const body = pf.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.match(body, /async function crm\(\)/, 'the CRM probe is gone');
  assert.match(body, /Promise\.all\(\[supabase\(\), models\(\), crm\(\)\]\)/,
    'the CRM probe is defined but never run');
  assert.doesNotMatch(body, /secret: val\('CRM_WEBHOOK_SECRET'\)/,
    'the probe sends the REAL secret, so it will append a junk row to a live CRM');
  assert.match(body, /secret: 'preflight-probe-not-the-real-secret'/,
    'the probe no longer sends a deliberately wrong secret');
});

/*
 * The secret in the repo is a placeholder for someone to replace in the Apps
 * Script editor. If it were ever a real one, it would be a credential in a
 * public repository.
 */
test('no real secret is committed in the webhook template', () => {
  const declared = /const SECRET = '([^']*)'/.exec(src);
  assert.ok(declared, 'the SECRET line moved — check this test still describes it');
  assert.match(declared[1], /^CHANGE_ME/,
    'a real-looking secret is committed in scripts/crm-webhook.gs');
});

/*
 * ─── the transport ────────────────────────────────────────────────────────
 */
import { writeContact, consentFields, configured } from '../lib/crm.js';

/**
 * Apps Script answers HTTP 200 with the error in the BODY. An unauthorised
 * secret comes back as 200 carrying {error:'unauthorised'}, and the lead route
 * checked only res.ok — so a wrong secret was recorded as a saved lead, the
 * reader was thanked, and the sheet stayed empty.
 *
 * Second silent success on this path, found while extracting it. The first was
 * the blank-mobile duplicate above.
 */
test('a 200 carrying an error in the body is a failure, not a save', async () => {
  process.env.CRM_WEBHOOK_URL = 'https://example.invalid/exec';
  process.env.CRM_WEBHOOK_SECRET = 'test';
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ error: 'unauthorised' }),
    text: async () => '{"error":"unauthorised"}',
  });
  try {
    const out = await writeContact({ Email: 'a@b.com' });
    assert.ok(out.error, 'an unauthorised write was reported as a success');
    assert.strictEqual(out.status, 502);
  } finally { globalThis.fetch = real; }
});

test('a matched duplicate is reported rather than passed off as a write', async () => {
  process.env.CRM_WEBHOOK_URL = 'https://example.invalid/exec';
  process.env.CRM_WEBHOOK_SECRET = 'test';
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, duplicate: true, on: 'Email' }),
    text: async () => '',
  });
  try {
    const out = await writeContact({ Email: 'a@b.com' });
    assert.strictEqual(out.ok, true, 'a duplicate is not an error for the reader');
    assert.strictEqual(out.duplicate, true,
      'the caller cannot tell a duplicate from a write, which is how a silent drop hides');
  } finally { globalThis.fetch = real; }
});

test('an unconfigured CRM refuses rather than throwing', async () => {
  const url = process.env.CRM_WEBHOOK_URL, sec = process.env.CRM_WEBHOOK_SECRET;
  delete process.env.CRM_WEBHOOK_URL; delete process.env.CRM_WEBHOOK_SECRET;
  try {
    assert.strictEqual(configured(), false);
    const out = await writeContact({ Email: 'a@b.com' });
    assert.strictEqual(out.status, 503, 'an unconfigured CRM no longer answers 503');
  } finally {
    if (url) process.env.CRM_WEBHOOK_URL = url;
    if (sec) process.env.CRM_WEBHOOK_SECRET = sec;
  }
});

/* Rule 5. It reflects a real check or nothing, and a default of "No" would be
   an assumption wearing the clothes of a record. */
test('DNC Checked is never filled in', () => {
  for (const c of [{ email: true }, { phone: true }, {}, { email: true, phone: true }]) {
    const f = consentFields({ ...c, ip: '1.2.3.4' });
    assert.strictEqual(f['DNC Checked'], '', `DNC Checked was written for ${JSON.stringify(c)}`);
    assert.strictEqual(f['DNC Check Date'], '');
  }
});

test('no consent without a tick, and a tick always dates itself', () => {
  const none = consentFields({ ip: '1.2.3.4' });
  assert.strictEqual(none['PDPA Consent'], 'No');
  assert.strictEqual(none['Consent Date'], '', 'a date was recorded for consent nobody gave');
  const yes = consentFields({ email: true, ip: '1.2.3.4' });
  assert.strictEqual(yes['PDPA Consent'], 'Yes');
  assert.ok(yes['Consent Date'], 'consent was recorded with no date against it');
  assert.match(yes['Consent Basis'], /2026-08-v2/, 'the wording version is not travelling with the row');
  assert.match(yes['Consent Basis'], /ip 1\.2\.3\.4/);
});

/*
 * ─── a form that cannot store an address must not ask for one ─────────────
 *
 * Follow.jsx settled this for the whole site and RecordPage.jsx repeats the
 * reasoning ten lines above the form that ignored it. CRM_WEBHOOK_URL and
 * CRM_WEBHOOK_SECRET were never set in production, so every reader who filled
 * the lead form typed their name and address and got a 503 telling them to
 * WhatsApp instead.
 */
test('every lead form is hidden when there is nowhere to write', () => {
  const strip = f => readFileSync(path.join(process.cwd(), f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  const rp = strip('components/RecordPage.jsx');
  const at = rp.indexOf('{canCapture && (');
  assert.notStrictEqual(at, -1, 'the record-page lead form is ungated again');
  /* Inside the guard, not merely somewhere in the same file — and exactly one
     of them, so a second copy cannot be added outside it and still pass. */
  assert.match(rp.slice(at, at + 220), /<Gate context=\{rec\}/,
    'the canCapture guard no longer wraps the lead form');
  assert.strictEqual((rp.match(/<Gate\b/g) || []).length, 1,
    'more than one Gate in RecordPage — one of them is outside the guard');

  const ins = strip('app/insights/[slug]/page.jsx');
  assert.match(ins, /crmConfigured\(\) && <Gate \/>/, 'the article lead form is ungated again');

  for (const f of ['app/hdb/[town]/[block]/page.jsx', 'app/condo/[slug]/page.jsx',
                   'app/landed/[slug]/page.jsx']) {
    assert.match(strip(f), /canCapture=\{crmConfigured\(\)\}/,
      `${f} renders RecordPage without resolving canCapture, so the form defaults to hidden silently`);
  }
});

/* Two consent-writing paths is how the Consent Basis column ends up recording
   wording nobody was shown. NEXT.md says so; this is the test. */
test('only lib/crm.js builds the consent columns', () => {
  const lead = readFileSync(path.join(process.cwd(), 'app/api/lead/route.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.doesNotMatch(lead, /'PDPA Consent':/,
    'the lead route builds its own consent columns again');
  assert.match(lead, /\.\.\.consentFields\(/, 'the lead route no longer uses the shared builder');
  assert.doesNotMatch(lead, /fetch\(process\.env\.CRM_WEBHOOK_URL/,
    'the lead route has its own copy of the CRM transport again');
});
