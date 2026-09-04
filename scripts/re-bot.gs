/**
 * Shervin's bot — two jobs, and nothing else.
 *
 * Replaces the v4 WhatsApp script (1,223 lines, ~30 commands). What was cut
 * and why is at the bottom of this file, because the deletions are the design.
 *
 *   1. LEADS    — add one, log a contact, be told who is due.
 *   2. ARTICLES — be told what the pipeline filed, publish it or bin it.
 *
 * ── WHY TELEGRAM AND NOT WHATSAPP ──────────────────────────────────────────
 * WhatsApp's Business Platform only lets a business send a FREE-FORM message
 * within 24 hours of the person's last message to it. Outside that window it
 * accepts nothing but a template Meta has approved in advance. Every message
 * this bot sends on its own — the 8am follow-up list, "2 drafts filed" — is
 * business-initiated by definition, so on any day the 24-hour window has
 * lapsed those sends fail with error 131047.
 *
 * The v4 script would not have shown that: sendWhatsApp() ran with
 * muteHttpExceptions and only wrote the status code to a log nobody reads.
 * Worth checking the old executions before assuming the daily briefing has
 * been arriving. An exit code is a claim, not evidence.
 *
 * Telegram has no window, no templates, no review, and inline buttons — so
 * publishing is a tap on the message itself rather than a command typed under
 * it. Client-facing wa.me links in the CRM are untouched: those are plain
 * links and never needed the API.
 *
 * ── DEPLOYMENT ─────────────────────────────────────────────────────────────
 * 1. Talk to @BotFather on Telegram → /newbot → copy the token.
 * 2. Message your own bot once, then open
 *    https://api.telegram.org/bot<TOKEN>/getUpdates and copy chat.id.
 * 3. Extensions → Apps Script, paste this, set Script Properties:
 *      TG_TOKEN         the BotFather token
 *      TG_CHAT          your chat id, digits only
 *      MAKE_SECRET      long random string, also in the Make.com scenario
 *      STUDIO_PASSWORD  same value as STUDIO_PASSWORD in Vercel
 * 4. Deploy → New deployment → Web app → Execute as ME, access ANYONE.
 * 5. Run setWebhook() once from the editor, then installTriggers().
 *
 * ── THE ONE SECURITY THING ─────────────────────────────────────────────────
 * This web app is deployed ANYONE_ANONYMOUS because a webhook has to be.
 * Two callers post here and each is gated separately:
 *   · Telegram — must carry your own chat id.
 *   · Make.com — never carries a chat id, so it carries a shared secret.
 * Anything else gets 'OK' and nothing happens. Never answer with a reason: a
 * public endpoint that explains why it refused helps you guess.
 */

const SPREADSHEET_ID = '1_skxhuyDE7UimQnkkBFyV9-Diq7DMCf7d7c1EI4mNqo';
const SITE_URL       = 'https://truestorey.vercel.app';

const prop_ = k => PropertiesService.getScriptProperties().getProperty(k);

/* CRM columns, 0-based. Unchanged from v4 — the sheet is the contract. */
const COL = {
  NAME: 0, CLIENT_TYPE: 1, FIRST_CONTACTED: 2, NEXT_FOLLOWUP: 3,
  LAST_CONTACTED: 4, PROPERTY: 5, LEAD_STATUS: 6,
  CONTACT_NUMBER: 7, WA_LINK: 8, MESSAGE: 9,
  TIMELINE: 10, INTENT_SIGNAL: 11, FINANCIAL_READINESS: 12,
  SCORE: 13, REPLY_COUNT: 14
};

/* The Articles tab, created on first use so there is nothing to set up. */
const ART = { FILED: 0, TITLE: 1, SLUG: 2, CATEGORY: 3, SOURCES: 4, ID: 5, STATUS: 6 };

const ss_  = () => SpreadsheetApp.openById(SPREADSHEET_ID);
const crm_ = () => ss_().getSheetByName('CRM');

