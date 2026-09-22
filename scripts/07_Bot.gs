/*  ============================================================================
    07_Bot.gs — the WhatsApp assistant
    ----------------------------------------------------------------------------
    Same shape as your v4 bot: it answers only to YOU, over WhatsApp Cloud API,
    and never talks to a lead. Every command from v4 still works, plus new ones.

    WHAT CHANGED FROM v4 (all of these were live bugs):
      • Columns resolve by header name, so the sheet can be restructured freely.
      • Dates are real Dates. v4 wrote "14/05/2026" as text then re-read it with
        new Date(), giving Invalid Date and NaN day-counts — which is why
        follow-ups and dormancy quietly stopped firing.
      • Template lookup reads the Message column. v4 read column index 1, which
        is Stage, so /new and /broadcast returned the literal word "Cold".
      • Name matching never silently picks the first substring hit. v4 did, and
        "/log J ..." landed on Juju instead of "J ".
      • Every sheet read is guarded, so one odd cell can't kill a command.
      • The 07:00 briefing can no longer vanish: if WhatsApp's 24-hour window is
        shut, it retries as an approved template, then falls back to email.
      • The webhook checks a shared secret in the URL (see the note on
        signature verification in verifyRequest_).
    ============================================================================ */

const GRAPH_VERSION = 'v21.0';

function waPhoneId_()  { return prop_('WA_PHONE_NUMBER_ID', true); }
function waToken_()    { return prop_('WA_TOKEN', true); }
function claudeKey_()  { return prop_('CLAUDE_API_KEY', false); }
function myNumber_()   { return String(setting_('My WhatsApp Number', '')).replace(/[^\d]/g, ''); }

/* ============================================================ WEBHOOK ENTRY */

/**
 * doGet serves two masters:
 *   • Meta's webhook verification handshake (hub.mode=subscribe)
 *   • the mobile Log Touch web app (everything else)
 */
