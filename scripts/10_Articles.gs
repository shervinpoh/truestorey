/*  ============================================================================
    10_Articles.gs — the Truestorey draft queue, in WhatsApp
    ----------------------------------------------------------------------------
    ADDITIVE. This file defines nothing that already exists in the project: every
    name is prefixed art* or botDrafts/botPublish, and it USES 07_Bot.gs's
    send_, prop_, setting_ and str_ rather than redefining them. Nothing here
    touches Contacts, Deals, Activity or the Dashboard.

    WHAT IT DOES
      Make.com files a draft on truestorey.vercel.app, then POSTs the details
      here. This records them on an Articles tab and messages Shervin. He reads
      the piece at /studio and replies /pub 1 to publish it.

    WHY THE ARTICLE ITSELF IS NOT SENT TO WHATSAPP
      app/api/studio/publish/route.js says a person reads the piece and presses
      the button, and that the draft state exists for exactly that. Pasting 900
      words into a chat window to be approved on a thumb-scroll would hollow
      that out while appearing to honour it. The message carries the title, the
      excerpt and the SOURCE DOMAINS — enough to catch the one failure that
      matters from a phone, which is a piece written off a news site rather than
      an agency release — and a link to read the rest.

    07_Bot.gs owns the authenticated article and article_brief routes. This
    file owns filing, idempotency and delivery evidence.
    ============================================================================ */

const ART_TAB = 'Articles';
const ART_HEADERS = [
  'Filed', 'Article ID', 'Slug', 'Title', 'Category', 'Excerpt', 'Sources', 'Status',
  'Notification Status', 'Notification Detail'
];

function artSite_() {
  return String(setting_('Truestorey Site URL', 'https://truestorey.vercel.app')).replace(/\/$/, '');
}

/** The tab, created on first use so there is nothing to set up by hand. */
function artSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ART_TAB);
  if (!sh) {
    sh = ss.insertSheet(ART_TAB);
    sh.appendRow(ART_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ART_HEADERS.length).setFontWeight('bold');
  } else {
    /* Older copies stopped at Status. Append operational evidence rather than
       shifting any existing column that /drafts and /pub already read. */
    const width = Math.max(sh.getLastColumn(), 1);
    const current = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
    ART_HEADERS.forEach(function (header) {
      if (current.indexOf(header) !== -1) return;
      current.push(header);
      sh.getRange(1, current.length).setValue(header).setFontWeight('bold');
    });
  }
  return sh;
}

function artHost_(u) {
  return String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

/** Every row still waiting, in the order they were filed. */
function artPending_() {
  const sh = artSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, ART_HEADERS.length).getValues();
  const out = [];
  rows.forEach(function (r, i) {
    if (String(r[7]).toLowerCase() !== 'draft') return;
    out.push({
      rowNum: i + 2, filed: r[0], id: String(r[1]), slug: String(r[2]),
      title: String(r[3]), category: String(r[4]), excerpt: String(r[5]),
      sources: String(r[6]).split(/\s+/).filter(String)
    });
  });
  return out;
}

/* ─────────────────────────────────────────────────── called by Make, via doPost */

function artNotify_(subject, message) {
  const me = myNumber_();
  let wa = { ok: false, error: 'My WhatsApp Number is blank on Config' };
  if (me) wa = send_(me, message);
  if (wa.ok) {
    if (wa.messageId) trackWaDelivery_(wa.messageId, subject, message);
    return {
      ok: true,
      accepted: wa.accepted !== false,
      channel: wa.channel || 'whatsapp',
      messageId: wa.messageId || '',
      warning: wa.warning || ''
    };
  }

  /* A daily operation must not disappear because Meta is unavailable or the
     customer-service window changed. Email is the explicit fallback already
     used by the CRM morning briefing. */
  const to = str_(setting_('Digest Email', '')) || Session.getEffectiveUser().getEmail();
  if (!to) return { ok: false, error: wa.error + ' | no Digest Email configured' };
  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: String(message || '').replace(/\*/g, '') +
            '\n\n---\nWhatsApp delivery failed: ' + wa.error
    });
    return { ok: true, channel: 'email', warning: wa.error };
  } catch (err) {
    return { ok: false, error: wa.error + ' | email fallback: ' + err };
  }
}

