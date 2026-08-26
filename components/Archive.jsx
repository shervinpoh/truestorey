'use client';
import { useMemo, useState } from 'react';

const LABEL = {
  gls: 'GLS & land', index: 'Price indices', hdb: 'HDB', rates: 'Rates',
  data: 'Data releases', policy: 'Policy', other: 'Other',
};

/**
 * The archive, filterable.
 *
 * Every row states a fact and links to where that fact was published. There
 * is no summary written by us beyond what the source itself says, and no
 * entry originates from a news outlet — see data/archive/README.md for why
 * that boundary is where it is.
 */
export default function Archive({ entries = [], counts = {} }) {
  const [tag, setTag] = useState(null);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const tags = useMemo(() => {
    const c = new Map();
    for (const e of entries) c.set(e.tag || 'other', (c.get(e.tag || 'other') || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const shown = useMemo(() => entries.filter(e =>
    (!tag || (e.tag || 'other') === tag) &&
    (!term || (e.title + ' ' + (e.summary || '')).toLowerCase().includes(term))
  ), [entries, tag, term]);

  return (
    <>
      <div className="filt"><input type="search" value={q} placeholder="Search the archive…"
        aria-label="Search the archive" onChange={e => setQ(e.target.value)} /></div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0 0' }}>
        <button className={'kind' + (tag === null ? ' deep' : '')} style={{ cursor: 'pointer', background: 'none' }}
          aria-pressed={tag === null} onClick={() => setTag(null)}>All {entries.length}</button>
        {tags.map(([t, n]) => (
          <button key={t} className={'kind' + (tag === t ? ' deep' : '')} style={{ cursor: 'pointer', background: 'none' }}
            aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{LABEL[t] || t} {n}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="hint" style={{ marginTop: 18 }}>Nothing under that filter.</p>
      ) : (
        <div className="arch">
          {shown.map((e, i) => (
            <div className="arow" key={e.date + e.title + i}>
              <span className="d mono">{e.date}</span>
              <div>
                <div className="t">{e.url
                  ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a>
                  : e.title}</div>
                {e.summary && <div className="s">{e.summary}</div>}
              </div>
              <span className="src">{e.source}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
