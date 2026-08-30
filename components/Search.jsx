'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/**
 * Typeahead over every block and project. Navigates — it does not set state.
 *
 * ── TWO THINGS A COMBOBOX HAS TO DO THAT THIS ONE DID NOT ───────────────────
 *
 * ARROW KEYS MOVED A HIGHLIGHT NOBODY WAS TOLD ABOUT. The options carried
 * role="option" and aria-selected, which is half of it — but a screen reader
 * follows the FOCUSED element, and focus never leaves the input in a combobox.
 * Without aria-activedescendant pointing at the highlighted option's id,
 * pressing Down moved a visual highlight and announced nothing at all. The
 * options had no ids to point at, which is why it was never wired.
 *
 * "NOTHING MATCHING THAT" APPEARED BEFORE THE ANSWER DID. The fetch is debounced
 * 140ms and then takes as long as it takes, and during all of that `sugg` is
 * empty — so the empty-state line rendered under every second keystroke, then
 * vanished when results arrived. It also sits above the proof row, so the page
 * twitched on every search. `busy` existed but only covered navigation, so it
 * could not help. A search is now only empty once a request has come back
 * empty, which is a different question from "we have not asked yet".
 */
export default function Search({ autoFocus = false }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState([]);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState(-1);
  const [busy, setBusy] = useState(false);
  /* Distinct from `busy`, which means "we are navigating away". This means
     "a request is in flight", and it is what stops an empty result set from
     being reported before anything has been asked. */
  const [seeking, setSeeking] = useState(false);
  /* Whether the CURRENT term has been answered. Not derivable from sugg.length:
     an empty array means both "no matches" and "not asked yet". */
  const [answered, setAnswered] = useState('');

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setSugg([]); setSeeking(false); setAnswered(''); return; }
    setSeeking(true);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}&limit=8`, { signal: ctl.signal })
        .then(r => r.json()).then(d => {
          const results = d.results || [];
          setSugg(results); setAi(-1); setSeeking(false); setAnswered(term);
          // What people look for — and especially what they fail to find — is the
          // most useful thing this site can tell him.
          track(results.length ? EVENTS.SEARCH : EVENTS.SEARCH_EMPTY,
                results.length ? { q: term, n: results.length } : { q: term });
        })
        // An aborted request is a superseded keystroke, not a failure — leave
        // `seeking` true so the next one owns it. A real failure clears it, or
        // the box would say "searching" for ever.
        .catch(e => { if (e.name !== 'AbortError') { setSeeking(false); setAnswered(term); } });
    }, 140);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const go = href => {
    setBusy(true); setOpen(false);
    track(EVENTS.SEARCH_PICK, { q: q.trim(), href });
    router.push(href);
  };

  function key(e) {
    if (!sugg.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAi(i => (i + 1) % sugg.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAi(i => (i <= 0 ? sugg.length : i) - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(sugg[ai < 0 ? 0 : ai].href); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <>
      <div className="sbox">
        <input type="text" value={q} autoComplete="off" spellCheck="false" autoFocus={autoFocus}
          placeholder="406 Ang Mo Kio · The Sail · Dairy Farm"
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={key}
          role="combobox" aria-expanded={open && sugg.length > 0}
          aria-controls="sug" aria-autocomplete="list" aria-label="Search a block or project"
          aria-activedescendant={open && ai >= 0 && sugg[ai] ? `sug-${ai}` : undefined} />
        {open && sugg.length > 0 && (
          <ul className="sug" id="sug" role="listbox">
            {sugg.map((s, i) => (
              <li key={s.id} id={`sug-${i}`} role="option" aria-selected={i === ai}
                  className={i === ai ? 'on' : ''}
                  onMouseDown={() => go(s.href)} onMouseEnter={() => setAi(i)}>
                <span className="t">{s.kind === 'HDB' ? 'HDB' : 'PTE'}</span>
                <span className="n">{s.label}</span>
                <span className="s">{s.sub}</span>
                <span className="c mono">{s.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* One live region for the whole control, so a count is announced without
          a visible line appearing and shifting the page underneath it. */}
      <p className="vh" role="status" aria-live="polite">
        {seeking ? 'Searching…'
          : answered && sugg.length ? `${sugg.length} result${sugg.length === 1 ? '' : 's'}. Use the arrow keys to review.`
          : answered ? 'No matches.' : ''}
      </p>

      {/* Only once a request has actually come back empty for THIS term. */}
      {answered === q.trim() && !sugg.length && !seeking && !busy && (
        <p className="hint" style={{marginTop:8}}>Nothing matching that. Try the block number on its own, or the street.</p>
      )}
    </>
  );
}
