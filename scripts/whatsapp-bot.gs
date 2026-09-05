/**
 * Shervin's WhatsApp bot — two jobs, and deliberately no others.
 *
 *   1. LEADS      /leads  /new  /log
 *   2. ARTICLES   /drafts /pub  /skip
 *
 * ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
 * "RE BOT SCRIPT" v4 was 1,223 lines and about thirty commands: scoring,
 * qualifying, pipeline stages, dormant revival, broadcast, listing copy,
 * objection handling, and a /brief that asked Claude to write a market summary
 * out of nothing. Most of it was never used twice, and two parts were actively
 * wrong to keep:
 *
 *   · /brief had a model produce market commentary with no source behind it.
 *     That is the thing rule 9 and "a model never assigns a number" exist to
 *     prevent, and the Make pipeline now does the same job properly — from a
 *     .gov.sg release, with the link filed beside the article.
 *   · /broadcast sent WhatsApp to CRM contacts. Consent has been email-only
 *     since 24 Aug 2026 and the DNC check on those 219 contacts is still
 *     outstanding. It is not in this file. If it comes back it needs a
 *     per-contact consent column and a real DNC check first, not a rewrite.
 *
 * Everything here messages ONE number — Shervin's own — and doPost drops
 * anything from anyone else. That is what keeps this outside PDPA entirely.
 *
 * ── HOW TO INSTALL ─────────────────────────────────────────────────────────
 * 1. Apps Script → replace Code.gs with this file.
 * 2. Project Settings → Script Properties, add:
 *      CLAUDE_API_KEY     (already there)
 *      WA_TOKEN           (already there)
 *      MAKE_SECRET        any long random string; Make sends it back
 *      STUDIO_PASSWORD    the same value as in .env.local and Vercel
 * 3. Run installTriggers() once.
 * 4. Deploy → Manage deployments → edit → Version: New → Deploy.
 *    The /exec URL does not change. Meta keeps working.
 * 5. Put that /exec URL and MAKE_SECRET into Make module 8.
 */

const WA_TOKEN = PropertiesService.getScriptProperties().getProperty('WA_TOKEN');
const MAKE_SECRET = PropertiesService.getScriptProperties().getProperty('MAKE_SECRET');
const STUDIO_PASSWORD = PropertiesService.getScriptProperties().getProperty('STUDIO_PASSWORD');

const WA_PHONE_NUMBER_ID = '1131232326734664';
const OWNER = '6583335379';
const SPREADSHEET_ID = '1_skxhuyDE7UimQnkkBFyV9-Diq7DMCf7d7c1EI4mNqo';
const SITE = 'https://truestorey.vercel.app';

/** CRM column positions, 0-based. Unchanged from v4 — the sheet is the same. */
const COL = {
  NAME: 0, CLIENT_TYPE: 1, FIRST_CONTACTED: 2, NEXT_FOLLOWUP: 3,
  LAST_CONTACTED: 4, PROPERTY: 5, LEAD_STATUS: 6, CONTACT_NUMBER: 7,
  WA_LINK: 8, MESSAGE: 9, TIMELINE: 10, INTENT_SIGNAL: 11,
  FINANCIAL_READINESS: 12, SCORE: 13, REPLY_COUNT: 14,
};

/** The Articles tab, created on first use. Column order is fixed by ART. */
const ART = { FILED: 0, ID: 1, SLUG: 2, TITLE: 3, CATEGORY: 4, EXCERPT: 5, SOURCES: 6, STATUS: 7 };
const ART_HEADERS = ['Filed', 'Article ID', 'Slug', 'Title', 'Category', 'Excerpt', 'Sources', 'Status'];

const ss = () => SpreadsheetApp.openById(SPREADSHEET_ID);
const crmSheet = () => ss().getSheetByName('CRM');
const today = () => Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd/MM/yyyy');
const plusDays = n => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, 'Asia/Singapore', 'dd/MM/yyyy');
};

