'use client';
import { useState } from 'react';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/**
 * A written copy of the result, to the reader's own inbox.
 *
 * NEXT.md §8.2: lib/consent.js has promised "the full report" since 24 Aug
 * 2026 and no report had ever existed. The constraint it sets is the shape of
 * this: the report renders IN FULL on screen first, and the email is a copy,
 * never the unlock. A reader who closes the tab without giving an address has
 * lost nothing, which is why this sits under the finished ledger rather than
 * in front of it.
 *
 * The address is used once and stored nowhere, so there is no tick here: a
 * consent box records a permission, and none is being taken. What it must do
 * instead is say that plainly, because "give us your email" reads as a list
 * unless the sentence next to it says otherwise.
 *
 * Only rendered when the server says it can actually send — Follow.jsx settled
 * that principle: an empty promise is worse than no promise, and a form that
 * takes an address before admitting it cannot use it has already taken it.
 */
export default function EmailReport({ tool, hash, title = 'this report' }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');   // idle | sending | sent | error
  const [error, setError] = useState('');
  const [website, setWebsite] = useState('');   // honeypot

  async function submit(e) {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending'); setError('');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, hash, email, website }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setError(j.error || 'That did not send. Try again in a moment.'); setState('error'); return; }
      setState('sent');
      // The tool only. Not the address, not a figure — see lib/analytics.js.
      track(EVENTS.REPORT, { tool });
    } catch {
      setError('That did not send — the connection dropped. Nothing was saved.');
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div className="emailreport" role="status">
        <p style={{ margin: 0 }}><b>Sent to {email}.</b> It should arrive within a minute; look in
          spam if it does not. Your address was used to send that one email and was not stored.</p>
      </div>
    );
  }

  return (
    <form className="emailreport" onSubmit={submit}>
      <h3>Email me this report</h3>
      <p className="hint">
        The two figures, the full ledger, what is not in it and the rules being applied — written
        out, in one email you can keep or forward. Everything in it is on this page already.
      </p>
      <div className="emailreport-row">
        <label className="vh" htmlFor="report-email">Your email address</label>
        <input id="report-email" type="email" required value={email} autoComplete="email"
          placeholder="you@example.com" onChange={e => setEmail(e.target.value)}
          disabled={state === 'sending'} />
        <button type="submit" className="cta" disabled={state === 'sending' || !email}>
          {state === 'sending' ? 'Sending…' : `Send ${title}`}
        </button>
      </div>
      {/* Hidden from people, filled by automated submitters. */}
      <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />
      {error && <p className="hint warnline" role="alert">{error}</p>}
      <p className="hint">
        <b>Your address is used once, to send that email, and is not stored.</b> There is no list
        here, no follow-up, and nothing to unsubscribe from. Your figures travel to this site only
        to write the email and are not kept either.
      </p>
    </form>
  );
}