function articles_() {
  const ss = ss_();
  let sh = ss.getSheetByName('Articles');
  if (!sh) {
    sh = ss.insertSheet('Articles');
    sh.appendRow(['Filed', 'Title', 'Slug', 'Category', 'Sources', 'Article ID', 'Status']);
    sh.setFrozenRows(1);
  }
  return sh;
}

const today_ = () => Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd/MM/yyyy');
const plusDays_ = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, 'Asia/Singapore', 'dd/MM/yyyy');
};

/* ══════════════════════════════════════════════════════════════════════════
   THE FRONT DOOR
   ══════════════════════════════════════════════════════════════════════════ */

function doGet() { return ContentService.createTextOutput('OK'); }

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    /* ── Make.com, telling us what the pipeline filed ── */
    if (body.kind === 'articles') {
      if (!secretOk_(body.secret)) return ok_();
      receiveArticles_(body.items || []);
      return ok_();
    }

    /* ── Telegram, forwarding a tap on a button ── */
    if (body.callback_query) {
      const cq = body.callback_query;
      answerCallback_(cq.id);
      if (String(cq.message.chat.id) !== String(prop_('TG_CHAT'))) return ok_();
      const parts = String(cq.data || '').split(':');
      decide_(parts[1], parts[0] === 'pub' ? 'published' : 'archived');
      return ok_();
    }

    /* ── Telegram, forwarding a typed message ── */
    if (body.message) {
      const chat = String(body.message.chat.id);
      if (chat !== String(prop_('TG_CHAT'))) return ok_();
      const text = String(body.message.text || '').trim();
      if (text) route_(text);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err);
  }
  return ok_();
}

/**
 * Compare the whole string rather than bailing on the first wrong character.
 * Apps Script has no timingSafeEqual, so this is the same shape middleware.js
 * uses on /studio: not a real constant-time primitive, but it does not leak
 * the position of the first mismatch, which is the cheap win.
 */
function secretOk_(given) {
  const expected = prop_('MAKE_SECRET');
  if (!expected || !given) return false;
  const g = String(given);
  if (g.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= g.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function route_(text) {
  const lower = text.toLowerCase();
  const rest  = n => text.substring(n).trim();

  if (lower === '/f' || lower === '/followups') return followUps_();
  if (lower.indexOf('/new ') === 0)             return newLead_(rest(5));
  if (lower.indexOf('/log ') === 0)             return logContact_(rest(5));
  if (lower === '/a' || lower === '/articles')  return listArticles_();

  send_(
    '*Two things I do.*\n\n' +
    '*Leads*\n' +
    '/f — who is due, and who is overdue\n' +
    '/new Name | Number | Type | Property\n' +
    '/log Name notes here\n\n' +
    '*Articles*\n' +
    '/a — what is waiting, with buttons\n\n' +
    'Read before publishing: ' + SITE_URL + '/studio');
}

/* ══════════════════════════════════════════════════════════════════════════
   JOB 1 · LEADS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Typing a name into the CRM fills the rest of the row in.
 * Install as: Triggers → onNewLeadRow → From spreadsheet → On edit.
 */
function onNewLeadRow(e) {
  try {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() !== 'CRM') return;
    const row = e.range.getRow();
    if (row <= 1) return;

    const d = sheet.getRange(row, 1, 1, 15).getValues()[0];
    if (!d[COL.NAME]) return;

    if (!d[COL.FIRST_CONTACTED]) sheet.getRange(row, COL.FIRST_CONTACTED + 1).setValue(today_());
    if (!d[COL.NEXT_FOLLOWUP])   sheet.getRange(row, COL.NEXT_FOLLOWUP + 1).setValue(plusDays_(7));
    if (!d[COL.LEAD_STATUS])     sheet.getRange(row, COL.LEAD_STATUS + 1).setValue('New');
    if (d[COL.CONTACT_NUMBER] && !d[COL.WA_LINK]) {
      sheet.getRange(row, COL.WA_LINK + 1)
        .setFormula('=HYPERLINK("https://wa.me/" & H' + row + ',"Send WhatsApp")');
    }
    if (!d[COL.REPLY_COUNT] && d[COL.REPLY_COUNT] !== 0) {
      sheet.getRange(row, COL.REPLY_COUNT + 1).setValue(0);
    }
  } catch (err) {
    Logger.log('onNewLeadRow error: ' + err);
  }
}

/** /new Wei Ling | 6591234567 | Resale Buyer | Dunearn */
function newLead_(arg) {
  const p = arg.split('|').map(s => s.trim());
  const name = p[0], number = p[1], type = p[2] || '', property = p[3] || '';

  if (!name || !number) {
    return send_('*/new Name | Number | Type | Property*\n\n' +
      'Example:\n/new Wei Ling | 6591234567 | Resale Buyer | Dunearn');
  }

  const sheet = crm_();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL.CONTACT_NUMBER]) === String(number)) {
      return send_('⚠️ ' + number + ' is already in the CRM as *' +
        data[i][COL.NAME] + '*. Nothing added.');
    }
  }

  const next = plusDays_(7);
  sheet.appendRow([name, type, today_(), next, '', property, 'New',
                   number, 'https://wa.me/' + number, '', '', '', '', 0, 0]);

  send_('✅ *' + name + '* added\n' +
    (type ? type + ' · ' : '') + number + (property ? ' · ' + property : '') +
    '\nNext follow-up: ' + next);
}

