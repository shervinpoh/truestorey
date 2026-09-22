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

test('WhatsApp acceptance is not mistaken for delivery outside the 24-hour window', () => {
  const bot = read('scripts/07_Bot.gs');
  const art = read('scripts/10_Articles.gs');
  assert.match(bot, /value\.statuses && value\.statuses\.length/,
    'delivery and failure callbacks are ignored again');
  assert.match(bot, /LAST_WA_STATUS/,
    'the latest Meta delivery state is not retained for diagnosis');
  assert.match(bot, /p\.waStatus && appKey/,
    'there is no safe read-only way to verify Meta delivery after a live test');
  assert.match(bot, /messageId: message && message\.id/,
    'Graph acceptance still discards the message id needed to match a later callback');
  assert.match(bot, /LAST_INBOUND_MS[\s\S]*23 \* 60 \* 60 \* 1000/,
    'the bot sends a doomed free-form text without checking the service window');
  assert.match(bot, /queuePendingWhatsApp_\(to, body\)/,
    'the full briefing disappears when a re-entry template is required');
  assert.match(bot, /truestorey_daily_source_check/,
    'the proactive send no longer uses the branded approved template');
  assert.match(bot, /category:\s*'MARKETING'/,
    'the recurring editorial briefing is submitted under the wrong Meta category');
  assert.match(bot, /language:\s*\{ code:\s*'en_US' \}/,
    'template creation and sending can drift onto different locale variants');
  assert.match(bot, /Reply if you want the full details\./,
    'the template ends in a variable and risks Meta rejection');
  assert.match(art, /\? 'accepted:' : 'sent:'\) \+ result\.channel/,
    'the Articles sheet again claims an accepted Graph request was delivered');
  assert.match(art, /trackWaDelivery_\(wa\.messageId, subject, message\)/,
    'an asynchronously rejected WhatsApp notification can silently disappear again');
  assert.match(bot, /MailApp\.sendEmail\(\{[\s\S]*subject: '\[WhatsApp failed\] '/,
    'a Meta delivery failure no longer falls back to email');
  assert.doesNotMatch(bot, /Utilities\.sleep\(1200\)/,
    'the bot again assumes delivering a template opens the window without a reply');
});
