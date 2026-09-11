/**
 * Paste into your Property CRM sheet: Extensions → Apps Script.
 * Deploy → New deployment → Web app → Execute as ME, access ANYONE.
 * Put the resulting /exec URL in .env.local as CRM_WEBHOOK_URL.
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
