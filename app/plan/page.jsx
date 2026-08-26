import { Suspense } from 'react';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import Planner from '../../components/Planner.jsx';

export const metadata = {
  title: 'Can I afford it — TDSR, downpayment and stamp duty in one answer | Truestorey',
  description: 'One flow: what a bank will lend you, what the LTV allows, the cash floor CPF cannot cover, and BSD and ABSD on top. Free, nothing saved, nothing sent.',
  alternates: { canonical: '/plan' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Can I afford it"
        sub="TDSR, the loan-to-value ceiling, the downpayment, the cash CPF cannot cover, and both stamp duties — as one answer instead of four." />

      <section className="pane">
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <Planner />
        </Suspense>
      </section>

      <section className="pane">
        <div className="note">
          <b>Every step is shown, not just the total.</b> The order matters and each line is
          something you can argue with: what a bank assesses you for is not what the property will
          carry, and the smaller of the two is your loan. Most calculators show one of those and
          call it an answer.
        </div>
        <div className="note">
          <b>The cash floor is the part that catches people.</b> A share of the downpayment must be
          cash and cannot come from CPF, however large the OA balance is. Someone with $400,000 in
          CPF and $20,000 in the bank can still fail to complete.
        </div>
        <div className="note">
          <b>Nothing here is stored or sent.</b> The figures stay in the page. There is no sign-up,
          no email wall and no saved profile, on this or on any tool on this site.
        </div>
      </section>

      <section className="pane">
        <div className="sh"><span>The rest of it</span></div>
        <ul className="idx">
          <li><Link href="/tools"><span className="n">When can I sell · what I would net</span><span className="s">SSD, the timeline, the proceeds waterfall</span></Link></li>
          <li><Link href="/guides/absd-tdsr-ssd"><span className="n">The guide behind these numbers</span><span className="s">What each rule is, and when it bites</span></Link></li>
          <li><Link href="/floors"><span className="n">What a higher floor is worth</span><span className="s">Measured within a building, not across the country</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