function doGet(e) {
  const p = (e && e.parameter) || {};

  if (p['hub.mode'] === 'subscribe') {
    const expected = prop_('WA_VERIFY_TOKEN', false) || 'shervin_real_estate_bot';
    if (p['hub.verify_token'] === expected) {
      return ContentService.createTextOutput(p['hub.challenge']);
    }
    return ContentService.createTextOutput('forbidden');
  }

  const appKey = prop_('APP_KEY', false);

  /*  ?stats=<APP_KEY> — row counts and a lead breakdown, without dumping the
      whole sheet. Useful for confirming an import actually landed. */
  if (p.stats && appKey && p.stats === appKey) {
    const c = readAll(TAB.CONTACTS);
    const by = function (header) {
      const t = {};
      c.rows.forEach(function (r) {
        if (!str_(val(r, c.cols, 'Full Name'))) return;
        const k = str_(val(r, c.cols, header)) || '(blank)';
        t[k] = (t[k] || 0) + 1;
      });
      return t;
    };
    return ContentService.createTextOutput(JSON.stringify({
      contacts: c.rows.filter(function (r) { return str_(val(r, c.cols, 'Full Name')); }).length,
      byClientType: by('Client Type'),
      byLeadStatus: by('Lead Status'),
      bySource: by('Source'),
      deals: readAll(TAB.DEALS).rows.filter(function (r) { return str_(r[0]); }).length,
      activity: readAll(TAB.ACTIVITY).rows.filter(function (r) { return str_(r[0]); }).length
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }

  // ?selftest=<APP_KEY> — diagnose the send path. See botSelfTest_.
  if (p.selftest && appKey && p.selftest === appKey) {
    return ContentService
      .createTextOutput(JSON.stringify(botSelfTest_(), null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // A proactive text can be accepted by Graph and fail seconds later when the
  // 24-hour window is closed. Test the approved re-entry template directly.
  if (p.templateTest && appKey && p.templateTest === appKey) {
    return jsonOutput_(botTemplateTest_());
  }
  if (p.templateAudit && appKey && p.templateAudit === appKey) {
    return jsonOutput_(botTemplateAudit_(p.waba));
  }
  if (p.templateCreate && appKey && p.templateCreate === appKey) {
    return jsonOutput_(botTemplateCreate_(p.waba));
  }
  if (p.waStatus && appKey && p.waStatus === appKey) {
    const raw = prop_('LAST_WA_STATUS', false);
    if (!raw) return jsonOutput_({ ok: true, status: null });
    try { return jsonOutput_({ ok: true, status: JSON.parse(raw) }); }
    catch (err) { return jsonOutput_({ ok: false, error: 'Stored WhatsApp status is invalid JSON' }); }
  }

  return serveMobileApp_(p);
}

/**
 * Attempts one WhatsApp send and reports exactly what Meta said.
 *
 * Use this when the bot writes to the sheet but no message arrives — the
 * returned error code tells you which link is broken:
 *   190           token expired or revoked
 *   131030        your number isn't on the test number's allowed-recipient list
 *   131047 / 470  24-hour session window closed
 *   100           bad phone number id
 *
 * Never returns the token itself — only whether it is set and how long it is.
 */
function botSelfTest_() {
  const token = prop_('WA_TOKEN', false);
  const last = prop_('LAST_INBOUND_MS', false);
  return {
    phoneNumberIdSet: !!prop_('WA_PHONE_NUMBER_ID', false),
    phoneNumberId: prop_('WA_PHONE_NUMBER_ID', false),
    tokenSet: !!token,
    tokenLength: token ? token.length : 0,
    myWhatsAppNumber: myNumber_(),
    graphVersion: GRAPH_VERSION,
    serviceUrl: (function () {
      try { return ScriptApp.getService().getUrl(); } catch (err) { return 'ERR ' + err; }
    })(),
    appUrlOverride: prop_('APP_URL', false),
    hoursSinceYourLastInbound: last
      ? Number(((Date.now() - Number(last)) / 3600000).toFixed(2))
      : null,
    sendResult: sendRaw_(myNumber_(), {
      type: 'text',
      text: { body: 'CRM self-test — if you can read this, sending works.' }
    })
  };
}

function botTemplateTest_() {
  const name = str_(setting_('Bot Proactive Template', 'truestorey_daily_source_check'));
  if (!name) return { ok: false, error: 'Bot Proactive Template is blank on Config' };
  const result = sendRaw_(myNumber_(), {
    type: 'template',
    template: {
      name: name,
      language: { code: 'en_US' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd MMM yyyy') },
          { type: 'text', text: 'Template delivery test. No action is needed.' }
        ]
      }]
    }
  });
  return {
    ok: result.ok,
    template: name,
    accepted: result.ok,
    messageId: result.messageId || '',
    error: result.error || ''
  };
}

function botTemplateAudit_(waba) {
  waba = String(waba || '').replace(/[^\d]/g, '');
  if (!waba) return { ok: false, error: 'WhatsApp Business Account ID is required' };
  let token;
  try { token = waToken_(); } catch (err) { return { ok: false, error: String(err) }; }
  try {
    const url = 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + waba +
      '/message_templates?fields=name,status,language,category,components&limit=100';
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code < 200 || code >= 300) return { ok: false, error: 'HTTP ' + code + ' ' + body.substring(0, 400) };
    const parsed = JSON.parse(body);
    return { ok: true, templates: (parsed.data || []).map(function (t) {
      return { name: t.name, status: t.status, language: t.language,
        category: t.category, components: t.components || [] };
    }) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function botTemplateCreate_(waba) {
  waba = String(waba || '').replace(/[^\d]/g, '');
  if (!waba) return { ok: false, error: 'WhatsApp Business Account ID is required' };
  let token;
  try { token = waToken_(); } catch (err) { return { ok: false, error: String(err) }; }
  const payload = {
    name: 'truestorey_daily_source_check',
    language: 'en_US',
    category: 'MARKETING',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'TrueStorey daily source check' },
      {
        type: 'BODY',
        text: 'Your requested TrueStorey source check for {{1}} is ready.\n\n{{2}}\n\nReply if you want the full details.',
        example: { body_text: [[
          '22 Sep 2026',
          'No material Singapore government property release was found in the last 24 hours.'
        ]] }
      },
      { type: 'FOOTER', text: 'Filed sources only · automated owner briefing' }
    ]
  };
  try {
    const res = UrlFetchApp.fetch(
      'https://graph.facebook.com/' + GRAPH_VERSION + '/' + waba + '/message_templates',
      {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify(payload), muteHttpExceptions: true
      }
    );
    const code = res.getResponseCode();
    const body = res.getContentText();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (ignore) {}
    if (code < 200 || code >= 300) return { ok: false, error: 'HTTP ' + code + ' ' + body.substring(0, 500) };
    return { ok: true, name: payload.name, category: payload.category,
      id: parsed && parsed.id || '', status: parsed && parsed.status || 'PENDING' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function doPost(e) {
  /* Make and Meta both call this deployment. A rejected key used to return
     plain OK, which made a missing ?k= parameter indistinguishable from a
     delivered notification. An unhandled error is intentional here: Make's
     HTTP module can only retry or alert when Apps Script returns non-2xx. */
  if (!verifyRequest_(e)) throw new Error('webhook_key_mismatch');
  if (!e || !e.postData) return ok_();

  let parsed;
  try {
    parsed = JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('invalid_webhook_json: ' + err);
  }

  const p = e.parameter || {};
  const appKey = prop_('APP_KEY', false);

  if (p.admin && appKey && p.admin === appKey && p.action === 'repairDncEvidence') {
    return jsonOutput_({ ok: true, dnc: repairDncEvidence_() });
  }
  if (p.admin && appKey && p.admin === appKey && p.action === 'addContacts') {
    const res = addContactsBulk_(parsed);
    return jsonOutput_({
      added: res.added,
      ids: res.ids,
      skipped: res.skipped.length,
      skippedDetail: res.skipped.slice(0, 10)
    });
  }

  if (parsed && (parsed.kind === 'articles' || parsed.kind === 'article_brief')) {
    const artSecret = prop_('MAKE_SECRET', false);
    if (!artSecret || parsed.secret !== artSecret) throw new Error('make_secret_mismatch');
    const result = parsed.kind === 'articles'
      ? artFromMake_(parsed)
      : artBriefFromMake_(parsed);
    if (!result || !result.ok) {
      throw new Error('article_notification_failed: ' + ((result && result.error) || 'unknown error'));
    }
    return jsonOutput_(result);
  }

  try {
    const body = parsed;
    const value = body && body.entry && body.entry[0] &&
                  body.entry[0].changes && body.entry[0].changes[0] &&
                  body.entry[0].changes[0].value;
    if (!value) return ok_();
    if (value.statuses && value.statuses.length) {
      recordWaStatuses_(value.statuses);
      return ok_();
    }
    if (!value.messages || !value.messages.length) return ok_();

    const msg = value.messages[0];
    const from = String(msg.from || '').replace(/[^\d]/g, '');
    const text = str_(msg.text && msg.text.body);

    // Only you. A lead messaging this number is ignored, exactly as before.
    if (from !== myNumber_()) return ok_();
    if (!text) return ok_();

    // Remember that you messaged us — this is what keeps the 24h send window open.
    PropertiesService.getScriptProperties()
      .setProperty('LAST_INBOUND_MS', String(Date.now()));

    // A template sent outside the service window asks for a reply. That reply
    // is the permission boundary that opens the window; deliver the queued
    // briefing before treating it as a new command.
    if (flushPendingWhatsApp_(from)) return ok_();

    if (!/^yes$/i.test(str_(setting_('Bot Enabled', 'YES'))) &&
        str_(setting_('Bot Enabled', 'YES')).toUpperCase() !== 'YES') {
      return ok_();
    }

    handleCommand_(from, text);
  } catch (err) {
    Logger.log('doPost: ' + err + '\n' + (err && err.stack));
  }
  return ok_();
}


/**
 * Apps Script web apps cannot read request headers, so Meta's
 * X-Hub-Signature-256 is not available to us — there is no way to verify it
 * here. Instead the deployment URL carries a secret query parameter that only
 * you and Meta know (SETUP.md step 6 shows where to put it).
 *
 * Set the WA_WEBHOOK_KEY script property and append ?k=<that value> to the
 * callback URL you give Meta. Without it, anyone who discovers the /exec URL
 * can post a payload claiming to be from your number.
 */
function verifyRequest_(e) {
  const expected = prop_('WA_WEBHOOK_KEY', false);
  if (!expected) return true;                       // not configured yet — allow, but see SETUP
  return e && e.parameter && e.parameter.k === expected;
}

function ok_() { return ContentService.createTextOutput('OK'); }

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================ COMMAND ROUTER */

function handleCommand_(from, text) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const after = function (n) { return raw.substring(n).trim(); };
  const words = raw.split(/\s+/);

  /* ---- daily ---- */
  if (lower === '/today' || lower === '/t')            return botToday(from);
  if (lower === '/followups' || lower === '/f')        return botFollowUps(from);
  if (lower === '/summary' || lower === '/s')          return botSummary(from);
  if (lower === '/triggers')                           return botTriggers(from);
  if (lower === '/brief')                              return botMarketBrief(from);
  if (lower === '/drafts')                          return botDrafts(from);
  if (lower.indexOf('/pub ') === 0)                 return botPublish(from, after(5), 'published');
  if (lower.indexOf('/skip ') === 0)                return botPublish(from, after(6), 'archived');
  if (lower === '/app')                                return botAppLink(from);
  if (lower === '/reset' || lower === '/new chat') {
    convoClear_(from);
    return send_(from, '🧹 Conversation cleared. Next message starts fresh.');
  }

  /* ---- funnel ---- */
  if (lower.indexOf('/score ') === 0)                  return botScore(from, after(7));
  if (lower.indexOf('/qualify ') === 0)                return botStartQualify(from, after(9));
  if (lower.indexOf('/q ') === 0)                      return botSaveQualify(from, words[1], words[2], words[3], words[4]);
  if (lower === '/cold' || lower === '/warm' || lower === '/hot')
                                                       return botListStatus(from, lower.substring(1));
  if (lower === '/dormant')                            return botDormant(from);
  if (lower.indexOf('/revive ') === 0)                 return botRevive(from, after(8));
  if (lower.indexOf('/upgrade ') === 0)                return botMove(from, after(9), +1);
  if (lower.indexOf('/downgrade ') === 0)              return botMove(from, after(11), -1);
  if (lower.indexOf('/broadcast ') === 0)              return botBroadcast(from, words[1], words.slice(2).join(' '));

  /* ---- client management ---- */
  if (lower.indexOf('/draft ') === 0)                  return botDraft(from, after(7));
  if (lower.indexOf('/link ') === 0)                   return botLink(from, after(6));
  if (lower.indexOf('/find ') === 0)                   return botFind(from, after(6));
  if (lower.indexOf('/log ') === 0)                    return botLog(from, after(5));
  if (lower.indexOf('/status ') === 0)                 return botStatus(from, words[1], words[2]);
  if (lower.indexOf('/update ') === 0)                 return botPipeline(from, words[1], parseInt(words[2], 10));
  if (lower.indexOf('/absd ') === 0)                   return botAbsd(from, after(6));

  /* ---- adding ---- */
  if (lower.indexOf('/new ') === 0)                    return botNew(from, after(5));
  if (lower.indexOf('/deal ') === 0)                   return botDeal(from, after(6));

  /* ---- AI ---- */
  if (lower.indexOf('/listing ') === 0)                return botListing(from, after(9));
  if (lower.indexOf('/content ') === 0)                return botContent(from, after(9));
  if (lower.indexOf('/objection ') === 0)              return botObjection(from, after(11));

  if (lower.charAt(0) !== '/')                         return botFreeform(from, raw);
  return botHelp(from);
}

/* =============================================================== COMMANDS */

/** /today — the Dashboard, in WhatsApp. */
function botToday(to) {
  const c = readAll(TAB.CONTACTS);
  const today = today_();
  const due = [], triggers = [];

  c.rows.forEach(function (r) {
    const name = str_(val(r, c.cols, 'Full Name'));
    if (!name) return;
    if (/closed/i.test(str_(val(r, c.cols, 'Stage')))) return;

    const nad = toDate_(val(r, c.cols, 'Next Action Date'));
    const over = nad ? daysBetween_(nad, today) : null;
    if (over != null && over >= 0) {
      due.push({ name: name, over: over, score: num_(val(r, c.cols, 'Lead Score')),
                 action: str_(val(r, c.cols, 'Next Action')) });
    }
    const t = str_(val(r, c.cols, 'Trigger Alert'));
    if (t) triggers.push({ name: name, label: t });
  });

  due.sort(function (a, b) { return b.over - a.over || b.score - a.score; });

  let m = '*📋 Today — ' + fmtDate_(today) + '*\n\n';
  if (!due.length && !triggers.length) {
    m += 'Nothing due, no triggers firing.\nGood window for lead gen or content.';
  } else {
    if (due.length) {
      m += '*Due (' + due.length + '):*\n';
      due.slice(0, 12).forEach(function (x) {
        m += '• ' + x.name + (x.over > 0 ? ' — ' + x.over + 'd overdue' : ' — today') +
             (x.action ? ' · ' + x.action : '') + '\n';
      });
      if (due.length > 12) m += '_…' + (due.length - 12) + ' more_\n';
      m += '\n';
    }
    if (triggers.length) {
      m += '*Triggers (' + triggers.length + '):*\n';
      triggers.slice(0, 10).forEach(function (x) { m += '• ' + x.name + ' — ' + x.label + '\n'; });
      m += '\n';
    }
    m += '_/link [name] for a ready-to-send message_';
  }
  send_(to, m);
}

function botFollowUps(to) {
  const c = readAll(TAB.CONTACTS);
  const today = today_();
  const overdue = [], dueToday = [], soon = [];

  c.rows.forEach(function (r) {
    const name = str_(val(r, c.cols, 'Full Name'));
    if (!name) return;
    const nad = toDate_(val(r, c.cols, 'Next Action Date'));
    if (!nad) return;
    const diff = daysBetween_(today, nad);
    if (diff == null) return;
    const type = str_(val(r, c.cols, 'Client Type'));
    const line = name + (type ? ' (' + type + ')' : '');
    if (diff < 0) overdue.push('⚠️ ' + line + ' — ' + Math.abs(diff) + 'd overdue');
    else if (diff === 0) dueToday.push('• ' + line);
    else if (diff <= 3) soon.push('📅 ' + line + ' — in ' + diff + 'd');
  });

  if (!overdue.length && !dueToday.length && !soon.length) {
    return send_(to, '✅ No follow-ups due or coming up in 3 days.\n\nGood time for lead gen or content.');
  }
  let m = '*📋 Follow-ups*\n_' + fmtDate_(today) + '_\n\n';
  if (overdue.length)  m += '*Overdue:*\n' + overdue.join('\n') + '\n\n';
  if (dueToday.length) m += '*Today:*\n' + dueToday.join('\n') + '\n\n';
  if (soon.length)     m += '*Next 3 days:*\n' + soon.join('\n') + '\n\n';
  m += '_/draft [name] · /link [name]_';
  send_(to, m);
}

function botSummary(to) {
  const c = readAll(TAB.CONTACTS);
  const groups = {};
  c.rows.forEach(function (r) {
    const name = str_(val(r, c.cols, 'Full Name'));
    if (!name) return;
    const s = titleCase_(val(r, c.cols, 'Lead Status')) || 'New';
    (groups[s] = groups[s] || []).push(
      '  • ' + name + ' — ' + (str_(val(r, c.cols, 'Current Address / Estate')) || '—') +
      ' · ' + num_(val(r, c.cols, 'Lead Score'))
    );
  });

  const pipe = pipelineSnapshot_();
  let m = '*📊 Pipeline*\n\n';
  ['Hot', 'Warm', 'Cold', 'New', 'Dormant', 'Converted'].forEach(function (s) {
    if (!groups[s]) return;
    const icon = { Hot: '🔥', Warm: '🌤', Cold: '❄️', New: '🆕', Dormant: '🟠', Converted: '✅' }[s];
    m += icon + ' *' + s + ' (' + groups[s].length + '):*\n' + groups[s].slice(0, 10).join('\n') + '\n\n';
  });
  m += '─────────────\n';
  m += 'Open deals: ' + pipe.count + '\n';
  m += 'Est. commission: S$' + Math.round(pipe.value).toLocaleString() + '\n';
  m += 'Weighted: S$' + Math.round(pipe.weighted).toLocaleString();
  send_(to, m);
}

/** /triggers — the SG-specific reason this CRM exists. */
function botTriggers(to) {
  const c = readAll(TAB.CONTACTS);
  const list = [];
  c.rows.forEach(function (r) {
    const label = str_(val(r, c.cols, 'Trigger Alert'));
    const name = str_(val(r, c.cols, 'Full Name'));
    if (label && name) list.push({ name: name, label: label, rank: rankAlert_(label) });
  });
  if (!list.length) return send_(to, '✅ No triggers firing. Nothing inside its alert window.');
  list.sort(function (a, b) { return a.rank - b.rank; });
  let m = '*⚡ Triggers (' + list.length + ')*\n\n';
  list.slice(0, 25).forEach(function (x) { m += '• *' + x.name + '*\n  ' + x.label + '\n'; });
  m += '\n_/link [name] for the matching message_';
  send_(to, m);
}

function botScore(to, name) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  const r = f.hit.row, cm = f.hit.cols;
  const s100 = num_(val(r, cm, 'Lead Score'));
  const s8 = num_(val(r, cm, 'Score (0-8)'));
  const emoji = s8 >= 7 ? '🔥' : s8 >= 4 ? '🌤' : '❄️';

  send_(to,
    '*' + emoji + ' ' + f.hit.name + '*\n\n' +
    'Timeline: ' + (str_(val(r, cm, 'Timeline')) || '—') + '\n' +
    'Intent: ' + (str_(val(r, cm, 'Intent Signal')) || '—') + '\n' +
    'Financial: ' + (str_(val(r, cm, 'Financial Readiness')) || '—') + '\n' +
    '─────────────\n' +
    'Lead score: *' + s100 + '/100*\n' +
    'Qualify score: *' + s8 + '/8* · ' + (str_(val(r, cm, 'Lead Status')) || '—') + '\n\n' +
    '*Driven by:* ' + (str_(val(r, cm, 'Score Factors')) || '—') + '\n' +
    (str_(val(r, cm, 'Trigger Alert')) ? '\n*Trigger:* ' + str_(val(r, cm, 'Trigger Alert')) : '') +
    (str_(val(r, cm, 'ABSD Note')) ? '\n*ABSD:* ' + str_(val(r, cm, 'ABSD Note')) : '')
  );
}

function botStartQualify(to, name) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  send_(to,
    '*📋 Qualifying ' + f.hit.name + '*\n\n' +
    'Reply: */q ' + f.hit.name + ' [timeline] [intent] [financial]*\n\n' +
    '*Timeline:* <3m · 3-6m · >6m\n' +
    '*Intent:* viewing · price · browsing\n' +
    '*Financial:* yes · no · unknown\n\n' +
    '_e.g. /q ' + f.hit.name + ' <3m viewing yes_'
  );
}

function botSaveQualify(to, name, timeline, intent, financial) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);

  const tl = { '<3m': '0–3mo', '3-6m': '3–6mo', '>6m': '6–12mo' }[str_(timeline).toLowerCase()];
  const int = { viewing: 'Viewing Request', view: 'Viewing Request', price: 'Price Check',
                browsing: 'Browsing', browse: 'Browsing' }[str_(intent).toLowerCase()];
  const fin = { yes: 'Yes', no: 'No', unknown: 'Unknown' }[str_(financial).toLowerCase()];

  if (!tl || !int || !fin) {
    return send_(to, '❌ Check the values.\nTimeline: <3m, 3-6m, >6m\nIntent: viewing, price, browsing\nFinancial: yes, no, unknown');
  }

  const sh = f.hit.sheet, rn = f.hit.rowNum, cm = f.hit.cols;
  const set = function (h, v) { const c = cm[key_(h)]; if (c) sh.getRange(rn, c).setValue(v); };
  set('Timeline', tl);
  set('Intent Signal', int);
  set('Financial Readiness', fin);

  const t8 = tl === '0–3mo' ? 3 : tl === '3–6mo' ? 2 : 1;
  const i8 = int === 'Viewing Request' ? 3 : int === 'Price Check' ? 2 : 1;
  const f8 = fin === 'Yes' ? 2 : fin === 'Unknown' ? 1 : 0;
  const s8 = t8 + i8 + f8;
  const status = statusFromScore8_(s8);
  set('Score (0-8)', s8);
  set('Lead Status', status);
  set('Stage', 'Qualified');

  const emoji = s8 >= 7 ? '🔥' : s8 >= 4 ? '🌤' : '❄️';
  let m = '✅ *' + f.hit.name + ' qualified*\n\n' +
          'Timeline: ' + tl + ' · Intent: ' + int + ' · Financial: ' + fin + '\n' +
          '─────────────\n' +
          'Score: *' + s8 + '/8* → ' + emoji + ' *' + status + '*';

  const next = ai_(
    'Singapore realtor Shervin just qualified a lead.\n' +
    'Name: ' + f.hit.name + ', Type: ' + str_(val(f.hit.row, cm, 'Client Type')) +
    ', Property: ' + (str_(val(f.hit.row, cm, 'Current Address / Estate')) || 'not set') + '\n' +
    'Timeline ' + tl + ', Intent ' + int + ', Financial ' + fin + ', Score ' + s8 + '/8, Status ' + status + '.\n' +
    'Give ONE specific next action for the next 48 hours. 1-2 sentences. Singapore context.', 200);
  if (next) m += '\n\n*💡 Next:* ' + next;

  send_(to, m);
}

function botListStatus(to, status) {
  const c = readAll(TAB.CONTACTS);
  const today = today_();
  const out = [];
  c.rows.forEach(function (r) {
    const name = str_(val(r, c.cols, 'Full Name'));
    if (!name) return;
    if (!eq_(val(r, c.cols, 'Lead Status'), status)) return;
    const d = val(r, c.cols, 'Days Since Contact');
    out.push({
      line: '• *' + name + '* (' + (str_(val(r, c.cols, 'Client Type')) || '—') + ') — ' +
            (str_(val(r, c.cols, 'Current Address / Estate')) || '—') +
            ' · ' + (d === '' ? 'never' : d + 'd ago'),
      score: num_(val(r, c.cols, 'Lead Score'))
    });
  });
  const emoji = status === 'hot' ? '🔥' : status === 'warm' ? '🌤' : '❄️';
  if (!out.length) return send_(to, emoji + ' No *' + titleCase_(status) + '* leads.');
  out.sort(function (a, b) { return b.score - a.score; });
  send_(to, emoji + ' *' + titleCase_(status) + ' (' + out.length + ')*\n\n' +
    out.map(function (x) { return x.line; }).join('\n') +
    '\n\n_/score · /link · /upgrade [name]_');
}

function botDormant(to) {
  const c = readAll(TAB.CONTACTS);
  const limit = threshold1_('Dormant after (days)', 90);
  const out = [];
  c.rows.forEach(function (r) {
    const name = str_(val(r, c.cols, 'Full Name'));
    if (!name) return;
    if (/converted|closed/i.test(str_(val(r, c.cols, 'Lead Status')) + str_(val(r, c.cols, 'Stage')))) return;
    const d = val(r, c.cols, 'Days Since Contact');
    if (d === '' || num_(d) < limit) return;
    out.push({ name: name, days: num_(d), type: str_(val(r, c.cols, 'Client Type')) });
  });
  if (!out.length) return send_(to, '🟠 Nobody dormant. Everyone touched within ' + limit + ' days.');
  out.sort(function (a, b) { return b.days - a.days; });
  send_(to, '*🟠 Dormant (' + out.length + ')*\n_No contact ' + limit + '+ days_\n\n' +
    out.slice(0, 30).map(function (x) { return '• *' + x.name + '* (' + (x.type || '—') + ') — ' + x.days + 'd'; }).join('\n') +
    '\n\n_/revive [name]_');
}

function botRevive(to, name) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  const r = f.hit.row, cm = f.hit.cols;

  const draft = ai_(
    'Help Singapore realtor Shervin re-engage a dormant property lead.\n' +
    'Lead: ' + f.hit.name + ', Type: ' + (str_(val(r, cm, 'Client Type')) || 'Unknown') +
    ', Property: ' + (str_(val(r, cm, 'Current Address / Estate')) || 'not specified') + '\n' +
    'Write a WhatsApp message: reference one SG market movement, soft urgency, ' +
    '2-3 sentences, conversational, end with an open question, first person, no sign-off. ' +
    'Return ONLY the message.', 300);

  const text = draft || str_(val(r, cm, 'Suggested Message'));
  const link = consentAllowsChannel_(r, cm, 'whatsapp')
    ? waLink_(val(r, cm, 'Mobile'), text) : '';
  send_(to, '*🟠 Revival — ' + f.hit.name + '*\n\n' + text +
    (link ? '\n\n👉 ' + link : '') +
    '\n\n_Then: /log ' + f.hit.name + ' | revival sent_');
}

/** /upgrade and /downgrade share one path. dir is +1 or -1. */
function botMove(to, name, dir) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  const order = ['Dormant', 'New', 'Cold', 'Warm', 'Hot', 'Converted'];
  const cur = titleCase_(val(f.hit.row, f.hit.cols, 'Lead Status')) || 'New';
  const i = order.indexOf(cur);
  if (i === -1) return send_(to, '⚠️ ' + f.hit.name + ' has an unrecognised status: ' + cur);
  const j = i + dir;
  if (j < 0 || j >= order.length) {
    return send_(to, '⚠️ ' + f.hit.name + ' is already *' + cur + '*.');
  }
  const next = order[j];
  const c = f.hit.cols[key_('Lead Status')];
  if (c) f.hit.sheet.getRange(f.hit.rowNum, c).setValue(next);
  const icon = dir > 0 ? (next === 'Hot' ? '🔥' : '⬆️') : '⬇️';
  send_(to, icon + ' *' + f.hit.name + '*: ' + cur + ' → *' + next + '*');
}

