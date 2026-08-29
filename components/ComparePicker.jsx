'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { titleCase } from '../lib/name.js';

/**
 * Choosing what to compare, and dropping what you no longer want.
 *
 * The comparison lives entirely in the query string — ?a=&b=&c= of record
 * hrefs — so adding or removing one is a navigation, not a state change. That
 * is the point: this site has no accounts, no cookies and no saved lists, and
 * a comparison you cannot send to the person you are deciding with is half a
 * feature. Nobody buys a flat alone.
 *
 * Three is the cap. Four columns of figures on a phone is a table nobody
 * reads, and the question is almost always between two.
 */
const KEYS = ['a', 'b', 'c'];

export default function ComparePicker({ selected = [] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}&limit=6`, { signal: ctl.signal })
        .then(r => r.json())
        .then(d => setHits(d.results || []))
        .catch(() => {});
    }, 140);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const go = list => {
    const p = new URLSearchParams();
    list.slice(0, 3).forEach((h, idx) => p.set(KEYS[idx], h));
    router.push(`/compare?${p.toString()}`);
  };

  const add = href => {
    if (selected.some(s => s.href === href)) return;
    setQ(''); setHits([]);
    go([...selected.map(s => s.href), href]);
  };
  const drop = href => go(selected.filter(s => s.href !== href).map(s => s.href));

  const full = selected.length >= 3;

  return (
    <>
      {selected.length > 0 && (
        <div className="cmpchips">
          {selected.map(s => (
            <span className="cmpchip" key={s.href}>
              {s.label}
              <button type="button" onClick={() => drop(s.href)}
                aria-label={`Remove ${s.label} from the comparison`}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className="sbox" style={{ marginTop: selected.length ? 14 : 0 }}>
        <label className="filtn" htmlFor="cmp-q">
          {full ? 'Three is the most that fits — remove one to add another'
            : selected.length === 0 ? 'Add a block or project'
            : 'Add another'}
        </label>
        <input id="cmp-q" value={q} disabled={full} autoComplete="off"
          onChange={e => setQ(e.target.value)}
          placeholder="406 Ang Mo Kio · The Sail · Dairy Farm" />
        {hits.length > 0 && (
          <ul className="idx" style={{ marginTop: 8 }}>
            {hits.map(h => (
              <li key={h.href}>
                <button type="button" className="pickrow" onClick={() => add(h.href)}>
                  <span className="n">{titleCase(h.label)}</span>
                  <span className="s mono">{h.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
