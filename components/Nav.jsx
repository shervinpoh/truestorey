import Link from 'next/link';
import { NAV, isHere, topLinks } from '../lib/nav.js';

/**
 * The global nav.
 *
 * This exists because search traffic does not land on the homepage — it lands
 * on a block page, deep in the site, and until now every one of those was a
 * dead end. Someone who arrived at Blk 275A had no way to discover the MOP
 * tracker, the market page or anything written. One nav, on every page, is
 * the cheapest fix for that in the whole build.
 *
 * Server component. `here` is the pathname prefix, used for aria-current —
 * which is also what the underline hangs off, so the styling and the
 * accessibility state can never disagree.
 *
 * Two presentations of ONE list, which lives in lib/nav.js and is also what
 * the footer renders. Above 800px it is the flat row it always was. Below, it
 * is a disclosure panel that groups the same links under three headings and,
 * because a panel has room the row never had, names the individual tools
 * instead of hiding them behind /tools.
 *
 * The row used to be `overflow-x:auto` with `scrollbar-width:none`, so at
 * 375px it carried 594px of links inside a 335px box with nothing on screen to
 * say so — no scrollbar, no fade, no chevron. Six of eleven links did not
 * exist for a mobile reader, which on this site is most of them. Tools was the
 * expensive one: every calculator the site is built around sat behind it.
 */
export default function Nav({ here = '' }) {
  // The section you are already in, named on the closed menu. A reader who
  // taps "Menu" and cannot see where they were has lost their place.
  const open = NAV.find(g => g.items.some(i => isHere(i, here)));

  return (
    <nav className="gnav" aria-label="Primary">
      <div className="in">
        <Link href="/" className="mk">True<b>storey</b></Link>

        {/* Desktop: the flat row. */}
        <ul className="navrow">
          {topLinks().map(l => (
            <li key={l.href}>
              <Link href={l.href} className="n"
                aria-current={isHere(l, here) ? 'page' : undefined}>{l.label}</Link>
            </li>
          ))}
        </ul>

        {/* Mobile: the same links, grouped, behind a disclosure.
            Keyed on the pathname so a client-side navigation returns a fresh
            element — otherwise the panel stays open behind the page you just
            opened, because App Router never recreates the node. */}
        <details className="navmenu" key={here}>
          <summary aria-label="Menu">
            <span className="lab">Menu</span>
            {open ? <span className="navwhere">{open.group}</span> : null}
          </summary>
          <div className="navpanel">
            {NAV.map(g => (
              <div className="navgroup" key={g.group}>
                <span className="lab">{g.group}</span>
                <ul>
                  {g.items.map(l => (
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
