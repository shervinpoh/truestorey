'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { kindOf, remember } from '../lib/recent.js';

/**
 * Notes the home or tool this reader just opened, on their own device, so the
 * header search and the homepage can offer it back (lib/recent.js). Renders
 * nothing. The page's own heading is the label, read after it has rendered,
 * because it is the name the reader saw.
 */
export default function RecentTracker() {
  const path = usePathname();
  useEffect(() => {
    const kind = kindOf(path);
    if (!kind) return;
    const t = setTimeout(() => {
      const h1 = document.querySelector('main h1');
      const label = (h1?.textContent || document.title.split('|')[0]).replace(/\s+/g, ' ').trim();
      remember({ href: path, label, kind });
    }, 400);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}
