import { Suspense } from 'react';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import Planner from '../../components/Planner.jsx';
import { allTowns, allDistricts, getIndex, budget } from '../../lib/data/query.js';
import { titleCase } from '../../lib/name.js';

export const metadata = {
  title: 'Can I afford it — TDSR, downpayment and stamp duty in one answer | Truestorey',
  description: 'One flow: what a bank will lend you, what the LTV allows, the cash floor CPF cannot cover, and BSD and ABSD on top. Free, nothing saved, nothing sent.',
  alternates: { canonical: '/plan' },
};

export default function Page() {
  // Read here rather than in Planner: Planner is a client component, and the
  // twenty-six town medians are the whole payload — six fields each, resolved
  // at build because this page is static.
  //
  // Three lists, because the answer to "where is this inside my budget" depends
  // entirely on what you said you were buying. Sending only the towns is what
  // put HDB medians under S$1m beneath a S$5.1m private budget.
  const i = getIndex();
  // Every href is resolved here, as a string. A function cannot cross into a
  // client component — React throws "Functions cannot be passed directly to
  // Client Components" and the whole panel disappears.
  const markets = {
    HDB: {
      label: 'town', plural: 'towns', unit: 'flat',
      source: i.hdb?.source, period: i.hdb?.period,
      items: allTowns().map(t => ({
        key: t.slug, href: `/hdb/${t.slug}`, name: titleCase(t.name),
        medianPrice: t.medianPrice, medianPsf: t.medianPsf,
      })),
    },
    EC: {
      label: 'district', plural: 'districts', unit: 'EC',
      source: i.private?.source, period: i.private?.period,
      note: 'Executive condominiums only — resale and subsale filed with URA. Ten districts have them; the rest were never built with any.',
      items: allDistricts('Executive Condominium').map(d => ({
        key: d.district, href: '/condo', name: d.name,
        medianPrice: d.medianPrice, medianPsf: d.medianPsf,
      })),
    },
    PRIVATE: {
      label: 'district', plural: 'districts', unit: 'home',
      source: i.private?.source, period: i.private?.period,
      note: 'All private residential types together, landed included — a district median is a wide thing.',
      items: allDistricts().map(d => ({
        key: d.district, href: '/condo', name: d.name,
        medianPrice: d.medianPrice, medianPsf: d.medianPsf,
      })),
    },
  };

  return (
    // Wide, because the calculator is two columns now: inputs beside a sticky
    // answer. At 760px the input column came out at 425px, which collapsed the
    // form grid to one field per row and made the page longer, not shorter.
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Can I afford it"
        sub="TDSR, the loan-to-value ceiling, the downpayment, the cash CPF cannot cover, and both stamp duties — as one answer instead of four." />
      <ToolIntro href="/plan" example="figures" />

      <section className="pane">
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <Planner markets={markets} budget={budget()} />
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
