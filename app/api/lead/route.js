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
import { CONSENT_COPY_VERSION, consentBasis, normaliseMobile } from '../../../lib/consent.js';

export { CONSENT_COPY_VERSION };
export const dynamic = 'force-dynamic';

const MAX_BODY = 8 * 1024;        // a lead is ~1KB; anything larger is not a lead
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

/**
 * Per-IP throttle. In-memory, so it resets on redeploy and is per-instance on
 * serverless — deliberately a speed bump, not a security boundary. The real
 * guard against a flooded CRM is the duplicate-mobile check in the Apps Script.
 */
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k);
  return list.length > MAX_PER_WINDOW;
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: 'That request was too large.' }, { status: 413 });
  }
  let body;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'Could not read that form.' }, { status: 400 }); }

  // Honeypot: a hidden field only an automated submitter fills. Answer 200 so
  // the bot has nothing to tune against, but write nothing.
  if (body.website) return NextResponse.json({ ok: true });

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

  const cleanMobile = normaliseMobile(mobile);
  if (!cleanMobile) {
    return NextResponse.json(
      { error: 'That does not look like a Singapore mobile number.' }, { status: 400 });
  }

  const cleanEmail = String(email || '').trim().slice(0, 160);
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  }
  // Consent to be emailed is meaningless without an address to email.
  const emailOptIn = Boolean(consentEmail) && Boolean(cleanEmail);

  if (!process.env.CRM_WEBHOOK_URL || !process.env.CRM_WEBHOOK_SECRET) {
    console.error('CRM_WEBHOOK_URL / CRM_WEBHOOK_SECRET not set — lead not saved:', cleanName, cleanMobile);
    return NextResponse.json({ error: 'Could not save. Please WhatsApp instead.' }, { status: 503 });
  }

  const now = new Date().toISOString();
  const cap = (s, n) => String(s || '').trim().slice(0, n);
  const anyConsent = emailOptIn || Boolean(consentPhone);

  // Column order matches the Contacts tab of Property CRM.
  const row = {
    'Full Name': cleanName,
    'Mobile': cleanMobile,
    'Email': cleanEmail,
    'Source': cap(source, 120) || 'Website',
    'Client Type': cap(intent, 40),
    'Current Property Type': cap(propertyType, 40),
    'Current Address / Estate': cap(addressOrProject, 160),
    'District': cap(district, 10),
    'Timeline': cap(timeline, 40),
    'Lead Status': 'New',
    'Stage': 'New',
    'Owner Notes': cap(computed.summary, 500),
    'Next Action': 'First contact',
    'Next Action Date': now.slice(0, 10),
    'PDPA Consent': anyConsent ? 'Yes' : 'No',
    'Consent Date': anyConsent ? now : '',
    'Consent Basis': consentBasis({ email: emailOptIn, phone: Boolean(consentPhone), ip }),
    'DNC Checked': '',        // deliberately blank — never assume
    'DNC Check Date': '',
    'Created Date': now,
  };

  try {
    const res = await fetch(process.env.CRM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.CRM_WEBHOOK_SECRET, row }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error('CRM write failed', res.status, await res.text().catch(()=>''));
      return NextResponse.json({ error: 'Could not save. Please WhatsApp instead.' }, { status: 502 });
    }
  } catch (e) {
    // Never lose the lead silently — the log is the fallback record.
    console.error('CRM unreachable', e.message, '| lead:', JSON.stringify(row));
    return NextResponse.json({ error: 'Could not save. Please WhatsApp instead.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
