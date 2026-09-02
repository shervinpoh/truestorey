import Link from 'next/link';
import { Suspense } from 'react';
import Masthead from '../../components/Masthead.jsx';
import Tools from '../../components/Tools.jsx';
import { RATES_REVIEWED } from '../../lib/calc/constants.js';
import { SITUATIONS, situationTools } from '../../lib/nav.js';

export const metadata = {
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
 * is the overview: three named cards, three recommendations each, and a way
 * through to the full page for whichever one is true of the reader.
 *
 * ── THE FULL INDEX STAYS ───────────────────────────────────────────────────
 * Below, complete, subdued, and still the thing the sitemap and the footer
 * agree with. Nothing here is deleted on taste: NEXT.md §6 says tool use gets
 * measured before any specialist tool is judged, and that has not happened.
 */
export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Tools"
        sub="Start from the question you actually have. Everything here is free, none of it asks for an email, and every figure shows the rate it used and when that rate was last checked." />

      <section className="pane">
        <h2 className="sh"><span>What are you trying to work out?</span></h2>
        <div className="situations">
          {SITUATIONS.map(s => {
            const sit = situationTools(s.id);
            return (
              <div className="sit" key={s.id} id={s.id}>
                <h3><Link href={s.href}>{s.label}</Link></h3>
                <p className="sitsub">{s.sub}</p>
                <ul className="sitlist">
                  {sit.primaryItems.map(i => (
                    <li key={i.href}>
                      <Link href={i.href}>
                        <span className="n">{i.plain}</span>
                        <span className="s">{i.get}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="sitall"><Link href={s.href}>
                  Everything for {s.label.replace(/^I(&rsquo;|')?m /, '').replace(/^I /, '')} &rarr;
                </Link></p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pane">
        <h2 className="sh"><span>Quick answers</span></h2>
        <p className="lede">
          Four short ones that need a figure and nothing else. Each has its own link, so you can
          send someone straight to the stamp duty answer rather than to this page.
        </p>
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <Tools ratesReviewed={RATES_REVIEWED} />
        </Suspense>
      </section>

      <section className="pane">
        <h2 className="sh"><span>Every tool, in full</span></h2>
        <p className="lede">
          The complete list, including the specialist ones no situation above recommends.
        </p>
        <ul className="idx">
          <li><Link href="/plan"><span className="n">Can I afford it</span>
            <span className="s">TDSR, the LTV ceiling, the downpayment, the cash CPF cannot cover, and both stamp duties — chained, not four separate answers</span></Link></li>
          <li><Link href="/progressive"><span className="n">Buying off the plan</span>
            <span className="s">The nine stages a developer may bill you for, quoted from the Housing Developers Rules, and what your instalment does at each one</span></Link></li>
          <li><Link href="/cost"><span className="n">What owning it actually costs</span>
            <span className="s">Stamp duty, interest, commission and the CPF interest running against your home the whole time — what a sale must clear to return your own money</span></Link></li>
          <li><Link href="/lease"><span className="n">What a lease is worth</span>
            <span className="s">The table the State itself applies to a lease renewal, all ninety-nine years of it, and what one more year of holding costs</span></Link></li>
          <li><Link href="/land"><span className="n">What the land cost</span>
            <span className="s">Every Government Land Sales site awarded since 1993 — the winning tender, the rate, how many bid, and every losing bid where HDB published it</span></Link></li>
          <li><Link href="/compare"><span className="n">Compare</span>
            <span className="s">Two or three blocks side by side, in a link you can send</span></Link></li>
          <li><Link href="/blindspot"><span className="n">Blindspot — four checks</span>
            <span className="s">Where the asking price sits, who else will be selling, what land is coming, what could be built next door. A published rubric, not an opinion</span></Link></li>
          <li><Link href="/floorplan"><span className="n">Read a floor plan</span>
            <span className="s">Layout efficiency, what the plan shows about light, and the wall questions for your ID and a QP. Nothing stored</span></Link></li>
          <li><Link href="/neighbourhood"><span className="n">What has been announced nearby</span>
            <span className="s">Live retrieval on any town or project, every claim linked to its source</span></Link></li>
          <li><Link href="/floors"><span className="n">What a higher floor is worth</span>
            <span className="s">Measured within a building, not across the country</span></Link></li>
          <li><Link href="/yield"><span className="n">Rental yields</span>
            <span className="s">Filed rents over filed prices, matched on unit size. Gross, and clear about it</span></Link></li>
        </ul>

        <div className="sh" style={{ marginTop: 22 }}><span>And the lookups behind them</span></div>
        <ul className="idx">
          <li><Link href="/map"><span className="n">The price map</span>
            <span className="s">Every block and project in Singapore by psf, labelled by town</span></Link></li>
          <li><Link href="/mop"><span className="n">Which flats can start selling, by town</span>
            <span className="s">The same MOP question, across every block at once</span></Link></li>
          <li><Link href="/hdb"><span className="n">What a sale would actually net you</span>
            <span className="s">The proceeds waterfall sits on every block page, with your block&apos;s own numbers in it</span></Link></li>
          <li><Link href="/guides"><span className="n">All four guides</span>
            <span className="s">Stamp duties, financing, decoupling, renting — complete, nothing gated</span></Link></li>
        </ul>
      </section>

      <section className="pane">
        <div className="note">
          <b>All of it is free, and that is the position rather than an introductory offer.</b> The
          equivalent lookups on the competitor site — the price map, HDB by town, HDB by block,
          condos, landed, transactions and comps — are all behind a paid tier. These are the same
          seven, given away.
        </div>
      </section>
    </main>
  );
}
