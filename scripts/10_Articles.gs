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

    THREE HOOKS ARE NEEDED IN 07_Bot.gs. They are listed at the bottom of this
    file. Nothing works until they are added.
    ============================================================================ */

const ART_TAB = 'Articles';
const ART_HEADERS = ['Filed', 'Article ID', 'Slug', 'Title', 'Category', 'Excerpt', 'Sources', 'Status'];

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

/**
 * The row is written BEFORE the message is sent, so a WhatsApp outage costs a
 * notification and never a record. /drafts will still find it tomorrow.
 */
function artFromMake_(body) {
  const items = (body && body.items) || [];
  if (!items.length) return;

  const sh = artSheet_();
  const stamp = Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd/MM/yyyy HH:mm');
  items.forEach(function (a) {
    sh.appendRow([stamp, str_(a.id), str_(a.slug), str_(a.title), str_(a.category),
                  str_(a.excerpt), (a.sources || []).join(' '), 'draft']);
  });

  const me = myNumber_();
  if (!me) return;

  let m = '*📄 ' + items.length + ' draft' + (items.length === 1 ? '' : 's') + ' filed*\n';
  items.forEach(function (a, i) {
    m += '\n*' + (i + 1) + '.* ' + (str_(a.title) || '(untitled)') + '\n';
    if (str_(a.excerpt)) m += '_' + str_(a.excerpt) + '_\n';
    const hosts = (a.sources || []).map(artHost_).filter(String);
    m += 'Source: ' + (hosts.length ? hosts.join(', ') : '⚠️ none recorded') + '\n';
  });
  m += '\nRead them: ' + artSite_() + '/studio\n_/pub 1 to publish · /skip 1 to archive_';
  send_(me, m);
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

/*  ============================================================================
    THE THREE HOOKS — add these to 07_Bot.gs by hand.
    ----------------------------------------------------------------------------

    1 · In doPost, immediately AFTER the `p.action === 'addContacts'` block and
        BEFORE `const body = JSON.parse(e.postData.contents);` add:

          // Make.com filing a Truestorey draft. Its own secret, because the
          // deployment is open to anyone (Meta requires that) and this call
          // never passes the myNumber_() gate below.
          const artSecret = prop_('MAKE_SECRET', false);
          const artBody = JSON.parse(e.postData.contents);
          if (artBody && artBody.kind === 'articles') {
            if (!artSecret || artBody.secret !== artSecret) return ok_();
            artFromMake_(artBody);
            return ok_();
          }

        Then change the line below it to reuse what was already parsed:
          const body = artBody;

    2 · In handleCommand_, in the "daily" group, add:

          if (lower === '/drafts')                 return botDrafts(from);
          if (lower.indexOf('/pub ') === 0)        return botPublish(from, after(5), 'published');
          if (lower.indexOf('/skip ') === 0)       return botPublish(from, after(6), 'archived');

    3 · In botHelp, under *Daily:*, add:

          '*/drafts* — Truestorey drafts waiting\n' +
          '*/pub 1* · */skip 1*\n' +

    ALSO: if WA_WEBHOOK_KEY is set as a script property, verifyRequest_ will
    reject Make unless its URL carries the same ?k= value. Either append
    &k=<WA_WEBHOOK_KEY> to the URL in Make module 8, or leave WA_WEBHOOK_KEY
    unset. Check Project Settings → Script Properties to see which applies.
    ============================================================================ */
