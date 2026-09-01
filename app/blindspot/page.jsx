import { Suspense } from 'react';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import BlindspotReport from '../../components/BlindspotReport.jsx';
import { CHECKS, totalPossible, RUBRIC_VERSION } from '../../lib/blindspot/rubric.js';

export const metadata = {
  title: 'Blindspot — four checks on a Singapore property, free | Truestorey',
  description: 'Where the asking price sits against what has actually sold there, how many flats nearby reach MOP, what land is coming, and what could be built next door. A published rubric, not a model’s opinion.',
  alternates: { canonical: '/blindspot' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Blindspot"
        sub="Four things worth checking before you commit, counted against filed transactions. Free, no sign-up, and the rubric is printed below so you can check the arithmetic." />

      <section className="pane">
        <Suspense fallback={<p className="hint">Loading the checks…</p>}>
          <BlindspotReport />
        </Suspense>
      </section>

      <section className="pane">
        <div className="sh"><span>The rubric</span></div>
        <p className="hint">
          This is the whole formula. Nothing else contributes to the score, and a language model
          never assigns a point — it only writes the paragraph around figures that are already
          fixed. Same inputs, same score, every time.
        </p>
        {/* .tablewrap, not .tw — `.tw` is the town-tile button, which brought a
            tile background and its teal --heat wash along with it. */}
        <div className="tablewrap">
          <table className="bandtable rubric">
            <thead>
              <tr><th scope="col">Check</th><th scope="col">Worth</th><th scope="col">Source</th></tr>
            </thead>
            <tbody>
              {Object.values(CHECKS).map(c => (
                <tr key={c.key}>
                  <th scope="row">{c.title}</th>
                  <td className="mono">up to {c.max}</td>
                  <td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{c.source}</td>
                </tr>
              ))}
              <tr>
                <th scope="row"><b>Everything</b></th>
                <td className="mono"><b>{totalPossible()}</b></td>
                <td>Rubric {RUBRIC_VERSION}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="pane">
        <div className="note">
          <b>Higher means more to check. It is not a rating.</b> A property scoring 2 is not
          &ldquo;better&rdquo; than one scoring 6 — it means fewer of these four specific things
          were flagged. There are plenty of ways for a home to be wrong for you that no public
          dataset can see.
        </div>
        <div className="note">
          <b>A check that cannot run scores nothing, and says so.</b> It is never counted as zero
          risk. If two of the four checks have no data, the score is out of what the other two
          could measure, and the page prints which ones were missing.
        </div>
        <div className="note">
          <b>Nothing here is a valuation.</b> The price check tells you where an asking price sits
          among sales that have actually been filed at that same address — a distribution, not a
          verdict. This site does not publish an opinion of what a home is worth, and will not.
        </div>
        <div className="note">
          <b>Then there is everything public data cannot see.</b> The lease, the CPF position, the
          renovation, the neighbour, the reason the seller is selling. That is the part that needs
          a person, and it is the only thing on this site worth asking for your name.
        </div>
      </section>

      <section className="pane">
        <div className="sh"><span>The rest of the tools</span></div>
        <ul className="idx">
          <li><Link href="/plan"><span className="n">Can I afford it</span><span className="s">Loan, downpayment, the cash CPF cannot cover, both stamp duties</span></Link></li>
          <li><Link href="/floors"><span className="n">What a higher floor is worth</span><span className="s">Measured within a building, not across the country</span></Link></li>
          <li><Link href="/yield"><span className="n">Rental yields</span><span className="s">Filed rents over filed prices, matched on unit size</span></Link></li>
          <li><Link href="/mop"><span className="n">Who else will be selling</span><span className="s">Blocks reaching year five, by town</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
