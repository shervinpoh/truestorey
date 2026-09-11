/**
 * ⚠ DO NOT PASTE THIS OVER THE PROPERTY CRM APPS SCRIPT PROJECT.
 *
 * The header here used to read "Paste into your Property CRM sheet:
 * Extensions → Apps Script", and on 12 Sep that instruction was followed as
 * far as opening the editor with the whole file on the clipboard. The project
 * it was about to replace has eleven files — 00_Core.gs through 09_Intake.gs
 * plus the article bot in 10–12 — and 00_Core.gs is the shared plumbing every
 * one of them calls: the tab list, the column resolver that looks columns up
 * BY NAME, the date and phone helpers, and the C-0001 ID generator. Pasting
 * over it would have destroyed the CRM.
 *
 * Two harder reasons it is the wrong artefact even as a new file:
 *
 *   · APPS SCRIPT ALLOWS ONE doPost PER PROJECT, and that project already has
 *     one, in 07_Bot.gs. It is the WhatsApp webhook, it is open to anyone
 *     because Meta requires that, it is guarded by a ?k=WA_WEBHOOK_KEY in the
 *     URL, and it dispatches on p.action — there is already an 'addContacts'
 *     branch. A second doPost is a duplicate function declaration.
 *
 *   · IT REIMPLEMENTS 00_Core.gs BADLY. The ID generation below is a second
 *     copy of one that already exists, and the header lookup is a second copy
 *     of cols(). Two implementations of one thing is the failure this repo
 *     records against lib/calc/proceeds.js.
 *
 * KEPT, NOT DELETED, because the duplicate-guard fix in it is real and the
 * reasoning is worth reading before writing the equivalent inside 09_Intake.gs
 * or 07_Bot.gs. Treat it as a reference implementation for a sheet that has
 * nothing else in it, which the Property CRM has not been for a long time.
 *
 * The right integration is a `kind` on the EXISTING doPost, in the same shape
 * as the articles hook documented at the bottom of scripts/10_Articles.gs, and
 * CRM_WEBHOOK_URL pointing at the deployment that already exists.
 */
const SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';
const TAB = 'Contacts';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ error: 'unauthorised' });

    const sheet = SpreadsheetApp.getActive().getSheetByName(TAB);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Next Contact ID: C-0001 style, continuing your existing sequence.
    const idCol = headers.indexOf('Contact ID') + 1;
    let nextId = 'C-0001';
    if (idCol > 0 && sheet.getLastRow() > 1) {
      const ids = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1).getValues()
        .flat().filter(String).map(v => parseInt(String(v).replace(/\D/g, ''), 10) || 0);
      nextId = 'C-' + String(Math.max(0, ...ids) + 1).padStart(4, '0');
    }
    body.row['Contact ID'] = nextId;

    /*
     * Duplicate guard.
     *
     * ── WHY IT IS NOT ON MOBILE ANY MORE, AND WHAT THAT COST ───────────────
     * It was, and mobile stopped being required on 24 Aug 2026 when consent
     * went email-only. So most rows arrive with Mobile blank, blank matched
     * the blank already in the sheet, and every lead after the first one
     * without a number was discarded as a duplicate of it — while this
     * returned ok:true and the site thanked the reader. A silent success over
     * a write that did not happen is the worst failure this file can have.
     *
     * Email is the required field now, so email is the key. A blank value is
     * never a duplicate of another blank: an absent identifier identifies
     * nobody, and matching on it drops real people.
     */
    const keyOf = function (name) {
      const col = headers.indexOf(name) + 1;
      if (col < 1) return null;
      const want = String(body.row[name] || '').trim().toLowerCase();
      if (!want) return null;                      // nothing to match on
      if (sheet.getLastRow() < 2) return null;     // nothing to match against
      const seen = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues()
        .flat().map(function (v) { return String(v || '').trim().toLowerCase(); })
        .filter(String);
      return seen.indexOf(want) !== -1 ? name : null;
    };
    const dupOn = keyOf('Email') || keyOf('Mobile');
    if (dupOn) return json({ ok: true, duplicate: true, on: dupOn });

    sheet.appendRow(headers.map(h => body.row[h] !== undefined ? body.row[h] : ''));
    return json({ ok: true, id: nextId });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
