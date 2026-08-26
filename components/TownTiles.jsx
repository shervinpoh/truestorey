'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';

/**
 * Browse without scrolling.
 *
 * The old index page listed every town, then every block, as one continuous
 * column — Tampines alone is 820 rows. Nobody scrolls 820 rows; they leave.
 *
 * A grid fixes two things at once. It fits an entire island of towns on one
 * screen, and shading each tile by median psf means the page reads as a map
 * before it reads as a list: expensive towns are dark, cheap ones are pale,
 * and the shape of that is information you cannot get from a column of text.
 *
 * The filter is still here for anyone who knows what they want. It just is
 * not the only way through any more.
 */
export default function TownTiles({ items = [], placeholder = 'Filter…', unit = 'psf' }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const range = useMemo(() => {
    const v = items.map(i => i.value).filter(Number.isFinite);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
  }, [items]);

  const shown = useMemo(() => (term
    ? items.filter(i => (i.n + ' ' + (i.s || '')).toLowerCase().includes(term))
    : items), [items, term]);

  const heat = v => {
    if (!Number.isFinite(v)) return 0.04;
    const [lo, hi] = range;
    return 0.05 + (hi > lo ? (v - lo) / (hi - lo) : 0) * 0.30;
  };

  return (
    <>
      <div className="filt">
        <input type="search" value={q} placeholder={placeholder} aria-label={placeholder}
          autoComplete="off" spellCheck="false" onChange={e => setQ(e.target.value)} />
      </div>
      <span className="filtn" aria-live="polite">
        {term ? `${shown.length} of ${items.length}` : `${items.length} total · shaded by median ${unit}`}
      </span>

      {shown.length === 0 ? (
        <p className="hint" style={{ marginTop: 16 }}>Nothing matching &ldquo;{q.trim()}&rdquo;.</p>
      ) : (
        <div className="tiles">
          {shown.map(i => (
            <Link key={i.key} href={i.href} className="tile" style={{ '--heat': heat(i.value) }}>
              <span className="n">{i.n}</span>
              <span className="v mono">{i.s}</span>
              {i.b && <span className="b mono">{i.b}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
