import { Suspense } from 'react';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import BlindspotReport from '../../components/BlindspotReport.jsx';
import { CHECKS, totalPossible, RUBRIC_VERSION } from '../../lib/blindspot/rubric.js';
import { configured as mailConfigured } from '../../lib/email.js';

export const metadata = {
  title: 'Blindspot — six checks on a Singapore property, free | Truestorey',
  description: 'Where the asking price sits against filed sales at the address or a transparent nearby cohort, how many flats nearby reach MOP, what land is coming, and what was approved next door. A published rubric, not a model’s opinion.',
  alternates: { canonical: '/blindspot' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Blindspot"
        sub="Six things worth checking before you commit, counted against filed transactions. Free, no sign-up, and the rubric is printed below so you can check the arithmetic." />
      <ToolIntro href="/blindspot" compact />
      <ToolUse id="blindspot" />

      <section className="pane">
        <Suspense fallback={<p className="hint">Loading the checks…</p>}>
          <BlindspotReport canEmail={mailConfigured()} />
        </Suspense>
      </section>

      <details className="pane methoddetails">
        <summary>
          <span><span className="lab">How the points work</span>
            <b>See the exact scoring rubric</b></span>
          <span>Every point is fixed by a published rule. A language model never assigns one.</span>
        </summary>
        <div className="methoddetails-body">
          <p className="hint">
            This is the whole formula. Nothing else contributes to the score. The same inputs
            against the same held records give the same points; a data refresh can change them.
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
        </div>
      </details>

      <section className="pane reading-guide">
        <h2 className="sh"><span>How to read the result</span></h2>
        <dl>
          <div><dt>More points</dt><dd>More to check—not a worse home and not a rating.</dd></div>
          <div><dt>Not measured</dt><dd>Not a pass. A check without enough data scores nothing and is named.</dd></div>
          <div><dt>Price evidence</dt><dd>An observed range with every comparable shown, never a valuation.</dd></div>
          <div><dt>Beyond the data</dt><dd>Condition, renovation, neighbours and the seller&rsquo;s circumstances still need a person.</dd></div>
        </dl>
      </section>

      <section className="pane">
        <h2 className="sh"><span>The rest of the tools</span></h2>
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
