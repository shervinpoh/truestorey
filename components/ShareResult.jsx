'use client';
import { useEffect, useRef, useState } from 'react';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/**
 * "Send this to someone" for a calculator result.
 *
 * NEXT.md §8.6: because this site never publishes a valuation, its output is
 * safe to forward — a reader can send it to a spouse or a parent without it
 * reading as a pitch. Every tool ended with a figure and no way to keep it;
 * the only way to show someone else was to retype every input.
 *
 * `url` is a FUNCTION, called at the moment of the click. The page also keeps
 * the address bar in step, but on a debounce, and a reader who changes a
 * figure and clicks straight away must not copy the result from before.
 *
 * The note under the buttons is part of the feature, not decoration. A reader
 * about to paste their purchase price into a group chat should know that the
 * figures are in the link and that anyone holding it sees them — and that this
 * site never receives them. lib/share.js says why that last part is true.
 */
export default function ShareResult({ tool, title, url }) {
  const [state, setState] = useState('idle');   // idle | copied | manual
  const [manual, setManual] = useState('');
  const [canShare, setCanShare] = useState(false);
  const field = useRef(null);

  // navigator.share exists on phones and some desktops. Checked after mount so
  // the server render and the first client render agree.
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && !!navigator.share); }, []);
  useEffect(() => {
    if (state !== 'copied') return;
    const t = setTimeout(() => setState('idle'), 2400);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => { if (state === 'manual') field.current?.select(); }, [state]);

  async function copy() {
    const link = url();
    try {
      await navigator.clipboard.writeText(link);
      setState('copied');
      track(EVENTS.SHARE, { tool, how: 'copy' });
    } catch {
      // Clipboard access can be refused (an embedded browser, a permission
      // policy). The link is still the answer — show it to be copied by hand.
      setManual(link);
      setState('manual');
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url: url() });
      track(EVENTS.SHARE, { tool, how: 'native' });
    } catch { /* the reader closed the share sheet; nothing happened */ }
  }

  return (
    <div className="shareresult">
      <div className="shareresult-actions">
        <button type="button" className="ghost" onClick={copy} aria-live="polite">
          {state === 'copied' ? 'Link copied' : 'Copy a link to this result'}
        </button>
        {canShare && <button type="button" className="ghost" onClick={share}>Share…</button>}
      </div>
      {state === 'manual' && (
        <label className="shareresult-manual">
          <span className="hint">Copy this link:</span>
          <input ref={field} readOnly value={manual} onFocus={e => e.target.select()} />
        </label>
      )}
      <p className="hint">
        Your figures travel inside the link, after the <span className="mono">#</span>, which a
        browser never sends to a server — so this site does not receive or store them. Anyone you
        send it to sees the same figures.
      </p>
    </div>
  );
}

/**
 * What a reader sees when they open a link somebody sent. It names any field
 * the link carried that could not be read, rather than letting a figure quietly
 * revert to the page's own starting value and answer a different question.
 */
export function OpenedFromLink({ fromLink, labels }) {
  if (!fromLink) return null;
  const dropped = [...new Set(fromLink.dropped.map(k => labels[k] || k))];
  return (
    <p className="note" role="status" style={{ marginTop: 0 }}>
      <b>Opened from a shared link.</b> These are the figures it carried
      {dropped.length > 0 && <> — except the{' '}
        {new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(dropped)}, which
        could not be read and {dropped.length === 1 ? 'was' : 'were'} left as this page
        starts</>}. Change anything and the result is yours.
    </p>
  );
}