/**
 * The next follow-up date is set from the lead's STATUS rather than a fixed
 * week, because a hot lead contacted today and a cold one contacted today are
 * not due back on the same date. Changing these numbers changes what /f says
 * every morning, so change them deliberately.
 */
const FOLLOWUP_DAYS = { hot: 2, warm: 7, cold: 14, 'new': 7, dormant: 30, converted: 90 };

/** /log Name notes here */
function logContact_(arg) {
  const parts = arg.split(/\s+/);
  const name  = parts[0];
  const notes = parts.slice(1).join(' ');
  if (!name) return send_('*/log Name notes*\nExample: /log John viewed Dunearn, keen');

  const sheet = crm_();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowName = String(data[i][COL.NAME] || '');
    if (!rowName || rowName.toLowerCase().indexOf(name.toLowerCase()) === -1) continue;

    const status = String(data[i][COL.LEAD_STATUS] || 'warm').toLowerCase();
    const days   = FOLLOWUP_DAYS[status] || 7;
    const next   = plusDays_(days);
    const count  = (Number(data[i][COL.REPLY_COUNT]) || 0) + 1;

    sheet.getRange(i + 1, COL.LAST_CONTACTED + 1).setValue(today_());
    sheet.getRange(i + 1, COL.NEXT_FOLLOWUP + 1).setValue(next);
    sheet.getRange(i + 1, COL.REPLY_COUNT + 1).setValue(count);
    if (notes) sheet.getRange(i + 1, COL.MESSAGE + 1).setValue(notes);

    return send_('✅ *' + rowName + '* logged\n' +
      'Next follow-up: ' + next + ' (+' + days + 'd, ' + status + ')\n' +
      'Contacts: ' + count + (notes ? '\nNote: ' + notes : ''));
  }
  send_('No "' + name + '" in the CRM.');
}

/** /f — and the same thing on a timer every morning. */
function followUps_() {
  const data  = crm_().getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = [], due = [], soon = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[COL.NAME] || !r[COL.NEXT_FOLLOWUP]) continue;

    const when = new Date(r[COL.NEXT_FOLLOWUP]);
    if (isNaN(when)) continue;
    when.setHours(0, 0, 0, 0);

    const diff  = Math.round((when - today) / 86400000);
    const label = r[COL.NAME] + (r[COL.CLIENT_TYPE] ? ' (' + r[COL.CLIENT_TYPE] + ')' : '');
    const num   = r[COL.CONTACT_NUMBER] ? ' · wa.me/' + r[COL.CONTACT_NUMBER] : '';

    if (diff < 0)        overdue.push('⚠️ ' + label + ' — ' + Math.abs(diff) + 'd overdue' + num);
    else if (diff === 0) due.push('• ' + label + num);
    else if (diff <= 3)  soon.push('• ' + label + ' — in ' + diff + 'd');
  }

  if (!overdue.length && !due.length && !soon.length) {
    return send_('✅ Nothing due in the next 3 days.');
  }

  let m = '*📋 Follow-ups* · ' +
    Utilities.formatDate(today, 'Asia/Singapore', 'dd MMM yyyy') + '\n\n';
  if (overdue.length) m += '*Overdue*\n' + overdue.join('\n') + '\n\n';
  if (due.length)     m += '*Today*\n' + due.join('\n') + '\n\n';
  if (soon.length)    m += '*Next 3 days*\n' + soon.join('\n') + '\n\n';
  m += '_/log Name notes once you have spoken to them_';
  send_(m);
}

