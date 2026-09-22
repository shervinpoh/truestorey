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
 * The field names were read from 05_Actions.gs on 21 Sep. The conversion below
 * is deliberately explicit: the website's sheet-shaped row and the script's
 * import object are different contracts, and sending one as the other writes
 * defaults into most of the contact.
 *
 * `addContacts` returns a numeric added count, an ids array, a numeric skipped
 * count and skippedDetail. Do not infer success from HTTP 200: the same public
 * deployment deliberately answers plain `OK` when either query key is wrong.
 */
import { CONSENT_COPY_VERSION, consentBasis } from './consent.js';

export const configured = () =>
  Boolean(process.env.CRM_WEBHOOK_URL && process.env.CRM_WEBHOOK_KEY
    && process.env.CRM_ADMIN_KEY);

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
 * Translate the site's named CRM columns into addContactsBulk_'s public input.
 *
 * Do not send `dncChecked`. The Apps Script must write that cell blank: false
 * is still a claim that a check took place and returned a result. Consent Date
 * travels separately because Consent Basis says what was agreed to, not when.
 */
export function toBulkContact(row = {}) {
  const get = name => String(row[name] ?? '').trim();
  const consent = row['PDPA Consent'] === true || /^yes$/i.test(get('PDPA Consent'));
  return {
    fullName: get('Full Name'),
    mobile: get('Mobile'),
    email: get('Email'),
    source: get('Source'),
    tier: get('Relationship Tier'),
    clientType: get('Client Type'),
    intent: get('Intent'),
    currentPropertyType: get('Current Property Type'),
    estate: get('Current Address / Estate'),
    district: get('District'),
    keyDateType: get('Key Date Type'),
    timeline: get('Timeline'),
    leadStatus: get('Lead Status'),
    stage: get('Stage'),
    notes: get('Owner Notes'),
    nextAction: get('Next Action'),
    nextActionDate: get('Next Action Date'),
    consent,
    consentDate: consent ? get('Consent Date') : '',
    consentBasis: consent ? get('Consent Basis') : '',
    createdDate: get('Created Date'),
  };
}

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
    const endpoint = new URL(process.env.CRM_WEBHOOK_URL);
    endpoint.searchParams.set('k', process.env.CRM_WEBHOOK_KEY);
    endpoint.searchParams.set('admin', process.env.CRM_ADMIN_KEY);
    endpoint.searchParams.set('action', 'addContacts');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([toBulkContact(row)]),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      console.error('CRM write failed', res.status, body.slice(0, 300));
      return { error: `CRM ${res.status}`, status: 502 };
    }
    const out = (() => { try { return JSON.parse(body); } catch { return null; } })();
    /* This deployment answers plain `OK` when either query key is wrong. A 200
       is therefore not evidence of a write; only addContacts' result shape is. */
    if (!out || !Number.isInteger(out.added) || !Array.isArray(out.ids)
        || !Number.isInteger(out.skipped)) {
      console.error('CRM returned no addContacts receipt:', body.slice(0, 200));
      return { error: 'CRM did not confirm the write', status: 502 };
    }
    if (out.added > 0 && out.ids.length) {
      const id = /^(C-\d+)/.exec(String(out.ids[0] || ''))?.[1] || null;
      return { ok: true, id };
    }

    const detail = Array.isArray(out.skippedDetail) ? out.skippedDetail : [];
    const duplicate = detail.find(d => /duplicate/i.test(String(d?.error || '')));
    if (duplicate) {
      console.warn('CRM matched an existing contact — nothing was appended');
      return { ok: true, duplicate: true, on: duplicate.duplicateOn || null };
    }
    console.error('CRM skipped the contact:', JSON.stringify(detail).slice(0, 300));
    return { error: 'CRM skipped the contact', status: 502 };
  } catch (e) {
    /* Never lose the contact silently — the log is the fallback record, and it
       is the only one when the sheet is unreachable. */
    console.error('CRM unreachable', e.message, '| row:', JSON.stringify(row));
    return { error: e.name === 'TimeoutError' ? 'CRM timed out' : e.message, status: 502 };
  }
}
