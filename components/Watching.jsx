'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { remember, watching } from '../lib/watching.js';

/**
 * Records a confirmed watch on this device, and shows what else is on it.
 *
 * Runs after paint and writes one key. Nothing is sent anywhere — see
 * lib/watching.js for why the browser is the only thing that remembers, and
 * why every surface built on it says "on this device" out loud.
 */
export default function Watching({ href }) {
  const [others, setOthers] = useState([]);

  useEffect(() => {
    const all = href ? remember(href) : watching();
    setOthers(all.filter(h => h !== href));
  }, [href]);

  if (!others.length) return null;
  return (
    <p className="hint" style={{ marginTop: 14 }}>
      This device is also watching {others.length} other block{others.length === 1 ? '' : 's'} —{' '}
      <Link href="/watch">see them</Link>. That list is kept in this browser only, so another
      device will not show it.
    </p>
  );
}
