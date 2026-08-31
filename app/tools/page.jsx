import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import Tools from '../../components/Tools.jsx';
import { RATES_REVIEWED } from '../../lib/calc/constants.js';

export const metadata = {
  title: 'Tools — every calculator and every lookup, free | Truestorey',
  description: 'Sell timeline, borrowing capacity, stamp duty, the whole purchase in one flow, the floor premium, rental yields and the price map. All free, no sign-up, no locked tier.',
  alternates: { canonical: '/tools' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Tools"
        sub="Every one of these is free and none of them asks for an email. Every figure shows the rate it used and when that rate was last checked, because a calculator that hides its assumptions is worse than none." />
      <section className="pane">
        <Tools ratesReviewed={RATES_REVIEWED} />
      </section>
      <section className="pane">
        <div className="sh"><span>The whole purchase, in one answer</span></div>
        <ul className="idx">
          <li><Link href="/plan"><span className="n">Can I afford it</span>
            <span className="s">TDSR, the LTV ceiling, the downpayment, the cash CPF cannot cover, and both stamp duties — chained, not four separate answers</span></Link></li>
          {/* Four tools shipped without ever reaching this page. /tools is
              where somebody looks when they do not know what exists, so a tool
              missing from it is a tool that does not exist for them. */}
          <li><Link href="/progressive"><span className="n">Buying off the plan</span>
            <span className="s">The nine stages a developer may bill you for, quoted from the Housing Developers Rules, and what your instalment does at each one</span></Link></li>
        </ul>
      </section>

      <section className="pane">
        <div className="sh"><span>What it is worth over time</span></div>
        <ul className="idx">
          <li><Link href="/lease"><span className="n">What a lease is worth</span>
            <span className="s">The table the State itself applies to a lease renewal, all ninety-nine years of it, and what one more year of holding costs</span></Link></li>
          <li><Link href="/land"><span className="n">What the land cost</span>
            <span className="s">Every Government Land Sales site awarded since 1993 — the winning tender, the rate, how many bid, and every losing bid where HDB published it</span></Link></li>
          <li><Link href="/compare"><span className="n">Compare</span>
            <span className="s">Two or three blocks side by side, in a link you can send</span></Link></li>
        </ul>
      </section>

      <section className="pane">
        <div className="sh"><span>Check a specific property</span></div>
        <ul className="idx">
          <li><Link href="/blindspot"><span className="n">Blindspot — four checks</span>
            <span className="s">Where the asking price sits, who else will be selling, what land is coming, what could be built next door. A published rubric, not an opinion</span></Link></li>
          <li><Link href="/floorplan"><span className="n">Read a floor plan</span>
            <span className="s">Layout efficiency, what the plan shows about light, and the wall questions for your ID and a QP. Nothing stored</span></Link></li>
          <li><Link href="/neighbourhood"><span className="n">What has been announced nearby</span>
            <span className="s">Live retrieval on any town or project, every claim linked to its source</span></Link></li>
        </ul>
      </section>

      <section className="pane">
        <div className="sh"><span>Look it up</span></div>
        <ul className="idx">
          <li><Link href="/floors"><span className="n">What a higher floor is worth</span>
            <span className="s">Measured within a building, not across the country</span></Link></li>
          <li><Link href="/yield"><span className="n">Rental yields</span>
            <span className="s">Filed rents over filed prices, matched on unit size. Gross, and clear about it</span></Link></li>
          <li><Link href="/map"><span className="n">The price map</span>
            <span className="s">Every block and project in Singapore by psf, labelled by town</span></Link></li>
          <li><Link href="/mop"><span className="n">Which flats can start selling, by town</span>
            <span className="s">The same MOP question, across every block at once</span></Link></li>
          <li><Link href="/hdb"><span className="n">What a sale would actually net you</span>
            <span className="s">The proceeds waterfall sits on every block page, with your block&apos;s own numbers in it</span></Link></li>
        </ul>
      </section>

      <section className="pane">
        <div className="note">
          <b>All of it is free, and that is the position rather than an introductory offer.</b> The
          equivalent lookups on the competitor site — the price map, HDB by town, HDB by block,
          condos, landed, transactions and comps — are all behind a paid tier. These are the same
          seven, given away.
        </div>
        <div className="sh" style={{ marginTop: 20 }}><span>The guides behind the numbers</span></div>
        <ul className="idx">
          <li><Link href="/guides"><span className="n">All four guides</span>
            <span className="s">Stamp duties, financing, decoupling, renting — complete, nothing gated</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