function artMarkNotification_(sh, rows, result) {
  const status = result.ok
    ? ((result.accepted && !result.delivered) ? 'accepted:' : 'sent:') + result.channel
    : 'failed';
  const detail = result.ok ? (result.warning || '') : result.error;
  rows.forEach(function (rowNum) {
    sh.getRange(rowNum, 9, 1, 2).setValues([[status, truncate_(detail, 450)]]);
  });
}

/**
 * File once, notify until delivery succeeds. Make can safely retry after a
 * network or Meta failure: Article ID, slug and source URL all identify the
 * existing row, so the retry never creates a second queue item.
 */
function artFromMake_(body) {
  const items = (body && body.items) || [];
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, error: 'No article items were supplied' };
  }

  const sh = artSheet_();
  const last = sh.getLastRow();
  const existing = last < 2 ? [] : sh.getRange(2, 1, last - 1, ART_HEADERS.length).getValues();
  const byKey = {};
  existing.forEach(function (r, i) {
    const rowNum = i + 2;
    [r[1], r[2]].concat(String(r[6] || '').split(/\s+/)).forEach(function (v) {
      const key = str_(v);
      if (key) byKey[key] = { rowNum: rowNum, notification: str_(r[8]) };
    });
  });

  const stamp = Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd/MM/yyyy HH:mm');
  const notifyItems = [];
  const notifyRows = [];
  let filed = 0, duplicates = 0;

  items.forEach(function (a) {
    const sources = Array.isArray(a.sources) ? a.sources.map(str_).filter(String) : [];
    const keys = [str_(a.id), str_(a.slug)].concat(sources).filter(String);
    let hit = null;
    keys.some(function (key) { hit = byKey[key] || null; return !!hit; });

    if (hit) {
      duplicates += 1;
      if (hit.notification.indexOf('sent:') !== 0) {
        notifyItems.push(a);
        notifyRows.push(hit.rowNum);
      }
      return;
    }

    sh.appendRow([stamp, str_(a.id), str_(a.slug), str_(a.title), str_(a.category),
                  str_(a.excerpt), sources.join(' '), 'draft', 'pending', '']);
    const rowNum = sh.getLastRow();
    filed += 1;
    notifyItems.push(a);
    notifyRows.push(rowNum);
    keys.forEach(function (key) { byKey[key] = { rowNum: rowNum, notification: 'pending' }; });
  });

  if (!notifyItems.length) {
    return { ok: true, filed: filed, duplicates: duplicates, notified: false, reason: 'already_notified' };
  }

  let m = '*📄 ' + notifyItems.length + ' draft' + (notifyItems.length === 1 ? '' : 's') + ' filed*\n';
  notifyItems.forEach(function (a, i) {
    m += '\n*' + (i + 1) + '.* ' + (str_(a.title) || '(untitled)') + '\n';
    if (str_(a.excerpt)) m += '_' + str_(a.excerpt) + '_\n';
    const hosts = (Array.isArray(a.sources) ? a.sources : []).map(artHost_).filter(String);
    m += 'Source: ' + (hosts.length ? hosts.join(', ') : '⚠️ none recorded') + '\n';
  });
  m += '\nRead them: ' + artSite_() + '/studio\n_/pub 1 to publish · /skip 1 to archive_';

  const delivered = artNotify_('Truestorey draft waiting', m);
  artMarkNotification_(sh, notifyRows, delivered);
  return {
    ok: delivered.ok,
    filed: filed,
    duplicates: duplicates,
    notified: delivered.ok,
    channel: delivered.channel || '',
    error: delivered.error || '',
    warning: delivered.warning || ''
  };
}

