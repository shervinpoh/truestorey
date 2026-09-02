'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NAV, SITUATIONS, isHere } from '../lib/nav.js';
import BackLink from './BackLink.jsx';

/**
 * The global nav.
 *
 * This exists because search traffic does not land on the homepage — it lands
 * on a block page, deep in the site, and until now every one of those was a
 * dead end. Someone who arrived at Blk 275A had no way to discover the MOP
 * tracker, the market page or anything written. One nav, on every page, is
 * the cheapest fix for that in the whole build.
 *
 * ── WHY THIS IS NOT A ROW OF ELEVEN LINKS ANYMORE ──────────────────────────
 * It was, and it had the worst possible property: eleven headings, none of
 * which named a tool. "Tools" was one word among ten others, and behind it sat
 * the six calculators that are the entire argument for this site over a paid
 * competitor. Two of them — the floor-plan reader and the announcements
 * search — were not reachable from ANY page's nav at all; they existed only on
 * /tools, so you had to already know they were there to find them.
 *
 * Eleven headings that hide their contents is the same failure as a menu you
 * cannot see. So: three headings, and the contents are printed, with the one
 * line each that says what it answers. Fewer things to read, and the things
 * worth finding are the ones now visible. About sits inside Read rather than
 * taking a fourth heading — the registration particulars it carries are on
 * every page's footer already, which is where the rule actually wants them.
 *
 * ── AND WHY TOOLS NOW SHOWS THREE SENTENCES INSTEAD OF TWELVE LINKS ────────
 * Printing the contents fixed the wrong half. The tools became visible and
 * stayed unreadable: twelve destinations named after mechanisms, in a panel
 * that had to scroll on an ordinary desktop window, so the last few could not
 * be seen without first discovering that it scrolled. Choosing between
 * "Blindspot", "What the land cost" and "Rental yields" needs you to already
 * know what this site calls things.
 *
 * The Tools group is marked `guided` and renders SITUATIONS instead: which of
 * three sentences is true of the reader, plus a way to browse everything.
 * Four choices, no acronyms, no scrolling. NOTHING IS REMOVED — every route is
 * still in the footer below, in /tools' full index, and in the sitemap, and
 * test/situations.test.js fails if one falls out. A menu is a doorway, not an
 * inventory; the footer is the inventory.
 *
 * The cost is one extra click to /hdb and /map. Both are linked from the
 * homepage, the island, the footer and every breadcrumb, so that click is
 * bought back everywhere it matters — and neither of them was ever the thing
 * people failed to find.
 *
 * Click, not hover. A hover menu cannot be opened by a thumb and cannot be
 * opened by a keyboard, and this one has to work for both.
 *
 * Below 800px it collapses to the same list as a single disclosure panel —
 * see globals.css. The row and the panel render from one array so a link
 * cannot exist in one and not the other.
 */
export default function Nav({ here = '' }) {
  const [open, setOpen] = useState(null);      // group name, or null
  const navRef = useRef(null);

  // Close on Escape and on any click that lands outside the nav. Without the
  // second one a panel stays open behind whatever you were actually reaching
  // for, which is worse than not opening it.
  useEffect(() => {
    if (open == null) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(null); };
    const onDown = e => { if (!navRef.current?.contains(e.target)) setOpen(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  // A navigation closes the menu. App Router keeps the DOM node across a
  // client-side route change, so nothing else would.
  useEffect(() => { setOpen(null); }, [here]);

  const openGroup = NAV.find(g => g.items.some(i => isHere(i, here)));

  return (
    <nav className="gnav" aria-label="Primary" ref={navRef}>
      <div className="in">
        <Link href="/" className="mk">True<b>storey</b></Link>

        {/* One step UP, beside the wordmark, inside the sticky nav — so the
            way out is wherever the reader is rather than 8,500px above them.
            Renders nothing on the homepage. See BackLink.jsx for why this is
            not router.back(). */}
        <BackLink />

        {/* Desktop: three headings, each printing what is inside it. */}
        <ul className="navrow">
          {NAV.map(g => {
            const on = open === g.group;
            return (
              <li key={g.group} className={'navgrp' + (on ? ' on' : '')}>
                <button type="button" className="n" aria-expanded={on}
                  aria-current={openGroup === g && !on ? 'true' : undefined}
                  onClick={() => setOpen(on ? null : g.group)}>
                  {g.group}<i aria-hidden="true">{on ? '−' : '+'}</i>
                </button>
                {on && (
                  <div className="navdrop">
                    {g.guided ? <>
                      {SITUATIONS.map(sit => (
                        <Link key={sit.id} href={`/tools#${sit.id}`}>
                          <b>{sit.label}</b><span>{sit.sub}</span>
                        </Link>
                      ))}
                      <Link href="/tools" className="navall"
                        aria-current={here === '/tools' ? 'page' : undefined}>
                        <b>Browse every tool</b><span>All eleven, and the four quick answers</span>
                      </Link>
                    </> : g.items.map(l => (
                      <Link key={l.href} href={l.href}
                        aria-current={isHere(l, here) ? 'page' : undefined}>
                        <b>{l.panelLabel || l.label}</b>
                        {l.blurb && <span>{l.blurb}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Mobile: the same links, grouped, behind a disclosure.
            Keyed on the pathname so a client-side navigation returns a fresh
            element — otherwise the panel stays open behind the page you just
            opened, because App Router never recreates the node. */}
        <details className="navmenu" key={here}>
          <summary aria-label="Menu">
            <span className="lab">Menu</span>
            {openGroup ? <span className="navwhere">{openGroup.group}</span> : null}
          </summary>
          <div className="navpanel">
            {NAV.map(g => (
              <div className="navgroup" key={g.group}>
                <span className="lab">{g.group}</span>
                <ul>
                  {/* The phone had it worst: eleven uncontextualised tools in
                      one run, where the screen is smallest and a wrong tap
                      costs the most. Same three sentences here. */}
                  {g.guided ? <>
                    {SITUATIONS.map(sit => (
                      <li key={sit.id}><Link href={`/tools#${sit.id}`}>{sit.label}</Link></li>
                    ))}
                    <li><Link href="/tools"
                      aria-current={here === '/tools' ? 'page' : undefined}>Browse every tool</Link></li>
                  </> : g.items.map(l => (
                    <li key={l.href}>
                      <Link href={l.href}
                        aria-current={isHere(l, here) ? 'page' : undefined}>
                        {l.panelLabel || l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </div>
    </nav>
  );
}
