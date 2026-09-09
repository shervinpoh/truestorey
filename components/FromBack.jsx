'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { safeFrom } from '../lib/fromback.js';

/**
 * Back to the property you opened this from.
 *
 * ── WHY IT IS NEEDED ───────────────────────────────────────────────────────
 * A record page forks into five tools. Two of them carried ?from= and rendered
 * a way back; three did not, so opening Compare or MOP from a block was a
 * one-way trip — the reader had to search for the block again, or use the
 * browser button and lose whatever they had typed into the tool.
 *
 * This is not BackLink. BackLink goes UP the hierarchy and is right for
 * somebody who landed from a search engine. This goes back to a SPECIFIC page
 * the reader came from, and only exists when they actually came from one.
 *
 * ── WHY THE PATH IS VALIDATED ──────────────────────────────────────────────
 * `from` arrives in the URL, which means anyone can put anything in it. An
 * unchecked value would render a link to wherever an attacker chose, on a page
 * carrying a CEA registration number — a phishing hop with this site's name on
 * it. Only a same-origin path to a record is accepted: it must start with a
 * single slash, name one of the three record namespaces, and contain no
 * scheme, host or backslash.
 *
 * ── WHY IT READS THE URL ITSELF ────────────────────────────────────────────
 * useSearchParams would push every tool page that uses this into dynamic
 * rendering. These pages are static and should stay that way; the value is
 * only needed once the browser has it.
 */

export default function FromBack({ label = 'the property' }) {
  const [href, setHref] = useState(null);

  useEffect(() => {
    try {
      setHref(safeFrom(new URLSearchParams(window.location.search).get('from')));
    } catch { /* a URL this browser will not parse leaves the link off */ }
  }, []);

  if (!href) return null;
  return (
    <p style={{ margin: '0 0 14px' }}>
      <Link href={href} className="fromback">&larr; Back to {label}</Link>
    </p>
  );
}
