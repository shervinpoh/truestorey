import { shareCard } from '../../lib/og.js';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import Tools from '../../components/Tools.jsx';
import { RATES_REVIEWED } from '../../lib/calc/constants.js';
import { SITUATIONS, TOOL_GROUPS, itemFor } from '../../lib/nav.js';
import Icon from '../../components/Icon.jsx';
import ToolFinder from '../../components/ToolFinder.jsx';

export const metadata = {
  ...shareCard('/tools'),
  title: 'Tools — start from what you are trying to work out | Truestorey',
  description: 'Buying, selling, or checking one specific home. Every calculator and lookup on the site, free, with no sign-up and no locked tier — grouped by the question you actually have.',
  alternates: { canonical: '/tools' },
};

/**
 * The page somebody opens when they do not yet know what they need.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 * It opened on four calculators in tabs and then listed fifteen more
 * tool-shaped links, all at the same level, all named after mechanisms. That
 * is an inventory. Somebody arriving with "I've found a flat, is the price
 * mad?" had to translate their question into this site's vocabulary before
 * the site could help — and the vocabulary is the part they do not have.
 *
 * ── THE CARDS ROUTE ON, THEY DO NOT JUST SIT HERE ──────────────────────────
 * They used to be anchors into this page — /tools#buying and the rest — which
 * meant every item in the Tools menu landed on the same screen, with all three
 * cards already above the fold, so the anchor did not even scroll. Three
 * choices and one outcome; the menu looked broken because it was.
 *
 * Each situation has its own route now (app/tools/[situation]) and this page
 * is the overview. It names the three paths and lets the next page recommend
 * the tools. Showing those recommendations here as well made the overview a
 * second copy of every path it linked to.
 *
 * ── THE FULL INDEX STAYS ───────────────────────────────────────────────────
 * Below, complete, subdued, and still the thing the sitemap and the footer
 * agree with. Nothing here is deleted on taste: NEXT.md §6 says tool use gets
 * measured before any specialist tool is judged, and that has not happened.
 */
/* Dynamic because it reads searchParams — see the note in components/Tools.jsx.
   The alternative was a Suspense fallback that WAS this page's server HTML. */
export default async function Page({ searchParams }) {
  const sp = (await searchParams) || {};
  const asked = Array.isArray(sp.calc) ? sp.calc[0] : (sp.calc ?? null);
  /* ── EVERY TOOL ON THE PAGE, NOT BEHIND IT ───────────────────────────────
     This page opened on three situation cards and two closed drawers, one of
     them holding the whole catalogue, so a visitor who came to /tools to see
     the tools saw none. Shervin, 26 Sep: the useful tools get overlooked, and
     he could not find the one he wanted himself. Now every tool is a card,
     in the same four groups and with the same icons as the header's Tools
     menu, each saying what it answers and what it needs from you. The quick
     calculators are open, and the situations are one line for the reader who
     does not know which question is theirs. */
  const need = href => itemFor(href)?.need;
  return (
    <main className="shell wide toolsdir-page">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Every tool, free"
        sub="Start from the question you actually have. Every answer is free with no email required; longer reports can be emailed after you have read them. Every figure shows the rate it used and when that rate was last checked." />

      <ToolFinder />

      <div className="toolsdir">
        {TOOL_GROUPS.map(g => (
          <section className="toolsdir-group" key={g.label} aria-labelledby={`tg-${g.label}`}>
            <h2 className="sh" id={`tg-${g.label}`}><span>{g.label}</span></h2>
            <div className="toolcards">
              {g.items.map(t => (
                <Link className="toolcard" key={t.href}
                  href={t.href.includes('?calc=') ? `${t.href}#quick` : t.href}>
                  <span className="toolcard-ico"><Icon name={t.icon} size={24} /></span>
                  <h3>{t.name}</h3>
                  <p>{t.note}</p>
                  {need(t.href) && <p className="toolcard-need"><b>You need</b> {need(t.href)}</p>}
                  <span className="toolcard-go">Open <Icon name="arrow" size={15} /></span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* id so a link can land ON the calculator. "When can I sell?" pointed at
          /tools?calc=sell and dropped the reader at the top of this page. */}
      <section className="pane" id="quick">
        <h2 className="sh"><span>Quick answers from one figure</span></h2>
        <p className="lede">Selling dates, borrowing, stamp duty and loan interest. Each has its own
          link, so you can send someone straight to the answer rather than to this page.</p>
        <Tools ratesReviewed={RATES_REVIEWED} asked={asked} />
      </section>

      <section className="pane">
        <h2 className="sh"><span>Not sure which question is yours?</span></h2>
        <p className="lede">Choose the sentence that is true now. Each opens three useful starting points.</p>
        <div className="toolpaths">
          {SITUATIONS.map((s, i) => (
            <Link className="toolpath" href={s.href} key={s.id} id={s.id}>
              <span className="lab">Path 0{i + 1}</span>
              <h3>{s.label}</h3>
              <p>{s.sub}</p>
              <span className="toolpath-flow">{s.flow.join(' → ')}</span>
              <b>Show me where to start <span aria-hidden="true">→</span></b>
            </Link>
          ))}
        </div>
      </section>

      <section className="pane">
        <h2 className="sh"><span>The lookups and reading behind them</span></h2>
        <ul className="idx">
          <li><Link href="/hdb"><span className="n">What a sale would actually net you</span>
            <span className="s">The proceeds waterfall sits on every block page, with your block&apos;s own numbers in it</span></Link></li>
          <li><Link href="/guides"><span className="n">All four guides</span>
            <span className="s">Stamp duties, financing, decoupling, renting — complete, nothing gated</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
