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