/** A daily source check is useful even when the correct result is NONE. */
function artBriefFromMake_(body) {
  const raw = truncate_(str_(body && body.brief), 12000);
  if (!raw) return { ok: false, error: 'Daily source brief was empty' };

  const date = Utilities.formatDate(new Date(), 'Asia/Singapore', 'yyyy-MM-dd');
  const digest = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, date + '|' + raw)
  );
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_ARTICLE_BRIEF_DIGEST') === digest) {
    return { ok: true, duplicate: true, notified: false };
  }

  let m = '*🗞 Truestorey source check*\n_' + date + '_\n\n';
  if (raw.trim().toUpperCase() === 'NONE') {
    m += 'No material Singapore government property release was found in the last 24 hours.\n\n_No draft was created. This is a valid quiet day, not a failed run._';
  } else {
    const items = raw.split(/\s+;;\s+/).slice(0, 6);
    m += items.length + ' item' + (items.length === 1 ? '' : 's') + ' worth reviewing:\n';
    items.forEach(function (item, i) {
      const p = item.split(/\s+~\s+/);
      m += '\n*' + (i + 1) + ' · ' + (p[0] || 'Agency') + '* — ' + (p[1] || 'Untitled release') + '\n';
      if (p[4]) m += p[4] + '\n';
      if (p[2]) m += p[2] + '\n';
    });
    m += '\n_The article pipeline separately decides what is strong enough to draft._';
  }

  const delivered = artNotify_('Truestorey daily source check', truncate_(m, 4000));
  if (delivered.ok) props.setProperty('LAST_ARTICLE_BRIEF_DIGEST', digest);
  return {
    ok: delivered.ok,
    duplicate: false,
    notified: delivered.ok,
    channel: delivered.channel || '',
    error: delivered.error || '',
    warning: delivered.warning || ''
  };
}

/* ─────────────────────────────────────────────────────────────────── commands */

/** /drafts — what is waiting, numbered by position in this list. */
function botDrafts(to) {
  const pending = artPending_();
  if (!pending.length) {
    return send_(to, '📄 No drafts waiting.\n\n_Make files them each morning. Most days there is nothing worth writing, which is the design._');
  }
  let m = '*📄 ' + pending.length + ' waiting*\n';
  pending.forEach(function (d, i) {
    m += '\n*' + (i + 1) + '.* ' + d.title + '\n' +
         '_' + (d.category || 'note') + ' · filed ' + d.filed + '_\n' +
         'Source: ' + (d.sources.length ? d.sources.map(artHost_).join(', ') : '⚠️ none recorded') + '\n';
  });
  send_(to, m + '\nRead them: ' + artSite_() + '/studio\n_/pub 1 · /skip 1_');
}

/**
 * /pub N and /skip N. status is 'published' or 'archived'.
 *
 * A non-2xx is reported with its body rather than swallowed. A bot that says
 * "done" on a 401 is worse than one that says nothing — the same failure that
 * let Make report a rejected article as a green tick for a whole evening.
 */
function botPublish(to, arg, status) {
  const pending = artPending_();
  const n = parseInt(String(arg).trim(), 10);
  if (!pending.length) return send_(to, '📄 Nothing waiting.');
  if (!n || n < 1 || n > pending.length) {
    return send_(to, '❌ Which one? ' + pending.length + ' waiting — /drafts to list them.');
  }

  const pw = prop_('STUDIO_PASSWORD', false);
  if (!pw) return send_(to, '❌ STUDIO_PASSWORD is not set in Script Properties, so nothing can be published from here.');

  const d = pending[n - 1];
  let res;
  try {
    res = UrlFetchApp.fetch(artSite_() + '/api/studio/publish', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Basic ' + Utilities.base64Encode('bot:' + pw) },
      payload: JSON.stringify({ id: d.id, status: status }),
      muteHttpExceptions: true
    });
  } catch (err) {
    return send_(to, '❌ Could not reach the site: ' + err);
  }

  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    return send_(to, '❌ HTTP ' + code + '\n' + res.getContentText().substring(0, 300) +
      (code === 401 ? '\n\n_STUDIO_PASSWORD here does not match the one in Vercel._' : ''));
  }

  artSheet_().getRange(d.rowNum, 8).setValue(status);
  send_(to, (status === 'published' ? '✅ Published' : '🗄 Archived') + ': *' + d.title + '*' +
    (status === 'published' ? '\n' + artSite_() + '/insights/' + d.slug : ''));
}

// Hooks are integrated in the live 07_Bot.gs. Keep this file as code, not as a
// second setup guide; docs/PIPELINE.md owns the operational instructions.
