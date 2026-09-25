'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon.jsx';
import { findTools } from '../lib/nav.js';

/**
 * Type what you are trying to work out; the tool that answers it comes up.
 * The same matcher as the header search (lib/nav.js findTools), so "ABSD",
 * "rent" or "when can I sell" find the same tool in both places.
 */
export default function ToolFinder() {
  const [q, setQ] = useState('');
  const hits = useMemo(() => findTools(q, 4), [q]);
  return (
    <div className="toolfinder">
      <label className="toolfinder-box">
        <Icon name="search" size={20} />
        <input value={q} onChange={e => setQ(e.target.value)} type="search" autoComplete="off"
          placeholder="What are you trying to work out? Try “stamp duty”, “rent” or “when can I sell”"
          aria-label="Find a tool" />
      </label>
      {q.trim() && (
        <ul className="toolfinder-hits" aria-live="polite">
          {hits.length ? hits.map(t => (
            <li key={t.href}><Link href={t.href.includes('?calc=') ? `${t.href}#quick` : t.href}>
              <Icon name={t.icon} size={19} /><b>{t.name}</b><span>{t.note}</span></Link></li>
          )) : <li className="toolfinder-none">No tool by that name. The four groups below hold everything.</li>}
        </ul>
      )}
    </div>
  );
}