/** /broadcast — preview only, never sends. Skips anyone without PDPA consent. */
function botBroadcast(to, status, clientType) {
  const c = readAll(TAB.CONTACTS);
  const targets = [], blocked = [];

  c.rows.forEach(function (r) {
    const name = str_(val(r, c.cols, 'Full Name'));
    if (!name) return;
    if (status && !eq_(val(r, c.cols, 'Lead Status'), status)) return;
    if (clientType && str_(val(r, c.cols, 'Client Type')).toLowerCase().indexOf(clientType.toLowerCase()) === -1) return;
    if (!consentAllowsChannel_(r, c.cols, 'whatsapp')) { blocked.push(name); return; }
    targets.push({ name: name, msg: str_(val(r, c.cols, 'Suggested Message')),
                   link: waLink_(val(r, c.cols, 'Mobile'), str_(val(r, c.cols, 'Suggested Message'))) });
  });

  if (!targets.length && !blocked.length) {
    return send_(to, '❌ No ' + status + ' leads' + (clientType ? ' matching "' + clientType + '"' : '') + '.');
  }

  let m = '*📡 Broadcast preview*\n' +
          'Status: *' + titleCase_(status) + '*' + (clientType ? ' · Type: *' + clientType + '*' : '') + '\n' +
          'Consented recipients: *' + targets.length + '*\n\n';
  if (targets.length) m += '*Sample message:*\n' + targets[0].msg + '\n\n';
  m += targets.slice(0, 15).map(function (t) { return '• ' + t.name + '\n  ' + t.link; }).join('\n');
  if (targets.length > 15) m += '\n_…' + (targets.length - 15) + ' more_';
  if (blocked.length) m += '\n\n🚫 *Skipped — no PDPA consent (' + blocked.length + '):*\n' + blocked.slice(0, 10).join(', ');
  m += '\n\n⚠️ Preview only. Tap each link and send it yourself.';
  send_(to, m);
}