function articleSheet() {
  const s = ss();
  let sheet = s.getSheetByName('Articles');
  if (!sheet) {
    sheet = s.insertSheet('Articles');
    sheet.appendRow(ART_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ══ ENTRY POINTS ═════════════════════════════════════════════════════════ */

/**
 * Two callers arrive here and they are told apart by shape, not by a path.
 *
 *   · Meta's webhook, which carries `entry`. Gated to the owner's number.
 *   · Make, which carries `secret`. The deployment is ANYONE_ANONYMOUS
 *     because Meta requires it, so a Make call never passes the owner gate and
 *     needs its own shared secret. Without one, anybody who learned the /exec
 *     URL could push a message to Shervin's phone.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== undefined) {
      if (!MAKE_SECRET || body.secret !== MAKE_SECRET) return ok('unauthorised');
      return handleMake(body);
    }

    const msg = body.entry && body.entry[0].changes[0].value.messages;
    if (!msg) return ok();
    const from = msg[0].from;
    const text = (msg[0].text && msg[0].text.body || '').trim();
    if (!text || from !== OWNER) return ok();

    route(from, text);
  } catch (err) {
    Logger.log('doPost: ' + err);
  }
  return ok();
}

function doGet(e) {
  const VERIFY_TOKEN = 'shervin_real_estate_bot';
  if (e.parameter['hub.mode'] === 'subscribe' && e.parameter['hub.verify_token'] === VERIFY_TOKEN) {
    return ContentService.createTextOutput(e.parameter['hub.challenge']);
  }
  return ContentService.createTextOutput('OK');
}

/* ══ COMMANDS ═════════════════════════════════════════════════════════════ */

function route(from, text) {
  const lower = text.toLowerCase();
  const rest = s => text.substring(s).trim();

  /* Articles */
  if (lower === '/drafts' || lower === '/d') return listDrafts(from);
  if (lower.indexOf('/pub ') === 0) return publish(from, rest(5), 'published');
  if (lower.indexOf('/skip ') === 0) return publish(from, rest(6), 'archived');

  /* Leads */
  if (lower === '/leads' || lower === '/l') return followUps(from);
  if (lower.indexOf('/new ') === 0) return addLead(from, rest(5));
  if (lower.indexOf('/log ') === 0) return logContact(from, rest(5));

  send(from,
    '*Commands*\n\n' +
    '_Articles_\n' +
    '/drafts — what is waiting\n' +
    '/pub 1 — publish it\n' +
    '/skip 1 — archive it\n\n' +
    '_Leads_\n' +
    '/leads — who is due\n' +
    '/new Name | Number | Type | Property\n' +
    '/log Name notes');
}

/* ── 1 · LEADS ───────────────────────────────────────────────────────────── */

/**
 * Who is overdue, who is due today, who is due in the next three days.
 * Read-only. Sorted by lateness rather than by name, because the order IS the
 * priority and a list you have to re-sort in your head is a list you skim.
 */
function followUps(to) {
  const rows = crmSheet().getDataRange().getValues();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const overdue = [], due = [], soon = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[COL.NAME] || !r[COL.NEXT_FOLLOWUP]) continue;
    const when = new Date(r[COL.NEXT_FOLLOWUP]);
    if (isNaN(when)) continue;
    when.setHours(0, 0, 0, 0);
    const days = Math.round((when - now) / 86400000);
    const line = r[COL.NAME] + ' (' + (r[COL.CLIENT_TYPE] || '—') + ')';
    if (days < 0) overdue.push({ d: days, s: line + ' — ' + Math.abs(days) + 'd late' });
    else if (days === 0) due.push({ d: 0, s: line });
    else if (days <= 3) soon.push({ d: days, s: line + ' — in ' + days + 'd' });
  }
  overdue.sort(function (a, b) { return a.d - b.d; });

  if (!overdue.length && !due.length && !soon.length) {
    return send(to, 'Nothing due, and nothing overdue.');
  }
  let m = '*Follow-ups* · ' + today() + '\n';
  if (overdue.length) m += '\n*Overdue*\n' + overdue.map(x => '· ' + x.s).join('\n') + '\n';
  if (due.length) m += '\n*Today*\n' + due.map(x => '· ' + x.s).join('\n') + '\n';
  if (soon.length) m += '\n*Next 3 days*\n' + soon.map(x => '· ' + x.s).join('\n') + '\n';
  send(to, m + '\n_/log Name notes when you have spoken_');
}

/**
 * Pipe-delimited because names have spaces in them and splitting on space put
 * "Wei Ling" in the CRM as "Wei". Deduplicated on the mobile number, which is
 * the only field on the sheet that is actually unique.
 */
function addLead(to, args) {
  const p = args.split('|').map(function (x) { return x.trim(); });
  const name = p[0], number = p[1], type = p[2] || 'Enquiry', property = p[3] || '';
  if (!name || !number) {
    return send(to, 'Usage: /new Name | Number | Type | Property\n\n' +
      'Example:\n/new Wei Ling | 6591234567 | Resale Buyer | Dunearn');
  }

  const sheet = crmSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.CONTACT_NUMBER]) === String(number)) {
      return send(to, number + ' is already in the CRM as *' + rows[i][COL.NAME] + '*. Nothing added.');
    }
  }

  const next = plusDays(7);
  sheet.appendRow([name, type, today(), next, '', property, 'New', number,
    'https://wa.me/' + number, '', '', '', '', 0, 0]);
  send(to, '*' + name + '* added.\n' +
    'Type: ' + type + '\nProperty: ' + (property || '—') + '\n' +
    'Next follow-up: ' + next);
}

