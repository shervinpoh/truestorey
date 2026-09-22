/**
 * Lead capture → your existing "Property CRM" Google Sheet.
 *
 * Maps onto the Contacts tab schema you already have, including the
 * PDPA Consent / Consent Date / Consent Basis / DNC Checked columns.
 *
 * ⚠ COMPLIANCE — do not weaken any of this:
 *  - Consent is per-channel and OPTIONAL. Bundled consent is void under PDPA s14(2).
 *  - We log the exact consent WORDING VERSION shown, plus timestamp and IP.
 *    That is what makes it "evidential form" and lifts the 21-day DNC obligation.
 *    The wording lives in lib/consent.js and is imported by BOTH the form and
 *    this file, so what is logged is always what was displayed.
 *  - An inbound message is NOT consent. Only an explicit ticked box is.
 *  - 'DNC Checked' is written blank, always. It reflects a real check or nothing.
 */
import { NextResponse } from 'next/server';
import { CONSENT_COPY_VERSION, normaliseMobile } from '../../../lib/consent.js';
/* The transport and the four PDPA columns live in lib/crm.js so that the
   report route in §8.2 cannot grow a second copy of them. See the note at the
   top of that file: two consent-writing paths is how the Consent Basis column
   ends up recording wording nobody was shown. */
import { configured as crmConfigured, consentFields, writeContact } from '../../../lib/crm.js';
/* The body cap, the throttle and the honeypot moved to lib/formguard.js when
   the report route needed the same three. Same numbers, one implementation. */
import { MAX_BODY, ipOf, isBot, makeThrottle, readJson } from '../../../lib/formguard.js';

export { CONSENT_COPY_VERSION };
export const dynamic = 'force-dynamic';

/* The authoritative duplicate guard is the Apps Script's normalised email,
   then mobile, check; this is the speed bump in front of it. */
const throttled = makeThrottle({ windowMs: 60 * 60 * 1000, max: 5 });

export async function POST(req) {
  const ip = ipOf(req);

  const read = await readJson(req, { max: MAX_BODY });
  if (read.error) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.body;

  // Answer 200 to a bot so it has nothing to tune against, but write nothing.
  if (isBot(body)) return NextResponse.json({ ok: true });

  if (throttled(ip)) {
    return NextResponse.json(
      { error: 'That is a lot of enquiries from one connection. Please WhatsApp me instead.' },
      { status: 429 });
  }

  const {
    name, mobile, email,
    propertyType, addressOrProject, district,
    intent, timeline, source,
    consentEmail = false, consentPhone = false,
    computed = {},
  } = body;

  const cleanName = String(name || '').trim().slice(0, 100);
  if (cleanName.length < 2) {
    return NextResponse.json({ error: 'Please give me a name I can use.' }, { status: 400 });
  }

  /*
   * EMAIL IS REQUIRED AND MOBILE IS NOT. This was the other way round, and the
   * other way round was incoherent: consent has been email-only since 24 Aug
   * 2026, the form says in as many words that no phone call and no WhatsApp
   * come from it, and yet the number was the field you could not submit
   * without while the address it can actually reply to was optional.
   *
   * So it demanded the one channel it had promised never to use, and someone
   * who left the address blank had consented to nothing and handed over a
   * number with no stated purpose — which is the PDPA s20 point, not merely an
   * odd look. A number kept for a use that does not exist is a number that
   * should not have been collected.
   *
   * Mobile is still accepted, still validated when given, and still the fastest
   * way to reach someone who wants to be reached that way. It is just not the
   * price of asking a question any more.
   */
  const cleanEmail = String(email || '').trim().slice(0, 160);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return NextResponse.json(
      { error: 'Please give me an email address I can reply to.' }, { status: 400 });
  }

  const cleanMobile = mobile ? normaliseMobile(mobile) : '';
  if (mobile && !cleanMobile) {
    return NextResponse.json(
      { error: 'That does not look like a Singapore mobile number. Leave it blank if you would rather not.' },
      { status: 400 });
  }
  // Consent to be emailed is meaningless without an address to email. Still
  // asserted rather than assumed: an address is now always present, and an
  // address is still not a tick.
  const emailOptIn = Boolean(consentEmail) && Boolean(cleanEmail);

  /* The form is hidden when this is false, so reaching here means a direct
     POST rather than a reader. It still answers honestly rather than
     pretending to have saved anything. */
  if (!crmConfigured()) {
    console.error('CRM webhook URL or query keys not set — lead not saved:', cleanName, cleanMobile);
    return NextResponse.json({ error: 'Could not save. Please WhatsApp instead.' }, { status: 503 });
  }

  const now = new Date().toISOString();
  const cap = (s, n) => String(s || '').trim().slice(0, n);
  const cleanIntent = cap(intent, 40);
  const taxonomy = {
    Selling: { clientType: 'Resale Seller', intent: 'Sell' },
    Buying: { clientType: 'Resale Buyer', intent: 'Buy' },
    Both: { clientType: 'Resale Seller', intent: 'Sell+Buy (upgrade)' },
    'Just looking': { clientType: 'Others', intent: 'Unknown' },
  }[cleanIntent] || { clientType: 'Others', intent: cleanIntent || 'Unknown' };

  // Column order matches the Contacts tab of Property CRM.
  const row = {
    'Full Name': cleanName,
    'Mobile': cleanMobile,
    'Email': cleanEmail,
    'Source': cap(source, 120) || 'Website',
    'Client Type': taxonomy.clientType,
    'Intent': taxonomy.intent,
    'Current Property Type': cap(propertyType, 40),
    'Current Address / Estate': cap(addressOrProject, 160),
    'District': cap(district, 10),
    'Timeline': cap(timeline, 40),
    'Lead Status': 'New',
    'Stage': 'New',
    'Owner Notes': cap(computed.summary, 500),
    'Next Action': 'First contact',
    'Next Action Date': now.slice(0, 10),
    ...consentFields({ email: emailOptIn, phone: Boolean(consentPhone), ip }),
    'Created Date': now,
  };

  const saved = await writeContact(row);
  if (saved.error) {
    return NextResponse.json({ error: 'Could not save. Please WhatsApp instead.' },
      { status: saved.status || 502 });
  }
  return NextResponse.json({ ok: true });
}
