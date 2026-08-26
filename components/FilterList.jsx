'use client';
import { useMemo, useState, useId } from 'react';
import Link from 'next/link';

/**
 * An index list you can actually get through.
 *
 * Tampines has 820 blocks. Before this, finding yours meant scrolling all 820
 * — which is not a list, it is a wall. Filtering happens in the browser over
 * an array the page already sent, so there is no request, no spinner and no
 * empty state to design around: you type, rows go away.
 *
 * `items`: { key, href, n, s, group? }  — n is the name, s the sub-line.
 * Groups (districts, regions) survive filtering; a group with nothing left in
 * it disappears rather than sitting there empty.
 */
/*
 * `groupLabel` used to be a function prop. That works fine until a SERVER
 * component renders this one — functions are not serialisable across that
 * boundary, so /condo and /landed returned 500 while /hdb, which passes no
 * groups, was perfectly happy. The label now travels as a string on the item
 * itself, which cannot break the same way.
 */
export default function FilterList({ items = [], placeholder = 'Filter…', autoFocus = false }) {
  const [q, setQ] = useState('');
  const id = useId();
  const term = q.trim().toLowerCase();

  const { groups, count } = useMemo(() => {
    const hit = term
      ? items.filter(it => (it.n + ' ' + (it.s || '')).toLowerCase().includes(term))
      : items;
    const g = new Map();
    for (const it of hit) {
      const k = it.group ?? '';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(it);
    }
    return { groups: [...g.entries()], count: hit.length };
  }, [items, term]);

  return (
    <>
      <div className="filt">
        <input type="search" value={q} autoComplete="off" spellCheck="false" autoFocus={autoFocus}
          placeholder={placeholder} aria-label={placeholder} aria-describedby={id}
          onChange={e => setQ(e.target.value)} />
      </div>
      <span className="filtn" id={id} aria-live="polite">
        {term
          ? `${count.toLocaleString('en-SG')} of ${items.length.toLocaleString('en-SG')}`
          : `${items.length.toLocaleString('en-SG')} total`}
      </span>

      {count === 0 && (
        <p className="hint" style={{ marginTop: 14 }}>
          Nothing matching &ldquo;{q.trim()}&rdquo;. Try a block number on its own, or part of the street name.
        </p>
      )}

      {groups.map(([g, list]) => (
        <div className="reg" key={g || 'all'} id={g ? 'g-' + String(g) : undefined}>
          {g !== '' && <span className="lab" style={{ display: 'block', margin: '18px 0 6px' }}>{list[0]?.groupName || g}</span>}
          <ul className="idx">
            {list.map(it => (
              <li key={it.key}>
                <Link href={it.href}>
                  <span className="n">{it.n}</span>
                  <span className="s">{it.s}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