/**
 * The follow-up interval is status-aware because a hot lead you contacted
 * today should not sit for a week. `DNC Checked` is not touched by this and
 * never will be — rule 5, it reflects a real check or nothing.
 */
function logContact(to, args) {
  const parts = args.split(/\s+/);
  const name = parts[0];
  const notes = parts.slice(1).join(' ');
  if (!name) return send(to, 'Usage: /log Name notes\nExample: /log Wei viewed Dunearn, wants a second look');

  const sheet = crmSheet();
  const rows = sheet.getDataRange().getValues();
  const DAYS = { hot: 2, warm: 7, cold: 14, 'new': 7, dormant: 30, converted: 90 };

  for (let i = 1; i < rows.length; i++) {
    const rowName = String(rows[i][COL.NAME] || '');
    if (!rowName || rowName.toLowerCase().indexOf(name.toLowerCase()) === -1) continue;

    const status = String(rows[i][COL.LEAD_STATUS] || 'warm').toLowerCase();
    const ahead = DAYS[status] || 7;
    const next = plusDays(ahead);
    sheet.getRange(i + 1, COL.LAST_CONTACTED + 1).setValue(today());
    sheet.getRange(i + 1, COL.NEXT_FOLLOWUP + 1).setValue(next);
    sheet.getRange(i + 1, COL.REPLY_COUNT + 1).setValue((Number(rows[i][COL.REPLY_COUNT]) || 0) + 1);
    if (notes) sheet.getRange(i + 1, COL.MESSAGE + 1).setValue(notes);

    return send(to, '*' + rowName + '* logged.\n' +
      'Next follow-up: ' + next + ' (+' + ahead + 'd, ' + status + ')\n' +
      (notes ? 'Noted: ' + notes : ''));
  }
  send(to, 'No lead matching "' + name + '".');
}

/* ── 2 · ARTICLES ────────────────────────────────────────────────────────── */

/**
 * Make calls this the moment a draft is filed.
 *
 * The row goes in the sheet first and the message goes second, so a WhatsApp
 * outage loses the notification and never the record.
 */
function handleMake(body) {
  const items = body.items || [];
  if (!items.length) return ok();

  const sheet = articleSheet();
  const stamp = Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd/MM/yyyy HH:mm');
  items.forEach(function (a) {
    sheet.appendRow([stamp, a.id || '', a.slug || '', a.title || '', a.category || '',
      a.excerpt || '', (a.sources || []).join(' '), 'draft']);
  });

  const n = items.length;
  let m = '*' + n + ' draft' + (n === 1 ? '' : 's') + ' filed*\n';
  items.forEach(function (a, i) {
    m += '\n*' + (i + 1) + '.* ' + (a.title || '(untitled)') + '\n';
    if (a.excerpt) m += '_' + a.excerpt + '_\n';
    /* The source domains, not just the count. They are what lets a rule 9
       breach be caught from a phone without opening anything. */
    m += 'Source: ' + (a.sources || []).map(hostOf).join(', ') + '\n';
  });
  m += '\nRead them: ' + SITE + '/studio\n_/pub 1 to publish · /skip 1 to archive_';
  send(OWNER, m);
  return ok();
}