function dailyFollowUps() { followUps_(); }

/* ══════════════════════════════════════════════════════════════════════════
   JOB 2 · ARTICLES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Make.com calls this once per run, after the webhook has filed the drafts.
 *
 * THE SOURCE DOMAINS ARE IN THE MESSAGE ON PURPOSE. Rule 9 says never
 * reproduce news, and the cheapest way to catch a breach of it is to see
 * "straitstimes.com" where "ura.gov.sg" should be — from a phone, without
 * opening anything. A title alone would not show that.
 */
function receiveArticles_(items) {
  const sheet = articles_();
  items.forEach(it => {
    const sources = (it.sources || []);
    sheet.appendRow([today_(), it.title || '', it.slug || '', it.category || 'note',
                     sources.join(' '), it.id || '', 'Pending']);
    send_(
      '*' + (it.title || 'Untitled') + '*\n' +
      (it.category || 'note') + ' · ' +
      (sources.length ? sources.map(hostOf_).join(', ') : '⚠️ NO SOURCES') + '\n\n' +
      (it.excerpt ? '_' + it.excerpt + '_\n\n' : '') +
      SITE_URL + '/studio',
      it.id ? buttons_(it.id) : null);
  });
}

/** /a — re-list what is still waiting, each with its own buttons. */
function listArticles_() {
  const pending = pending_();
  if (!pending.length) return send_('✅ Nothing waiting.');
  send_('*📄 ' + pending.length + ' waiting*');
  pending.forEach(p => {
    const sources = String(p.row[ART.SOURCES] || '').split(/\s+/).filter(String);
    send_(
      '*' + p.row[ART.TITLE] + '*\n' +
      p.row[ART.CATEGORY] + ' · filed ' + p.row[ART.FILED] + '\n' +
      (sources.length ? sources.map(hostOf_).join(', ') : '⚠️ NO SOURCES') + '\n\n' +
      SITE_URL + '/studio',
      buttons_(p.row[ART.ID]));
  });
}

/* The article id travels in the button rather than a position in a list, so a
   tap on yesterday's message still does what it says. Telegram caps
   callback_data at 64 bytes; a UUID plus the prefix is 40. */
function buttons_(id) {
  return { inline_keyboard: [[
    { text: '✅ Publish', callback_data: 'pub:' + id },
    { text: '🗑 Skip',    callback_data: 'skip:' + id }
  ]] };
}

function pending_() {
  const data = articles_().getDataRange().getValues();
  const out  = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ART.STATUS]) === 'Pending') out.push({ line: i + 1, row: data[i] });
  }
  return out;
}

/**
 * The moment the whole pipeline exists to protect.
 *
 * The webhook cannot publish, Make cannot publish, and no model can — a person
 * decides. Tapping Publish without having opened the piece hands that decision
 * back to the machine while keeping the paperwork, which is why the studio link
 * is in every message above the buttons and why this reply names what it just
 * made public.
 */
