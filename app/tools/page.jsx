import { shareCard } from '../../lib/og.js';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import Tools from '../../components/Tools.jsx';
import { RATES_REVIEWED } from '../../lib/calc/constants.js';
import { SITUATIONS, TOOL_GROUPS } from '../../lib/nav.js';

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
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Tools"
        sub="Start from the question you actually have. Every answer is free with no email required; longer reports can be emailed after you have read them. Every figure shows the rate it used and when that rate was last checked." />

      <section className="pane">
        <h2 className="sh"><span>What are you trying to work out?</span></h2>
        <p className="lede">Choose the sentence that is true now. The next page gives you three
          useful starting points—not the entire catalogue.</p>
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

      {/* id so a link can land ON the calculator. "When can I sell?" pointed at
          /tools?calc=sell and dropped the reader at the top of this page, in
          front of the three situation cards — one of which is the page they had
          just come from. It read as being sent back where they started. */}
      <section className="pane">
        <details className="tooldrawer" id="quick" open={Boolean(asked)}>
          <summary>
            <span><span className="lab">Four short calculators</span>
              <b>Get a quick answer from one figure</b></span>
            <span className="drawersub">Selling dates, borrowing, stamp duty and loan interest</span>
          </summary>
          <div className="tooldrawer-body">
            <p className="lede">
              Each has its own link, so you can send someone straight to the answer rather than
              to this page.
            </p>
            <Tools ratesReviewed={RATES_REVIEWED} asked={asked} />
          </div>
        </details>
      </section>

      {/* Open by default since 26 Sep: a page called Tools that showed no tool
          until you opened a drawer was the one Shervin could not find his way
          around. The quick calculators above stay folded unless asked for. */}
      <section className="pane">
        <details className="tooldrawer" open>
          <summary>
            <span><span className="lab">Complete index</span>
              <b>Browse every tool</b></span>
            <span className="drawersub">The same list as the Tools menu</span>
          </summary>
          {/* The same four runs, names and one-line notes as the Tools menu,
              from the same array. This list was typed out separately and had
              drifted: other names for half the tools, and a floor plan
              description two versions old. */}
          <div className="tooldrawer-body">
            {TOOL_GROUPS.map(g => (
              <div key={g.label}>
                <h3 className="sh" style={{ marginTop: 18 }}><span>{g.label}</span></h3>
                <ul className="idx">
                  {g.items.map(t => (
                    <li key={t.href}><Link href={t.href}><span className="n">{t.name}</span>
                      <span className="s">{t.note}</span></Link></li>
                  ))}
                </ul>
              </div>
            ))}

            <h3 className="sh" style={{ marginTop: 22 }}><span>The lookups behind them</span></h3>
            <ul className="idx">
          <li><Link href="/map"><span className="n">The price map</span>
            <span className="s">Every block and project in Singapore by psf, labelled by town</span></Link></li>
          <li><Link href="/hdb"><span className="n">What a sale would actually net you</span>
            <span className="s">The proceeds waterfall sits on every block page, with your block&apos;s own numbers in it</span></Link></li>
          <li><Link href="/guides"><span className="n">All four guides</span>
            <span className="s">Stamp duties, financing, decoupling, renting — complete, nothing gated</span></Link></li>
            </ul>
          </div>
        </details>
      </section>
    </main>
  );
}
