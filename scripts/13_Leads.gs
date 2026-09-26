/*  ============================================================================
    13_Leads.gs — PropertyGuru leads, delivered by the WhatsApp bot
    ----------------------------------------------------------------------------
    ADDITIVE, like 10_Articles.gs. Every name here is prefixed leads* or
    botLeads*. It USES 07_Bot.gs's send_, sendResilient_, myNumber_, setting_
    and str_, and never reads or writes Contacts, Deals or Activity.

    WHY A SEPARATE TAB. Contacts holds people who ticked a consent box on the
    website, with the wording version, timestamp and IP logged against each
    row. PropertyGuru enquirers ticked nothing. Keeping them on their own tab
    keeps that evidence meaningful, and keeps /broadcast and /today from ever
    sweeping them up by accident.

    WHAT IT SENDS, each weekday at 07:00 Singapore time:
      • on a Thursday a new batch releases: the whole week's 25
      • every weekday: today's five due, with number, intent and listing
      • any lead the caller has marked Importance A that you have not picked up
    Nothing is sent on a day with nothing to say.

    SET UP ONCE
      1. Import pg-leads.csv into this spreadsheet as a new tab named exactly
         "PG Leads" (File › Import › Upload › Insert new sheet).
      2. Paste this file into the Apps Script project as 13_Leads.gs.
      3. Run leadsInstallTrigger() once from the editor. Done.
    ============================================================================ */

const LEADS_TAB = 'PG Leads';
const LEADS_TZ  = 'Asia/Singapore';

/** A cell as yyyy-MM-dd whether Sheets stored a Date or kept the text. A Date
    cell is midnight in the SPREADSHEET's zone, so it is read back in that zone;
    formatting it in another can move it a day. */
function leadsDay_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(v || '').trim().slice(0, 10);
}

/** Rows as objects keyed by header, so a reordered sheet cannot break this. */
function leadsRead_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(LEADS_TAB);
  if (!sh) return null;
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const hdr = values[0].map(function (h) { return String(h).trim(); });
  return values.slice(1)
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      const o = {};
      hdr.forEach(function (h, i) { o[h] = r[i]; });
      return o;
    });
}

/** E.164, whatever Sheets did to it. Sheets reads "+6591234567" on import as
    the number 6591234567 and drops the plus, so it is put back here rather
    than trusted from the cell. Falls back to Mobile on an older import. */
function leadsDial_(l) {
  const d = String(l['Dial'] || '').replace(/[^\d]/g, '');
  if (d) return '+' + d;
  const m = String(l['Mobile'] || '').replace(/[^\d]/g, '');
  return m.length === 8 ? '+65' + m : (m ? '+' + m : '');
}

/** The caller's D, or an explicit do-not-call, is terminal: never listed again. */
function leadsLive_(l) {
  return str_(l['Importance']) !== 'D' && str_(l['Call Status']) !== 'Do not call';
}

function leadsLine_(l) {
  const name = str_(l['Name']) || '(no name)';
  const listing = str_(l['Listings']).split('|')[0].replace(/\s*\(\d+\)\s*$/, '').trim();
  return '• *' + name + '* · ' + leadsDial_(l) + ' · ' + str_(l['Intent']) +
         (listing ? '\n   ' + listing : '') +
         (str_(l['Callable']) === 'YES' ? '' : '  _(not yet callable)_');
}

