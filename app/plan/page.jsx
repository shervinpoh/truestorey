import { shareCard } from '../../lib/og.js';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import Planner from '../../components/Planner.jsx';
import { allTowns, allDistricts, getIndex, budget } from '../../lib/data/query.js';
import { titleCase } from '../../lib/name.js';
import { configured as mailConfigured } from '../../lib/email.js';

export const metadata = {
  ...shareCard('/plan'),
  title: 'Can I afford it — TDSR, downpayment and stamp duty in one answer | Truestorey',
  description: 'One flow: what a bank will lend you, what the LTV allows, the cash floor CPF cannot cover, and BSD and ABSD on top. Free, nothing saved, nothing sent.',
  alternates: { canonical: '/plan' },
};

/* Dynamic because it reads searchParams. See the note at the top of Planner:
   the alternative was a Suspense boundary whose fallback — the word
   "Loading…" — was the entire server HTML of this page. */
export default async function Page({ searchParams }) {
  const sp = (await searchParams) || {};
  const one = v => (Array.isArray(v) ? v[0] : v) ?? null;
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
        key: d.district, href: `/condo?d=${d.district}`, name: d.name,
        medianPrice: d.medianPrice, medianPsf: d.medianPsf,
      })),
    },
    PRIVATE: {
      label: 'district', plural: 'districts', unit: 'home',
      source: i.private?.source, period: i.private?.period,
      note: 'All private residential types together, landed included — a district median is a wide thing.',
      /* ?d= opens that district directly. It linked to /condo flat, so a
         reader who clicked District 2 landed on all twenty-eight and had to
         find it again. */
      items: allDistricts().map(d => ({
        key: d.district, href: `/condo?d=${d.district}`, name: d.name,
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
        sub="The largest loan the rules allow, the cash CPF cannot cover and both stamp duties — as one answer." />
      <ToolIntro href="/plan" example="figures" lean />
      <ToolUse id="plan" />

      <section className="pane">
        <Planner markets={markets} budget={budget()}
          initial={{ price: one(sp.price), type: one(sp.type), from: one(sp.from) }} canEmail={mailConfigured()} />
      </section>

      <section className="pane">
        <h2 className="sh"><span>The rest of it</span></h2>
        <ul className="idx">
          <li><Link href="/tools"><span className="n">When can I sell · what I would net</span><span className="s">SSD, the timeline, the proceeds waterfall</span></Link></li>
          <li><Link href="/guides/absd-tdsr-ssd"><span className="n">The guide behind these numbers</span><span className="s">What each rule is, and when it bites</span></Link></li>
          <li><Link href="/floors"><span className="n">What a higher floor is worth</span><span className="s">Measured within a building, not across the country</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
