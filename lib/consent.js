/**
 * PDPA consent — the single source of truth for the wording.
 *
 * The form renders these exact strings and the CRM writer logs this exact
 * version against the row. If the two ever drift, the "Consent Basis" column
 * records evidence of wording the person was never shown, which is worse than
 * recording nothing. Import from here in both places. Never retype the copy.
 *
 * Changing any string below is a NEW version. Bump CONSENT_COPY_VERSION in the
 * same edit — old rows keep their old version, which is the point.
 *
 * PDPA s14(2): consent must not be bundled. Each channel is a separate,
 * independently optional tick, and the tools work whether or not either is on.
 */
/**
 * v2, 24 Aug 2026 — EMAIL ONLY.
 *
 * The phone/WhatsApp tick has been withdrawn at Shervin's instruction. It is
 * not deleted from history: rows written under 2026-08-v1 keep that version
 * string and the phone consent they were actually given, which is the entire
 * reason the version travels with the row. Nothing is retro-stamped.
 *
 * Practical effect: no number is called or messaged off the back of a web
 * form. `DNC Checked` stays blank, as it always has, so if a phone channel is
 * reinstated later it starts from a real check rather than an assumption.
 */
export const CONSENT_COPY_VERSION = '2026-08-v2';

export const CONSENT_COPY = {
  email: 'Email me the full report and monthly updates on my block',
};

/**
 * What gets written to the Consent Basis column. Kept here so it versions
 * together with the wording above.
 *
 * `phone` is still accepted as an argument so that a row written by an older
 * client, or replayed from a queue, records what it was actually given rather
 * than silently losing it. Nothing on the site sends it any more.
 */
export function consentBasis({ email, phone, ip }) {
  if (!email && !phone) return '';
  const channels = [email && 'email', phone && 'phone'].filter(Boolean).join('+');
  return `Explicit web opt-in ${CONSENT_COPY_VERSION} · ${channels} · ip ${ip}`;
}

/**
 * Singapore mobile: 8 digits beginning 8 or 9. Accepts +65 / 65 prefixes and
 * any spacing. Returns the bare 8 digits, or null if it is not a valid SG mobile.
 */
export function normaliseMobile(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('65')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('065')) d = d.slice(3);
  return /^[89]\d{7}$/.test(d) ? d : null;
}