function decide_(id, status) {
  if (!id) return send_('That message has no article id. Publish from ' + SITE_URL + '/studio.');

  const password = prop_('STUDIO_PASSWORD');
  if (!password) return send_('STUDIO_PASSWORD is not set in Script Properties.');

  const res = UrlFetchApp.fetch(SITE_URL + '/api/studio/publish', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode('studio:' + password) },
    payload: JSON.stringify({ id: id, status: status }),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code !== 200) {
    return send_('❌ The site said ' + code + '.' +
      (code === 401 ? ' STUDIO_PASSWORD here does not match Vercel.' : '') +
      '\n' + res.getContentText().slice(0, 200));
  }

  /* Mark the row by id, not by position — the tap may be on an old message. */
  const sheet = articles_();
  const data  = sheet.getDataRange().getValues();
  let slug = '', title = '';
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ART.ID]) === String(id)) {
      sheet.getRange(i + 1, ART.STATUS + 1)
        .setValue(status === 'published' ? 'Published' : 'Archived');
      slug = data[i][ART.SLUG];
      title = data[i][ART.TITLE];
      break;
    }
  }

  send_(status === 'published'
    ? '✅ Live: ' + SITE_URL + '/insights/' + slug
    : '🗑 Archived: ' + (title || id));
}

/* ══════════════════════════════════════════════════════════════════════════
   PLUMBING
   ══════════════════════════════════════════════════════════════════════════ */

function hostOf_(u) {
  const m = /^https?:\/\/([^\/]+)/i.exec(String(u));
  return m ? m[1].replace(/^www\./, '') : String(u).slice(0, 30);
}

function tg_(method, payload) {
  const token = prop_('TG_TOKEN');
  if (!token) { Logger.log('TG_TOKEN missing'); return null; }
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  /* Telegram answers 200 with {ok:false} on a rejected send, so the status
     code alone is not evidence that anything arrived. Log the body. */
  if (res.getResponseCode() !== 200 || res.getContentText().indexOf('"ok":true') === -1) {
    Logger.log('TG ' + method + ' → ' + res.getResponseCode() + ' ' + res.getContentText());
  }
  return res;
}

function send_(text, replyMarkup) {
  const payload = {
    chat_id: prop_('TG_CHAT'),
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  tg_('sendMessage', payload);
}

/* Telegram spins the button until this is called. Answer first, work after. */
function answerCallback_(id) { tg_('answerCallbackQuery', { callback_query_id: id }); }

function ok_() { return ContentService.createTextOutput('OK'); }

/** Run once from the editor, AFTER deploying, with the /exec URL pasted in. */
function setWebhook() {
  const url = ScriptApp.getService().getUrl();
  const res = tg_('setWebhook', { url: url });
  Logger.log(res ? res.getContentText() : 'no token');
}

/** Run once from the editor. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onNewLeadRow').forSpreadsheet(ss_()).onEdit().create();
  ScriptApp.newTrigger('dailyFollowUps')
    .timeBased().atHour(8).everyDays(1).inTimezone('Asia/Singapore').create();
  Logger.log('Two triggers installed: on-edit, and 8am follow-ups.');
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT WAS REMOVED, AND WHY

   /brief — Claude writing a "SG property market brief" from nothing. This one
     had to go on substance rather than tidiness. A model with no source in
     front of it will produce figures, and a figure published under a CEA
     registration number has to carry its source and period (CEA PG 02-11
     s3.1). The article pipeline replaces it: same daily habit, except
     something URA or HDB actually published is in front of the model first.

   /broadcast — sent WhatsApp to CRM contacts from a template sheet. Consent
     under PDPA is per-channel, an inbound message is not consent, and the DNC
     check on the existing contacts has not been done. Nothing here should
     message a client until it has.

   /content, /objection, /listing, /draft — Claude writing captions, objection
     handling, listing copy and follow-up messages. None of it dangerous, none
     of it these two jobs. /draft is the easiest to add back if it is missed;
     it needs an Anthropic key, which this script no longer holds and is better
     off not holding.

   /score /qualify /q /upgrade /downgrade /cold /warm /hot /dormant /revive,
   the Pipeline tab, monthlyDormantRevival — a lead-scoring apparatus, which is
     a third job. The CRM columns it wrote to are untouched, so it can come
     back later without a migration.

   callClaude() — nothing left needs it, so an API key comes out of a web app
     deployed to ANYONE_ANONYMOUS. One fewer secret in the riskiest place it
     could sit.
   ══════════════════════════════════════════════════════════════════════════ */