function botDraft(to, name) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  const r = f.hit.row, cm = f.hit.cols;

  const draft = ai_(
    'Draft a WhatsApp message for Singapore realtor Shervin.\n' +
    'Client: ' + f.hit.name + ', Type: ' + str_(val(r, cm, 'Client Type')) +
    ', Status: ' + str_(val(r, cm, 'Lead Status')) + '\n' +
    'Property: ' + (str_(val(r, cm, 'Current Address / Estate')) || 'not specified') + '\n' +
    'Trigger: ' + (str_(val(r, cm, 'Trigger Alert')) || 'none') + '\n' +
    'Notes: ' + (str_(val(r, cm, 'Owner Notes')) || 'none') + '\n' +
    'Write as Shervin — first person, warm not salesy, SG conversational. ' +
    'Lead with something useful, never with an ask. 2-3 sentences, use their first name, ' +
    'no sign-off. Return ONLY the message.', 300);

  const text = draft || str_(val(r, cm, 'Suggested Message'));
  const link = consentAllowsChannel_(r, cm, 'whatsapp')
    ? waLink_(val(r, cm, 'Mobile'), text) : '';
  send_(to, '*✍️ Draft — ' + f.hit.name + '*\n\n' + text +
    (link ? '\n\n👉 ' + link : '\n\n_No usable mobile on file._') +
    '\n\n_Then: /log ' + f.hit.name + ' | [notes]_');
}

