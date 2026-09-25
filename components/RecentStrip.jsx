'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon.jsx';
import { readRecent, forget } from '../lib/recent.js';

/**
 * "Pick up where you left off" — the homes and tools this reader opened last,
 * from their own device (lib/recent.js). Renders nothing for a first visit,
 * so a stranger never sees an empty box. Read after mount: the server cannot
 * know, and guessing would flash the wrong thing.
 */
export default function RecentStrip() {
  const [items, setItems] = useState([]);
  useEffect(() => { setItems(readRecent().slice(0, 6)); }, []);
  if (!items.length) return null;
  return (
    <section className="recentstrip" aria-label="Recently viewed on this device">
      <div className="recentstrip-head">
        <span className="lab">Pick up where you left off</span>
        <button type="button" onClick={() => { forget(); setItems([]); }}>Clear</button>
      </div>
      <div className="recentstrip-row">
        {items.map(r => (
          <Link key={r.href} href={r.href} className="recentchip">
            <Icon name={r.kind === 'home' ? 'building' : 'clock'} size={17} />
            <span>{r.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
