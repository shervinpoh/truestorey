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

    // Duplicate guard on mobile.
    const mobCol = headers.indexOf('Mobile') + 1;
    if (mobCol > 0 && sheet.getLastRow() > 1) {
      const existing = sheet.getRange(2, mobCol, sheet.getLastRow() - 1, 1).getValues().flat().map(String);
      if (existing.indexOf(String(body.row['Mobile'])) !== -1) {
        return json({ ok: true, duplicate: true });
      }
    }

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