/**
 * /link — the biggest day-to-day upgrade. Returns a wa.me link with the right
 * template already merged and typed, so sending is one tap and no typing.
 */
function botLink(to, name) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  const r = f.hit.row, cm = f.hit.cols;

  if (!consentAllowsChannel_(r, cm, 'whatsapp')) {
    return send_(to, '🚫 *' + f.hit.name + '* has no WhatsApp permission recorded.\n\n' +
      'Record the selected channel in Consent Basis, or use a lawful existing business relationship.');
  }
  const text = str_(val(r, cm, 'Suggested Message'));
  const link = waLink_(val(r, cm, 'Mobile'), text);
  if (!link) return send_(to, '❌ No usable mobile for ' + f.hit.name + '.');

  send_(to, '*💬 ' + f.hit.name + '*\n' +
    (str_(val(r, cm, 'Trigger Alert')) ? '_' + str_(val(r, cm, 'Trigger Alert')) + '_\n' : '') +
    '\n' + text + '\n\n👉 ' + link + '\n\n_Tap, check it reads right, send._');
}

function botFind(to, name) {
  const f = findContact_(name);
  const list = f.ok ? [f.hit] : f.matches;
  if (!list.length) return send_(to, '❌ Nobody matching "' + name + '".');

  let m = '*🔍 "' + name + '"*\n\n';
  list.slice(0, 8).forEach(function (h) {
    const r = h.row, cm = h.cols;
    const s8 = num_(val(r, cm, 'Score (0-8)'));
    const emoji = s8 >= 7 ? '🔥' : s8 >= 4 ? '🌤' : '❄️';
    m += '*' + h.name + '* ' + emoji + ' `' + h.id + '`\n' +
         (str_(val(r, cm, 'Mobile')) || '—') + '\n' +
         'Type: ' + (str_(val(r, cm, 'Client Type')) || '—') + ' · Status: ' + (str_(val(r, cm, 'Lead Status')) || '—') +
         ' · Score: ' + num_(val(r, cm, 'Lead Score')) + '/100\n' +
         'Property: ' + (str_(val(r, cm, 'Current Address / Estate')) || '—') + '\n' +
         'Next: ' + (str_(val(r, cm, 'Next Action')) || '—') + ' on ' + (fmtDate_(val(r, cm, 'Next Action Date')) || '—') + '\n' +
         (str_(val(r, cm, 'Trigger Alert')) ? '⚡ ' + str_(val(r, cm, 'Trigger Alert')) + '\n' : '') +
         (str_(val(r, cm, 'ABSD Note')) ? '🏦 ' + str_(val(r, cm, 'ABSD Note')) + '\n' : '') +
         '\n';
  });
  send_(to, m.trim());
}

/** /log Name | notes   (pipe keeps multi-word names intact) */
function botLog(to, rest) {
  let name = rest, notes = '';
  if (rest.indexOf('|') !== -1) {
    const parts = rest.split('|');
    name = parts[0].trim();
    notes = parts.slice(1).join('|').trim();
  } else {
    const w = rest.split(/\s+/);
    name = w[0];
    notes = w.slice(1).join(' ');
  }

  const res = logTouch({
    contactName: name, channel: 'WhatsApp', direction: 'Outbound',
    summary: notes, via: 'whatsapp'
  });
  if (!res.ok) {
    return send_(to, '❌ ' + res.error +
      (res.matches && res.matches.length ? '\n\nTry: ' + res.matches.map(function (m) { return '/log ' + m.id + ' | ' + notes; }).join('\n') : '') +
      '\n\n_Tip: /log Name | notes_');
  }
  send_(to, '✅ *' + res.contact + '* logged\n' +
    (notes ? 'Notes: ' + notes + '\n' : '') +
    'Next follow-up: ' + res.nextActionDate);
}

function botStatus(to, name, status) {
  const valid = ['hot', 'warm', 'cold', 'converted', 'dormant', 'new'];
  if (!name || valid.indexOf(str_(status).toLowerCase()) === -1) {
    return send_(to, '❌ Usage: */status [name] [Hot/Warm/Cold/Converted/Dormant/New]*');
  }
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  const c = f.hit.cols[key_('Lead Status')];
  if (c) f.hit.sheet.getRange(f.hit.rowNum, c).setValue(titleCase_(status));
  send_(to, '✅ *' + f.hit.name + '* → *' + titleCase_(status) + '*');
}

