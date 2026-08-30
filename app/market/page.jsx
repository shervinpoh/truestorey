import Link from 'next/link';
import { hdbIndex, sora, mop, getIndex } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import MarketView from '../../components/MarketView.jsx';

export const metadata = {
  title: 'Singapore property market — HDB resale price index and mortgage rates | Truestorey',
  description: 'Where the HDB resale index actually sits, and what SORA is doing to mortgage rates. Government figures, with the date they were taken. Free, no sign-up.',
  alternates: { canonical: '/market' },
};

export default function Page() {
  const idx = hdbIndex(), rates = sora(), m = mop(), i = getIndex();
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="How the market actually sits"
        sub="Two numbers move everything else: what resale prices are doing, and what borrowing costs. Both here, both sourced, both dated." />
      <section className="pane">
        {/* Four numbers, not the register. This passed `m` whole — 2.6MB of
            HTML, every block back to 1986 serialised twice, so that the supply
            panel could print two totals and a year range. Same bug /mop had. */}
        <MarketView idx={idx} rates={rates}
          mop={m && { totals: m.totals, generatedForYear: m.generatedForYear }} />
        {!idx && !rates && (
          <div className="warn">
            <p style={{marginTop:0}}><b>Market data not downloaded yet.</b> In Terminal:</p>
            <p><code>npm run ingest:index</code> · <code>npm run ingest:sora</code></p>
            <p style={{marginBottom:0}}>The index needs no key. SORA comes from MAS and needs no key either.</p>
          </div>
        )}
        <p className="hint" style={{marginTop:22}}>
          Prices in your own block are the only ones that matter for your decision —{' '}
          <Link href="/hdb">start from your town</Link>, or search from the <Link href="/">front page</Link>.
          What I make of these numbers is in <Link href="/insights">insights</Link>.
        </p>
        <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid var(--line2)'}}>
          {(i.attribution || []).map((a,k)=><span className="lab" key={k} style={{display:'block'}}>{a}</span>)}
        </div>
      </section>
    </main>
  );
}
