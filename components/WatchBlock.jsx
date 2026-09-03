'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CONSENT_COPY } from '../lib/consent.js';
import { isWatching } from '../lib/watching.js';

/**
 * Ask to hear when something is filed at this block.
 *
 * WHY THIS IS THE ONLY PLACE AN EMAIL IS WORTH ASKING FOR. Every lookup,
 * calculator and map on this site is free and ungated, on purpose — that is
 * the strategic position, not a launch offer. So an email box has to earn
 * itself by offering something the page genuinely cannot: what happens NEXT.
 * The page has every transaction filed so far; it cannot have tomorrow's.
 *
 * THE TICK IS THE CONSENT AND IT IS NOT PRE-CHECKED. Rule 4 — an inbound
 * message is not consent, only an explicit ticked box is. The wording is
 * imported from lib/consent.js rather than retyped, so what a person is shown
 * is exactly what gets stored against their row. PDPA s14(2).
 *
 * NO PHONE FIELD, and no second tick to bundle it with. One channel, one
 * consent, and the form works or fails on that alone.
 *
 * THE PROMISE IS DELIBERATELY SMALL. "When something is filed" — not weekly,
 * not a newsletter, not market commentary. HDB publishes by month with a lag,
 * so promising anything faster would be promising something the source does
 * not carry.
 */
export default function WatchBlock({ href, label }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  /* Null until the browser has been asked. Three states, not two: the form
     must not flash on screen for somebody who is already subscribed, and the
     "you are on the list" panel must not flash for somebody who is not. */
  const [known, setKnown] = useState(null);
  useEffect(() => { setKnown(isWatching(href)); }, [href]);
  const [state, setState] = useState('idle');
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (state === 'sending' || !email.trim() || !consent) return;
    setState('sending'); setMsg('');
    try {
      const res = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, href, consent, website: '' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || 'That did not work.');
      setState('sent');
    } catch (err) {
      setMsg(err.message); setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div className="note" style={{ marginTop: 22 }}>
        <b>Check your inbox.</b> There is a confirmation link waiting — nothing is sent until you
        open it, which is what stops anyone signing up an address that is not theirs.
      </div>
    );
  }

  /* Already on the list, according to this browser. Says "this device"
     because that is all it knows — the subscription lives on the server and
     the note here can be missing (a different phone, a cleared browser)
     without the emails stopping. Never used to decide whether somebody IS
     subscribed, only whether to offer to sign them up again. */
  if (known) {
    return (
      <div className="watchbox">
        <span className="filtn">You are on the list for this block</span>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          Updates start with the next transaction filed at {label}, and nothing goes out in a
          month when nothing was filed. Every update carries a one-click link that stops it.
        </p>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          This is remembered in this browser only — on another device the form will appear again,
          and signing up twice with the same address changes nothing.{' '}
          <Link href="/watch">Blocks you are watching</Link>
          {' · '}
          <button type="button" className="linkish" onClick={() => setKnown(false)}>
            Show the form anyway
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="watchbox">
      <span className="filtn">Hear when something is filed here</span>
      <p className="hint" style={{ margin: '6px 0 12px' }}>
        HDB publishes resale registrations by month, with a lag — so this tells you what the
        register now shows for {label}, not what happened yesterday. Nothing goes out in a month
        when nothing was filed.
      </p>

      <div className="watchrow">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="email" aria-label="Your email address" />
        <button type="submit" className="mapopt" disabled={!email.trim() || !consent || state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send me updates'}
        </button>
      </div>

      {/* Honeypot. Off-screen rather than display:none, which some fillers skip. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />

      <label className="watchtick">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>{CONSENT_COPY.email}</span>
      </label>

      <p className="hint" style={{ margin: '10px 0 0' }}>
        One click stops it, and stopping deletes the record rather than flagging it. Your address is
        never sold, never passed on, and never used for anything else. No phone number is asked for
        and none is stored.
      </p>

      {state === 'error' && (
        <div className="warn" style={{ marginTop: 12 }}><p style={{ margin: 0 }}>{msg}</p></div>
      )}
    </form>
  );
}