function botPipeline(to, name, stage) {
  if (!name || isNaN(stage) || stage < 1 || stage > 5) {
    return send_(to, '❌ Usage: */update [name] [1-5]*\n1 Initial · 2 Viewed · 3 Offer · 4 Option · 5 Closed');
  }
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);

  const pipe = mustSheet_(TAB.PIPELINE);
  const p = readAll(TAB.PIPELINE);
  const names = ['', 'Initial Contact', 'Shortlisted/Viewed', 'Offer/Negotiation', 'Option/Contract', 'Closed'];
  const header = HEADERS.Pipeline[2 + stage];

  for (let i = 0; i < p.rows.length; i++) {
    if (str_(val(p.rows[i], p.cols, 'Contact ID')) === f.hit.id ||
        eq_(val(p.rows[i], p.cols, 'Name'), f.hit.name)) {
      const c = p.cols[key_(header)];
      if (c) pipe.getRange(i + 2, c).setValue(today_());
      return send_(to, '✅ *' + f.hit.name + '* → Stage ' + stage + ': *' + names[stage] + '*');
    }
  }
  // Not in Pipeline yet — add them rather than failing.
  const prow = new Array(HEADERS.Pipeline.length).fill('');
  const pc = cols(pipe);
  prow[pc[key_('Contact ID')] - 1] = f.hit.id;
  prow[pc[key_('Name')] - 1] = f.hit.name;
  prow[pc[key_(header)] - 1] = today_();
  pipe.appendRow(prow);
  send_(to, '✅ *' + f.hit.name + '* added to Pipeline at Stage ' + stage + ': *' + names[stage] + '*');
}

function botAbsd(to, name) {
  const f = findContact_(name);
  if (!f.ok) return sendAmbiguous_(to, name, f);
  const r = f.hit.row, cm = f.hit.cols;
  const note = str_(val(r, cm, 'ABSD Note'));
  send_(to, '*🏦 ABSD — ' + f.hit.name + '*\n\n' +
    'Residency: ' + (str_(val(r, cm, 'Residency Status')) || 'not recorded') + '\n' +
    'Properties owned: ' + (val(r, cm, 'Properties Owned') === '' ? 'not recorded' : num_(val(r, cm, 'Properties Owned'))) + '\n\n' +
    (note || 'Fill in Residency Status and Properties Owned to get a rate.') +
    '\n\n_Rates live on the Config tab. Always confirm at iras.gov.sg before quoting._');
}

/** /new Name | Number | Type | Property */
function botNew(to, body) {
  const p = body.split('|').map(function (x) { return x.trim(); });
  if (!p[0] || !p[1]) {
    return send_(to, '❌ Usage: */new Name | Number | Type | Property*\n\n' +
      '_e.g. /new Wei Ling | 91234567 | Resale Buyer | Dunearn_');
  }
  const res = addContact({
    fullName: p[0], mobile: p[1], clientType: p[2] || 'Others', estate: p[3] || '',
    source: 'Cold Outreach', leadStatus: 'New'
  });
  if (!res.ok) return send_(to, '⚠️ ' + res.error);
  send_(to, '✅ *' + res.name + '* added — `' + res.id + '`\n' +
    'Number: ' + res.phone + (res.phoneNote ? ' ⚠️ ' + res.phoneNote : '') + '\n' +
    'Type: ' + (p[2] || 'Others') + ' · Property: ' + (p[3] || 'not set') + '\n\n' +
    '_/qualify ' + res.name + ' to score them_');
}

/** /deal Name | Address | Value | Type */
function botDeal(to, body) {
  const p = body.split('|').map(function (x) { return x.trim(); });
  if (!p[0] || !p[2]) {
    return send_(to, '❌ Usage: */deal Name | Address | Value | Type*\n\n' +
      '_e.g. /deal Wei Ling | 23 Jalan Membina | 650000 | Buy_');
  }
  const res = addDeal({ contactName: p[0], address: p[1], value: p[2], dealType: p[3] || 'Buy', probability: 50 });
  if (!res.ok) return send_(to, '❌ ' + res.error);
  send_(to, '✅ Deal *' + res.id + '* created\n' +
    'Est. commission: S$' + res.commission.toLocaleString() + '\n\n_/summary to see the pipeline_');
}

/* ------------------------------------------------------------------ AI tools */

function botMarketBrief(to) {
  const brief = ai_(
    'You are briefing Singapore residential realtor Shervin. Today is ' + fmtDate_(today_()) + '.\n' +
    'Write a morning market brief:\n' +
    '1. 🏠 *Market Pulse* — one price/volume trend in SG residential\n' +
    '2. 📊 *Segment Watch* — HDB upgrader or new launch\n' +
    '3. 🎯 *Talking Point* — one insight for client conversations today\n' +
    '4. ⚡ *Action* — one thing to do or say to leads today\n' +
    'Under 200 words. Singapore only, specific, no generic advice.\n' +
    'Flag clearly if you are reasoning from general knowledge rather than live data.', 800);
  send_(to, '*📰 Morning brief*\n_' + fmtDate_(today_()) + '_\n\n' + brief);
}

function botContent(to, topic) {
  if (!topic) return send_(to, '❌ Usage: */content [topic]*\n\n_e.g. /content HDB upgrader mistakes_');
  const c = ai_(
    'Singapore real estate content strategist helping realtor Shervin.\n' +
    'Topic: "' + topic + '"\nPlatforms: TikTok, IG Reels, carousels\n' +
    'Audience: SG HDB owners and upgraders, 28-45.\n\n' +
    '*1. HOOK* — 3 options, under 10 words each, bold the best\n' +
    '*2. CAPTION* — 80-100 words, conversational SG tone, end on a question, 5 hashtags\n' +
    '*3. CAROUSEL* — 5 slides, max 15 words each\n' +
    '*4. WHY NOW* — one sentence on why this lands in the SG market today\n' +
    'Singapore-specific throughout.', 900);
  send_(to, '*✍️ ' + topic + '*\n\n' + c + '\n\n─────────────\n_Log it on the Content tab to track which posts actually produce leads._');
}

function botObjection(to, objection) {
  if (!objection) return send_(to, '❌ Usage: */objection [what they said]*');
  const r = ai_(
    'Senior Singapore real estate sales coach advising realtor Shervin.\n' +
    'Client objection: "' + objection + '"\n\n' +
    '*1. REFRAME* — one sentence acknowledging without agreeing\n' +
    '*2. DATA POINT* — one specific SG market fact that counters it\n' +
    '*3. RESPONSE* — a 2-3 sentence WhatsApp reply, first person, not salesy\n' +
    '*4. FOLLOW-UP QUESTION* — one question to uncover the real concern\n' +
    'Singapore context only.', 800);
  send_(to, '*🎯 Objection*\n_"' + objection.substring(0, 60) + (objection.length > 60 ? '…' : '') + '"_\n\n' + r);
}

function botListing(to, details) {
  if (!details) return send_(to, '❌ Usage: */listing [details]*');
  const l = ai_(
    'Top Singapore real estate copywriter. Write a listing from:\n' + details + '\n\n' +
    'Punchy headline · 3-4 short selling points · one lifestyle sentence · one CTA.\n' +
    'Under 180 words. Do not invent facts that were not given.', 600);
  send_(to, '*📝 Listing*\n\n' + l);
}

/*  ---------------------------------------------------------------------------
    Free-form chat, with memory.

    Without history every message was an independent API call, so answering the
    bot's own follow-up question ("3 bedroom condo, Parc Clematis...") arrived
    with no idea what it was replying to. The last 12 turns are now kept for
    30 minutes and sent with each request.
    --------------------------------------------------------------------------- */