/** The message for a given day, or '' if there is nothing to say. */
function leadsDigest_(todayKey) {
  const rows = leadsRead_();
  if (rows === null) return '⚠️ No "' + LEADS_TAB + '" tab in the CRM. Import pg-leads.csv first.';
  let m = '';

  const released = rows.filter(function (l) { return leadsDay_(l['Release Date']) === todayKey; });
  if (released.length) {
    m += '*📥 New batch ' + str_(released[0]['Batch']) + ' — ' + released.length +
         ' leads this week*\n' + released.map(function (l) {
           return '• ' + (str_(l['Name']) || '(no name)') + ' · ' + leadsDial_(l) +
                  ' · ' + str_(l['Intent']) + ' · ' + leadsDay_(l['Due Date']).slice(5);
         }).join('\n') + '\n\n';
  }

  const today = rows.filter(function (l) {
    return leadsDay_(l['Due Date']) === todayKey && leadsLive_(l);
  });
  if (today.length) {
    m += '*📞 Today (' + today.length + ')*\n' + today.map(leadsLine_).join('\n') + '\n\n';
  }

  const hot = rows.filter(function (l) {
    return str_(l['Importance']) === 'A' && !str_(l['Next Action']);
  });
  if (hot.length) {
    m += '*🔥 Qualified A, waiting for you (' + hot.length + ')*\n' +
         hot.slice(0, 10).map(function (l) {
           return '• *' + (str_(l['Name']) || leadsDial_(l)) + '* · ' + leadsDial_(l) +
                  (str_(l['Qualification Notes']) ? '\n   ' + str_(l['Qualification Notes']) : '');
         }).join('\n') + '\n\n';
  }
  return m ? m + '_/leads for today · /week for the batch_' : '';
}

/** 07:00 daily. Silent at weekends and on a day with nothing to say. */
function leadsMorning() {
  const now = new Date();
  const dow = Number(Utilities.formatDate(now, LEADS_TZ, 'u'));   // 1 Mon … 7 Sun
  if (dow >= 6) return;
  const me = myNumber_();
  if (!me) return;
  const m = leadsDigest_(Utilities.formatDate(now, LEADS_TZ, 'yyyy-MM-dd'));
  if (!m) return;

  const res = sendResilient_(me, m);
  if (!res.ok) {
    // Same fallback as the 07:00 briefing: a lead list that vanishes is the
    // failure this whole module exists to prevent.
    const to = str_(setting_('Digest Email', '')) || Session.getEffectiveUser().getEmail();
    if (to) MailApp.sendEmail({ to: to, subject: 'PG leads for today (WhatsApp delivery failed)',
                                body: m.replace(/\*/g, '') + '\n\n---\n' + res.error });
  }
}

/** /leads — today's calls, on demand. */
function botLeadsToday(to) {
  const key = Utilities.formatDate(new Date(), LEADS_TZ, 'yyyy-MM-dd');
  send_(to, leadsDigest_(key) || 'No PG leads scheduled for today.');
}

/** /week — the batch released most recently, whatever day it is. */
function botLeadsWeek(to) {
  const rows = leadsRead_();
  if (!rows) return send_(to, 'No "' + LEADS_TAB + '" tab yet.');
  const key = Utilities.formatDate(new Date(), LEADS_TZ, 'yyyy-MM-dd');
  const past = rows.map(function (l) { return leadsDay_(l['Release Date']); })
                   .filter(function (d) { return d && d <= key; }).sort();
  if (!past.length) return send_(to, 'First batch has not released yet.');
  const rel = past[past.length - 1];
  const b = rows.filter(function (l) { return leadsDay_(l['Release Date']) === rel && leadsLive_(l); });
  send_(to, '*Batch ' + str_(b[0]['Batch']) + ' · released ' + rel + '*\n' +
            b.map(function (l) { return leadsDay_(l['Due Date']).slice(5) + ' ' + leadsLine_(l); }).join('\n'));
}

/** Run once from the editor. Replaces any earlier copy of the trigger. */
function leadsInstallTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'leadsMorning') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('leadsMorning').timeBased().everyDays(1).atHour(7)
           .inTimezone(LEADS_TZ).create();
  Logger.log('leadsMorning will run daily at 07:00 ' + LEADS_TZ);
}

/** Run from the editor to see exactly what 1 Oct will send, without sending. */
function leadsPreview() {
  Logger.log(leadsDigest_('2026-10-01') || '(nothing for that day)');
}
