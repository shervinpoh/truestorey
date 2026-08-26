'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/** Typeahead over every block and project. Navigates — it does not set state. */
export default function Search({ autoFocus = false }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState([]);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState(-1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setSugg([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}&limit=8`, { signal: ctl.signal })
        .then(r => r.json()).then(d => {
          const results = d.results || [];
          setSugg(results); setAi(-1);
          // What people look for — and especially what they fail to find — is the
          // most useful thing this site can tell him.
          track(results.length ? EVENTS.SEARCH : EVENTS.SEARCH_EMPTY,
                results.length ? { q: term, n: results.length } : { q: term });
        })
        .catch(() => {});
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
          aria-controls="sug" aria-autocomplete="list" aria-label="Search a block or project" />
        {open && sugg.length > 0 && (
          <ul className="sug" id="sug" role="listbox">
            {sugg.map((s, i) => (
              <li key={s.id} role="option" aria-selected={i === ai} className={i === ai ? 'on' : ''}
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
      {q.trim().length >= 2 && !sugg.length && !busy && (
        <p className="hint" style={{marginTop:8}}>Nothing matching that. Try the block number on its own, or the street.</p>
      )}
    </>
  );
}