const CONVO_TTL = 1800;   // seconds — a conversation goes cold after 30 min
const CONVO_MAX = 12;     // turns kept

function convo_(from) {
  try {
    const raw = CacheService.getScriptCache().get('convo_' + from);
    return raw ? JSON.parse(raw) : [];
  } catch (err) { return []; }
}

function convoSave_(from, msgs) {
  try {
    CacheService.getScriptCache()
      .put('convo_' + from, JSON.stringify(msgs.slice(-CONVO_MAX)), CONVO_TTL);
  } catch (err) { Logger.log('convoSave_: ' + err); }
}

function convoClear_(from) {
  try { CacheService.getScriptCache().remove('convo_' + from); } catch (err) {}
}

function botSystemPrompt_() {
  return "You are Shervin's private operations assistant. He is a CEA-licensed residential " +
    'property agent in Singapore (Huttons, CEA ' + str_(setting_('CEA Registration No.', '')) + ").\n\n" +
    'HOW TO ANSWER\n' +
    '• Do the task. If you have enough to attempt it, produce the work and put your ' +
    'assumptions in one short line underneath. Never reply with a list of questions when a ' +
    'reasonable draft is possible — he can correct a draft in seconds, but a questionnaire ' +
    'costs him a round trip.\n' +
    '• Ask at most ONE clarifying question, and only if the answer would materially change ' +
    'the output. Attempt the task first even then.\n' +
    '• This is a continuing conversation. Earlier messages are context — a short follow-up ' +
    'like "casual tone" or a bare detail refers to what was just discussed.\n' +
    '• When he asks for a client message, return the message itself, ready to copy and send. ' +
    'Not advice about writing it.\n' +
    '• Write like a sharp colleague: direct, no pleasantries, no preamble, no "certainly".\n' +
    '• Singapore context throughout — HDB/MOP, ABSD, SSD, TDSR, CPF limits, OTP, co-broke.\n' +
    '• Under 200 words unless the task genuinely needs more.\n' +
    '• Never invent transacted prices, PSF, unit numbers or figures you were not given.\n' +
    '- Never cite or recommend REALIS. It is licensed for personal research only, not for commercial use (CEA PG 02-11 s6). Point to URA, HDB, IRAS or CPF instead.\n' +
    '• Flag plainly when something depends on current policy he should verify at iras.gov.sg.';
}

function botFreeform(to, text) {
  const history = convo_(to);
  history.push({ role: 'user', content: text });

  const reply = aiCall_({
    system: botSystemPrompt_(),
    messages: history,
    maxTokens: 1000
  });

  // Never go silent. An empty reply used to produce an empty WhatsApp body,
  // which the API rejects, and the error only reached the execution log.
  if (!reply) {
    return send_(to,
      "⚠️ Couldn't get an answer just now.\n\n" +
      'Usually that means the Claude API key is missing or out of credit, or the request ' +
      'timed out. Try again in a moment, or use */help* for the command list.');
  }

  history.push({ role: 'assistant', content: reply });
  convoSave_(to, history);
  send_(to, reply);
}

/**
 * /app — WhatsApps you the phone-app link, already carrying its key.
 * Copying a long /exec URL by hand truncates easily; tapping it doesn't.
 */
function botAppLink(to) {
  let url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (err) {}
  if (!url) return send_(to, '❌ Web app is not deployed yet.');

  const key = prop_('APP_KEY', false);
  send_(to,
    '*📱 Phone app*\n\n' +
    url + (key ? '?k=' + key : '') + '\n\n' +
    'Tap it, then in Safari: *Share → Add to Home Screen*.\n' +
    "It opens straight to today's list — tap to send, tap to log." +
    (key ? '' : '\n\n⚠️ No APP_KEY set — anyone with this link can open your CRM.')
  );
}

function botHelp(to) {
  send_(to,
    '*🏠 RE Assistant v5*\n\n' +
    '*Daily:*\n' +
    '*/today* — actions + triggers\n' +
    '*/followups* — what is due\n' +
    '*/summary* — pipeline\n' +
    '*/triggers* — MOP, lease, SSD, option\n' +
    '*/drafts* - Truestorey drafts waiting\n' +
    '*/pub 1* and */skip 1* - publish or archive\n' +
    '*/brief* — market brief\n\n' +
    '*Funnel:*\n' +
    '*/score* · */qualify* · */q* [name] [tl] [intent] [fin]\n' +
    '*/hot* */warm* */cold* */dormant*\n' +
    '*/upgrade* · */downgrade* · */revive* · */broadcast [status]*\n\n' +
    '*Clients:*\n' +
    '*/link [name]* — ready-to-send message ⭐\n' +
    '*/draft [name]* — AI-written message\n' +
    '*/find [name]* · */absd [name]*\n' +
    '*/log Name | notes*\n' +
    '*/status [name] [stage]* · */update [name] [1-5]*\n\n' +
    '*Add:*\n' +
    '*/new Name | Number | Type | Property*\n' +
    '*/deal Name | Address | Value | Type*\n\n' +
    '*AI:*\n' +
    '*/listing* · */content* · */objection*\n\n' +
    '_Any other message = free-form chat. It remembers the last 30 minutes, so you can ' +
    'answer its follow-ups normally. */reset* to start a fresh thread._'
  );
}

/* ------------------------------------------------------------ 07:00 briefing */

/**
 * Called by dailyRebuild(). Unlike v4 this cannot fail silently: if WhatsApp
 * refuses the send because the 24-hour window is shut, it retries as an
 * approved template, and if that also fails it emails you the briefing.
 */
function botMorningBriefing(stats) {
  const me = myNumber_();
  if (!me) return;

  const c = readAll(TAB.CONTACTS);
  const today = today_();
  const due = [], trg = [];
  c.rows.forEach(function (r) {
    const name = str_(val(r, c.cols, 'Full Name'));
    if (!name) return;
    const nad = toDate_(val(r, c.cols, 'Next Action Date'));
    const over = nad ? daysBetween_(nad, today) : null;
    if (over != null && over >= 0) due.push({ name: name, over: over, score: num_(val(r, c.cols, 'Lead Score')) });
    const t = str_(val(r, c.cols, 'Trigger Alert'));
    if (t) trg.push(name + ' — ' + t);
  });
  due.sort(function (a, b) { return b.over - a.over || b.score - a.score; });

  let m = '*☀️ ' + fmtDate_(today) + '*\n\n';
  if (!due.length && !trg.length) {
    m += 'Nothing due, no triggers.\nGood window for lead gen or content.';
  } else {
    if (due.length) {
      m += '*Due (' + due.length + '):*\n' +
           due.slice(0, 10).map(function (x) {
             return '• ' + x.name + (x.over ? ' (' + x.over + 'd over)' : '');
           }).join('\n') + '\n\n';
    }
    if (trg.length) m += '*Triggers (' + trg.length + '):*\n• ' + trg.slice(0, 8).join('\n• ') + '\n\n';
    m += '_/today for the full list · /link [name] to send_';
  }

  const res = sendResilient_(me, m);
  if (!res.ok) {
    const to = str_(setting_('Digest Email', '')) || Session.getEffectiveUser().getEmail();
    if (to) {
      MailApp.sendEmail({
        to: to,
        subject: 'CRM morning briefing (WhatsApp delivery failed)',
        body: m.replace(/\*/g, '') +
              '\n\n---\nWhatsApp could not deliver the full message: ' + res.error +
              '\nIf a reopen template arrived, reply to it and the queued briefing will ' +
              'be sent in that newly opened conversation window.'
      });
    }
  }
}

/* --------------------------------------------------------------- transport */

function send_(to, message) {
  const res = sendResilient_(to, message);
  if (!res.ok) Logger.log('WhatsApp send failed: ' + res.error);
  return res;
}

