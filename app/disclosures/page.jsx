import Masthead from '../../components/Masthead.jsx';
import { agent } from '../../lib/agent.js';

export const metadata = {
  title: 'Disclosures — who publishes this, and what it is not',
  description:
    'Truestorey is published by a licensed CEA salesperson. What that means for what appears '
    + 'here, why no single valuation is ever printed, and the regulatory boundary of every figure.',
};

/**
 * The regulatory boundary, in one place, at full length.
 *
 * The compliance particulars stay in the footer of every page — CEA PG 02-11
 * s7.1 requires them there and nothing here replaces that. What this page adds
 * is the reasoning, which was previously spread across notes on a dozen pages
 * and stated fully on none of them.
 */
export default function Page() {
  const a = agent();
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }]}
        title="Disclosures"
        sub="Who publishes this, under what registration, and the limits that follow from it." />

      <section className="pane">
        <h2 className="sh"><span>Who publishes this</span></h2>
        <div className="note">
          <b>{a.name}</b> · CEA Reg. No. {a.cea} · {a.agency} · Licence No. {a.lic}
          <br />
          Everything on this site is published under that registration. It is not an agency
          product, not a portal, and not an independent research house &mdash; it is written by a
          practising salesperson, and the rules below exist because of that rather than in spite
          of it.
        </div>

        <h2 className="sh"><span>This is not a valuation</span></h2>
        <p>
          No single number on this site is an estimate of what a specific home is worth. Not a
          median, not a range, not an index applied to a purchase price. Where a valuation would be
          the natural output, a <b>distribution of what actually sold</b> is published instead,
          with the transactions shown.
        </p>
        <p className="hint">
          A percentile describes filed evidence. A verdict on price does not, and a licensed
          salesperson asserting one about a home they have never seen is a claim nobody can
          substantiate. Formal valuation is separate work by a qualified valuer, and a bank will
          require its own regardless of anything read here.
        </p>

        <h2 className="sh"><span>This is not financial or investment advice</span></h2>
        <p>
          The calculators apply published rates &mdash; stamp duties, LTV and MSR/TDSR ceilings, CPF
          accrued interest, SSD schedules &mdash; to figures you type. They do not know your
          income stability, your other commitments, your family plans or your risk appetite, and
          they do not recommend a course of action. Every rate carries the date it was last
          reviewed; where one has not been re-checked, the page says so rather than presenting it
          as current.
        </p>

        <h2 className="sh"><span>Language you will not find here</span></h2>
        <p className="hint">
          &ldquo;Undervalued&rdquo;, &ldquo;best deal&rdquo;, &ldquo;expert&rdquo;,
          &ldquo;specialist&rdquo;, &ldquo;guaranteed&rdquo;, &ldquo;hot market&rdquo;, and any
          instruction to buy or sell. These are not stylistic preferences: CEA PG 02-11 s3.1
          requires a market claim to be substantiated, and none of them can be. The list is enforced
          in code before anything is published, not left to whoever is writing.
        </p>

        <h2 className="sh"><span>Data licensing</span></h2>
        <ul className="bul">
          <li>Public datasets are used under the Singapore Open Data Licence and the terms of the
            respective agencies, and are attributed on the pages that use them.</li>
          <li><b>REALIS is never used.</b> It is licensed for personal research, not for commercial
            or marketing use (CEA PG 02-11 s6). Where a figure would require it &mdash; a unit
            number against a transaction, for instance &mdash; the figure is not published and the
            page says which granularity the public feed actually carries.</li>
          <li>News reporting is never reproduced. Primary sources are indexed and linked.</li>
        </ul>

        <h2 className="sh"><span>Where the figures can be wrong</span></h2>
        <p className="hint">
          Filed data is filed by someone else. A caveat with an error in it arrives here with that
          error, is not edited on the way through, and cannot be corrected from this side. What can
          be wrong here is a derivation, a name, a coordinate or a match &mdash; and those are worth
          reporting. Recent periods are always incomplete, because transactions are published weeks
          after they are agreed. <a href="/methodology">The methodology page</a> sets out what each
          figure measures and where it stops.
        </p>

        <h2 className="sh"><span>Everything this site declines to do</span></h2>
        <p>
          Fifteen things have been asked for and refused &mdash; a valuation, a launch-price
          projection, a project score, walking times, a shaded school radius &mdash; each with the
          reason and the file that enforces it, at{' '}
          <a href="/refused">what this site will not do</a>.
        </p>
      </section>
    </main>
  );
}
