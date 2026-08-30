import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { CONSENT_COPY, CONSENT_COPY_VERSION } from '../../../lib/consent.js';
import { upsertWatch, configured as dbConfigured } from '../../../lib/supabase/rest.js';
import { send, configured as mailConfigured } from '../../../lib/email.js';
import { recordByHref } from '../../../lib/data/query.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Start a watch on one block.
 *
 * ── DOUBLE OPT-IN, AND WHY IT IS NOT OPTIONAL HERE ──────────────────────────
 *
 * Anyone can type anyone's address into a form. Without a confirmation step
 * this route would let a stranger subscribe somebody else's inbox to updates
 * about a block — which is both a nuisance and, since the pairing of an email
 * with a home address is the point, a small act of surveillance performed with
 * this site's help. So a row is written unconfirmed and sends nothing until
 * the address itself answers.
 *
 * ── CONSENT IS STORED AS EVIDENCE ───────────────────────────────────────────
 *
 * The exact wording and its version go into the row, imported from
 * lib/consent.js so what is stored is always what was displayed. PDPA s14(2):
 * a boolean cannot answer "what did they agree to".
 *
 * ── NO PHONE FIELD ──────────────────────────────────────────────────────────
 *
 * Email only, as the whole site has been since 24 Aug 2026. A number is not
 * accepted here even if a client sends one.
 */

const MAX_BODY = 4 * 1024;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 6;

const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k);
  return list.length > MAX_PER_WINDOW;
}

/* Deliberately loose. An address that bounces is a bounce; an address rejected
 * by a clever regex is a person who cannot subscribe and never learns why. */
const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

export async function POST(req) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: 'Updates are not available on this deployment.' }, { status: 503 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'That request was too large.' }, { status: 413 });

  let body;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'Could not read that.' }, { status: 400 }); }

  // Honeypot. 200 so a bot has nothing to tune against, but nothing is written.
  if (body.website) return NextResponse.json({ ok: true, pending: true });

  if (throttled(ip)) {
    return NextResponse.json({ error: 'That is a lot of sign-ups from one connection. Try again later.' }, { status: 429 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const href = String(body.href || '').trim();

  if (!looksLikeEmail(email)) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  // The tick is the consent. An inbound submission is not — rule 4.
  if (body.consent !== true) {
    return NextResponse.json({ error: 'Tick the box to say we may email you.' }, { status: 400 });
  }

  /*
   * The block must exist in the data. Not validation theatre: without it this
   * table would accept any string as an href, the digest would report "no rows
   * for this block" forever, and the reader would have subscribed to silence
   * while believing they were being watched over.
   */
  const rec = recordByHref(href);
  if (!rec || !href.startsWith('/hdb/')) {
    return NextResponse.json({ error: 'That is not a block this site holds transactions for.' }, { status: 400 });
  }

  const confirm_token = randomUUID();
  const unsub_token = randomUUID();

  const { data, error } = await upsertWatch({
    email,
    href,
    label: rec.label || href,
    consent_copy: CONSENT_COPY.email,
    consent_version: CONSENT_COPY_VERSION,
    consent_at: new Date().toISOString(),
    confirm_token,
    unsub_token,
    // An upsert must never silently re-confirm a row somebody else created.
    confirmed_at: null,
  });
  if (error) return NextResponse.json({ error: 'Could not save that. Try again shortly.' }, { status: 502 });

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const token = data?.confirm_token || confirm_token;

  if (!mailConfigured()) {
    /*
     * Say what could not be done. The row exists and is unconfirmed, so
     * nothing will ever be sent to it — reporting success here would be the
     * silent-truncation failure this repo keeps writing tests about.
     */
    return NextResponse.json({
      ok: false,
      error: 'Sign-up is recorded, but email is not switched on for this deployment yet, '
           + 'so no confirmation can be sent. Nothing will be emailed until it is.',
    }, { status: 503 });
  }

  const url = `${siteUrl}/api/watch/confirm?t=${encodeURIComponent(token)}`;
  const res = await send({
    to: email,
    subject: `Confirm updates for ${rec.label || href}`,
    text: [
      `You asked for updates on ${rec.label || href}.`,
      '',
      `Confirm here and nothing else is needed: ${url}`,
      '',
      'If this was not you, ignore this email. Nothing is sent until it is confirmed,',
      'and an unconfirmed sign-up is deleted rather than kept.',
      '',
      `You agreed to: "${CONSENT_COPY.email}" (${CONSENT_COPY_VERSION})`,
    ].join('\n'),
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111414;max-width:520px">
<p style="margin:0 0 14px">You asked for updates on <strong>${escapeHtml(rec.label || href)}</strong>.</p>
<p style="margin:0 0 18px"><a href="${escapeHtml(url)}" style="color:#164F52">Confirm and nothing else is needed &rarr;</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#666E6A">If this was not you, ignore this email. Nothing is sent until it is confirmed, and an unconfirmed sign-up is deleted rather than kept.</p>
<p style="margin:0;font-size:12px;color:#666E6A">You agreed to: &ldquo;${escapeHtml(CONSENT_COPY.email)}&rdquo; (${escapeHtml(CONSENT_COPY_VERSION)})</p>
</div>`,
  });

  if (!res || res.error) {
    return NextResponse.json({ error: 'Could not send the confirmation email. Try again shortly.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, pending: true });
}

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