/**
 * Send inside the customer-service window. Outside it, queue the full text and
 * use an approved template to request the reply that legally opens the window.
 */
function sendResilient_(to, message) {
  // An empty body is rejected by the API and used to fail silently.
  const body = truncate_(str_(message), 4000);
  if (!body) return { ok: false, error: 'empty message body — nothing sent' };

  const last = Number(prop_('LAST_INBOUND_MS', false) || 0);
  const windowOpen = last > 0 && Date.now() - last < 23 * 60 * 60 * 1000;
  if (windowOpen) return sendRaw_(to, { type: 'text', text: { body: body } });

  /* Graph accepts an out-of-window text with HTTP 200, then reports 131047 by
     webhook. Do not send that doomed request. Queue the real text, send the
     approved re-entry template, and let the next reply flush the queue. A
     template being delivered does NOT itself reopen the service window. */
  queuePendingWhatsApp_(to, body);
  const tplName = str_(setting_('Bot Proactive Template', 'truestorey_daily_source_check'));
  if (!tplName) {
    return { ok: false, pending: true,
      error: '24-hour WhatsApp window is closed; full message queued; no reopen template configured' };
  }

  const tpl = sendRaw_(to, {
    type: 'template',
    template: {
      name: tplName,
      language: { code: 'en_US' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd MMM yyyy') },
          { type: 'text', text: truncate_(body.replace(/\*/g, ''), 760) }
        ]
      }]
    }
  });
  if (!tpl.ok) {
    return { ok: false, pending: true,
      error: '24-hour WhatsApp window is closed; full message queued; template: ' + tpl.error };
  }
  return { ok: true, accepted: true, pending: true, templateSent: true,
    channel: 'whatsapp_template', messageId: tpl.messageId || '',
    warning: 'Full message queued until reply; proactive template accepted' };
}

function queuePendingWhatsApp_(to, body) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('WA_PENDING_' + String(Date.now()), JSON.stringify({
    to: String(to), body: truncate_(body, 4000), queuedAt: new Date().toISOString()
  }));
}

function flushPendingWhatsApp_(to) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const keys = Object.keys(all).filter(function (k) { return k.indexOf('WA_PENDING_') === 0; }).sort();
  let sent = false;
  keys.slice(0, 4).forEach(function (key) {
    let item;
    try { item = JSON.parse(all[key]); } catch (err) { props.deleteProperty(key); return; }
    if (!item || String(item.to) !== String(to) || !str_(item.body)) return;
    const result = sendRaw_(to, { type: 'text', text: { body: truncate_(item.body, 4000) } });
    if (result.ok) {
      props.deleteProperty(key);
      sent = true;
    }
  });
  return sent;
}

function recordWaStatuses_(statuses) {
  const props = PropertiesService.getScriptProperties();
  (statuses || []).forEach(function (s) {
    const err = s.errors && s.errors[0];
    const detail = err && err.error_data && err.error_data.details;
    props.setProperty('LAST_WA_STATUS', JSON.stringify({
      id: str_(s.id), status: str_(s.status), timestamp: str_(s.timestamp),
      errorCode: err && err.code || '', error: detail || err && err.message || ''
    }));
    const state = str_(s.status);
    const trackedKey = waDeliveryKey_(s.id);
    const trackedRaw = trackedKey ? props.getProperty(trackedKey) : '';
    if (state === 'delivered' || state === 'read') {
      if (trackedKey) props.deleteProperty(trackedKey);
      return;
    }
    if (state !== 'failed') return;
    Logger.log('WhatsApp delivery failed: ' + (detail || JSON.stringify(err || {})));
    if (!trackedRaw) return;
    let tracked;
    try { tracked = JSON.parse(trackedRaw); } catch (parseErr) { tracked = null; }
    if (tracked) {
      const to = str_(setting_('Digest Email', '')) || Session.getEffectiveUser().getEmail();
      if (to) {
        try {
          MailApp.sendEmail({
            to: to,
            subject: '[WhatsApp failed] ' + truncate_(tracked.subject || 'Truestorey notification', 180),
            body: str_(tracked.body) + '\n\n---\nMeta delivery failure: ' +
              (detail || err && err.message || 'unknown error')
          });
        } catch (mailErr) {
          Logger.log('WhatsApp failure email fallback failed: ' + mailErr);
        }
      }
    }
    if (trackedKey) props.deleteProperty(trackedKey);
  });
}

function waDeliveryKey_(messageId) {
  const id = str_(messageId);
  if (!id) return '';
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id);
  return 'WA_DELIVERY_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function trackWaDelivery_(messageId, subject, body) {
  const key = waDeliveryKey_(messageId);
  if (!key) return;
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('WA_DELIVERY_') !== 0) return;
    let old;
    try { old = JSON.parse(all[k]); } catch (err) { props.deleteProperty(k); return; }
    if (!old.queuedAt || now - Number(old.queuedAt) > 14 * 24 * 60 * 60 * 1000) props.deleteProperty(k);
  });
  props.setProperty(key, JSON.stringify({
    messageId: str_(messageId), subject: truncate_(subject, 180),
    body: truncate_(body, 6000), queuedAt: now
  }));
}

function sendRaw_(to, payloadExtra) {
  let token, phoneId;
  try { token = waToken_(); phoneId = waPhoneId_(); }
  catch (err) { return { ok: false, error: String(err) }; }

  const url = 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + phoneId + '/messages';
  const payload = Object.assign({ messaging_product: 'whatsapp', to: String(to) }, payloadExtra);

  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code >= 200 && code < 300) {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch (ignore) {}
      const message = parsed && parsed.messages && parsed.messages[0];
      return { ok: true, accepted: true, messageId: message && message.id || '' };
    }
    return { ok: false, error: 'HTTP ' + code + ' ' + body.substring(0, 400) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function truncate_(s, n) {
  s = String(s == null ? '' : s);
  return s.length <= n ? s : s.substring(0, n - 20) + '\n…(truncated)';
}

function sendAmbiguous_(to, query, found) {
  if (!found.matches.length) {
    return send_(to, '❌ Nobody matching "' + query + '".\n\n_/find ' + query + ' to search_');
  }
  send_(to, '❓ "' + query + '" matches ' + found.matches.length + ' contacts:\n\n' +
    found.matches.slice(0, 8).map(function (m) { return '• ' + m.name + ' — `' + m.id + '`'; }).join('\n') +
    '\n\n_Use the ID instead, e.g. /score ' + found.matches[0].id + '_');
}

/* ----------------------------------------------------------------- Claude */

/** Single-shot prompt — used by the slash commands. */
function ai_(prompt, maxTokens) {
  return aiCall_({ messages: [{ role: 'user', content: prompt }], maxTokens: maxTokens });
}

/** Full call: optional system prompt and multi-turn message history. */
function aiCall_(opts) {
  const key = claudeKey_();
  if (!key) { Logger.log('Claude: CLAUDE_API_KEY not set'); return ''; }

  const payload = {
    model: str_(setting_('Bot AI Model', 'claude-sonnet-5')),
    max_tokens: opts.maxTokens || 800,
    messages: opts.messages
  };
  if (opts.system) payload.system = opts.system;

  try {
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      Logger.log('Claude ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 400));
      return '';
    }
    const json = JSON.parse(res.getContentText());
    // Read the text block by TYPE, not position. A thinking model returns
// [thinking, text] and content[0].text is undefined, which silently
// emptied every AI command.
const block = (json.content || []).filter(function (b) { return b.type === 'text'; })[0];
return (block && block.text) || '';
  } catch (err) {
    Logger.log('Claude error: ' + err);
    return '';
  }
}