/**
 * What is still waiting. Numbered, and the numbers are positions in THIS list
 * rather than row numbers, because "publish the second one" is how anyone
 * actually thinks about it.
 */
function listDrafts(to) {
  const pending = draftRows();
  if (!pending.length) return send(to, 'No drafts waiting.');
  let m = '*' + pending.length + ' waiting*\n';
  pending.forEach(function (d, i) {
    m += '\n*' + (i + 1) + '.* ' + d.title + '\n' +
      '_' + d.category + ' · filed ' + d.filed + '_\n' +
      'Source: ' + d.sources.split(' ').filter(String).map(hostOf).join(', ') + '\n';
  });
  send(to, m + '\nRead them: ' + SITE + '/studio\n_/pub 1 · /skip 1_');
}

/**
 * Publish or archive by position.
 *
 * ── WHY THIS DOES NOT SEND THE ARTICLE TO WHATSAPP ─────────────────────────
 * app/api/studio/publish/route.js says a person reads the piece and presses
 * the button, and that the draft state exists for exactly that. Pasting 900
 * words into a chat window so they can be approved on a thumb-scroll would
 * hollow that out while appearing to honour it. The message carries the title,
 * the excerpt and the SOURCE DOMAINS — enough to catch the one failure that
 * matters from a phone — and a link to read the rest.
 */
function publish(to, arg, status) {
  const n = parseInt(arg, 10);
  const pending = draftRows();
  if (!n || n < 1 || n > pending.length) {
    return send(to, 'Which one? There ' + (pending.length === 1 ? 'is 1 draft' : 'are ' + pending.length + ' drafts') +
      ' waiting. /drafts to list them.');
  }
  const d = pending[n - 1];
  if (!STUDIO_PASSWORD) return send(to, 'STUDIO_PASSWORD is not set in Script Properties, so nothing can be published from here.');

  const res = UrlFetchApp.fetch(SITE + '/api/studio/publish', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode('bot:' + STUDIO_PASSWORD) },
    payload: JSON.stringify({ id: d.id, status: status }),
    muteHttpExceptions: true,
  });

  /* A 2xx is the only success. Anything else is reported with its body, because
     a bot that says "done" on a 401 is worse than one that says nothing. */
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    return send(to, 'Failed — HTTP ' + code + '\n' + res.getContentText().slice(0, 200));
  }
  articleSheet().getRange(d.row, ART.STATUS + 1).setValue(status);
  send(to, (status === 'published' ? 'Published' : 'Archived') + ': *' + d.title + '*' +
    (status === 'published' ? '\n' + SITE + '/insights/' + d.slug : ''));
}

function draftRows() {
  const rows = articleSheet().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][ART.STATUS]) !== 'draft') continue;
    out.push({
      row: i + 1, filed: rows[i][ART.FILED], id: rows[i][ART.ID], slug: rows[i][ART.SLUG],
      title: rows[i][ART.TITLE], category: rows[i][ART.CATEGORY], sources: String(rows[i][ART.SOURCES] || ''),
    });
  }
  return out;
}

/* ══ HELPERS ══════════════════════════════════════════════════════════════ */

const hostOf = u => String(u).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

function send(to, message) {
  const res = UrlFetchApp.fetch('https://graph.facebook.com/v18.0/' + WA_PHONE_NUMBER_ID + '/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + WA_TOKEN },
    payload: JSON.stringify({ messaging_product: 'whatsapp', to: to, type: 'text', text: { body: message } }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) Logger.log('WA ' + res.getResponseCode() + ': ' + res.getContentText());
}

const ok = note => ContentService.createTextOutput(note || 'OK');

/**
 * One trigger, not three.
 *
 * v4 installed a daily 8am briefing and a monthly dormant-revival sweep. The
 * monthly one messaged clients; it is gone with /broadcast and for the same
 * reason. The daily one stays, because a follow-up list nobody opens is a
 * follow-up list nobody follows.
 */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('morningBriefing')
    .timeBased().atHour(8).everyDays(1).inTimezone('Asia/Singapore').create();
  Logger.log('One trigger installed: morningBriefing, 8am daily.');
}

function morningBriefing() {
  followUps(OWNER);
  const pending = draftRows();
  if (pending.length) listDrafts(OWNER);
}
