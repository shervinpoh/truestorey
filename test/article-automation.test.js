import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = p => readFileSync(path.join(process.cwd(), p), 'utf8');

test('Make treats every HTTP error as the module that failed', () => {
  const gen = read('scripts/make/gen-blueprint.mjs');
  assert.match(gen, /parameters:\s*\{\s*handleErrors:\s*true/,
    'Make will paint a 4xx or 5xx green and blame a later parser again');
  assert.match(gen, /REPLACE_WITH_WA_WEBHOOK_KEY/,
    'the generated Apps Script URL no longer passes verifyRequest_');
  assert.match(gen, /parseJson\(9, 2400, '\{\{8\.data\}\}'\)/,
    'Apps Script HTML error pages can look like successful HTTP 200 responses again');
});

test('article notifications are idempotent and leave delivery evidence', () => {
  const art = read('scripts/10_Articles.gs');
  assert.match(art, /Notification Status/);
  assert.match(art, /already_notified/);
  assert.match(art, /artBriefFromMake_/,
    'quiet days can no longer produce an explicit daily source check');
  assert.match(art, /sendEmail/,
    'a Meta outage can make the daily operation disappear again');
});

test('the daily source brief reports quiet days without forcing an article', () => {
  const gen = read('scripts/make/gen-daily-source-brief.mjs');
  assert.match(gen, /reply with exactly NONE/i);
  assert.match(gen, /"kind":"article_brief"/);
  assert.match(gen, /mapper:\s*\{\s*json:\s*'\{\{2\.data\}\}'/,
    'the source brief trusts Apps Script HTTP 200 without parsing its acknowledgement');
  assert.match(gen, /false, true\),/,
    'the source brief no longer follows Apps Script ContentService redirects as POST');
  assert.doesNotMatch(gen, /api\/webhook\/article/,
    'the status brief can file content without editorial review');
});
