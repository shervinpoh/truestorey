/**
 * The one path to the Property CRM sheet.
 *
 * ── WHY THIS IS A MODULE AND NOT A SECOND COPY OF THE FETCH ────────────────
 * §8.2 adds a route that emails a report and records the consent behind it.
 * The obvious way to build that is to copy the twenty lines out of
 * `app/api/lead/route.js`, and the obvious way is wrong: NEXT.md says it in
 * as many words — a second consent-writing path that does its own thing is
 * exactly how the Consent Basis column ends up recording wording nobody was
 * shown. `lib/calc/proceeds.js` is the standing example in this repo of what
 * two implementations of one calculation cost.
 *
 * So the transport lives here, and so do the four compliance columns. What
 * does NOT live here is the rest of the row: a lead carries an intent and a
 * timeline, a report request carries neither, and pretending otherwise would
 * write empty columns and call it a schema.
 *
 * ── configured() IS A FEATURE FLAG, NOT A GUARD ────────────────────────────
 * Every integration here is optional by design and a missing key disables one
 * feature and says so. This one had no such switch, so the lead form rendered
 * on every record page, took a reader's name and address, and answered with a
 * 503 telling them to WhatsApp instead. `components/Follow.jsx` settled the
 * principle for the whole site and `RecordPage.jsx` repeats it ten lines above
 * the form this fixes: an empty promise is worse than no promise, and a form
 * that collects an address before admitting it cannot store it has already
 * collected the address.
 */

/*
 * ── THE ENDPOINT THAT ALREADY EXISTS ───────────────────────────────────────
 * Read out of the live Apps Script on 12 Sep rather than assumed. The Property
 * CRM project (the one modified 7 Sep — there is an OLDER project of the same
 * name from 6 Aug, and it is not this one) has a single doPost, in 07_Bot.gs,
 * and it already accepts contacts:
 *
 *   POST <exec>?k=<WA_WEBHOOK_KEY>&admin=<APP_KEY>&action=addContacts
 *   body: a JSON ARRAY of contact objects
 *   → { added, skipped, skippedDetail }
 *
 * Three guards, in order: verifyRequest_(e) checks ?k= against WA_WEBHOOK_KEY,
 * then p.admin must equal the APP_KEY script property, then p.action must be
 * 'addContacts'. Both keys live in Script Properties, not in the code.
 *
 * SO NOTHING NEEDS TO BE ADDED TO THAT PROJECT. The transport below still
 * posts {secret, row} to the shape scripts/crm-webhook.gs expects, which is a
 * standalone script that was never deployed. Changing it over is blocked on
 * one thing only: what field names addContactsBulk_ reads. It is not in
 * 07_Bot.gs or 09_Intake.gs — look in 05_Actions.gs or 06_Import.gs — and
 * guessing them would write a row of empty columns and call it a lead.
 */
import { CONSENT_COPY_VERSION, consentBasis } from './consent.js';

export const configured = () =>
  Boolean(process.env.CRM_WEBHOOK_URL && process.env.CRM_WEBHOOK_SECRET);

/**
 * The four columns that carry the PDPA evidence, built in one place so two
 * callers cannot disagree about them.
 *
 * `DNC Checked` is written blank and stays that way — rule 5. It reflects a
 * real check or nothing, and a default of "No" would be an assumption wearing
 * the clothes of a record.
 */
export function consentFields({ email = false, phone = false, ip = 'unknown', at = new Date() }) {
  const any = Boolean(email) || Boolean(phone);
  const now = at.toISOString();
  return {
    'PDPA Consent': any ? 'Yes' : 'No',
    'Consent Date': any ? now : '',
    'Consent Basis': consentBasis({ email, phone, ip }),
    'DNC Checked': '',
    'DNC Check Date': '',
  };
}

export { CONSENT_COPY_VERSION };

/**
 * Append one contact. Returns `{ ok: true }`, or `{ error, status }` — never
 * throws, and never swallows.
 *
 * ── A DUPLICATE IS REPORTED, NOT HIDDEN ────────────────────────────────────
 * The Apps Script answers `{ ok: true, duplicate: true }` when it matches an
 * existing contact, and that used to arrive here indistinguishable from a
 * write. It is not the same thing: on 24 Aug mobile became optional, the
 * script was still deduplicating on it, and every lead after the first one
 * without a number was dropped as a duplicate of that blank while the site
 * said thank you. The script is fixed; this reports what it was told anyway,
 * because the next silent drop should be visible from the logs rather than
 * from an empty sheet.
 */
export async function writeContact(row) {
  if (!configured()) return { error: 'CRM is not configured', status: 503 };
  try {
    const res = await fetch(process.env.CRM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.CRM_WEBHOOK_SECRET, row }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('CRM write failed', res.status, body.slice(0, 300));
      return { error: `CRM ${res.status}`, status: 502 };
    }
    const out = await res.json().catch(() => ({}));
    /* Apps Script answers 200 with an error IN THE BODY — an unauthorised
       secret is a 200 carrying {error:'unauthorised'}. Reading only the status
       would record a write that never happened. */
    if (out.error) {
      console.error('CRM refused the row:', String(out.error).slice(0, 200));
      return { error: String(out.error), status: 502 };
    }
    if (out.duplicate) {
      console.warn('CRM matched an existing contact on', out.on || 'an unnamed field',
        '— nothing was appended');
      return { ok: true, duplicate: true, on: out.on || null };
    }
    return { ok: true, id: out.id || null };
  } catch (e) {
    /* Never lose the contact silently — the log is the fallback record, and it
       is the only one when the sheet is unreachable. */
    console.error('CRM unreachable', e.message, '| row:', JSON.stringify(row));
    return { error: e.name === 'TimeoutError' ? 'CRM timed out' : e.message, status: 502 };
  }
}
