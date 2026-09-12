import Link from 'next/link';
import { hdbIndex, sora, mop, getIndex, ppi } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import MarketView from '../../components/MarketView.jsx';

export const metadata = {
  title: 'Singapore property market — HDB resale price index and mortgage rates | Truestorey',
  description: 'Where the HDB resale index actually sits, and what SORA is doing to mortgage rates. Government figures, with the date they were taken. Free, no sign-up.',
  alternates: { canonical: '/market' },
};

export default function Page() {
  const idx = hdbIndex(), rates = sora(), m = mop(), i = getIndex();

  /* ── THE OTHER HALF OF THE PAGE, FINALLY ────────────────────────────────
     NEXT.md has said since 4 Sep that the URA private index data was in and
     the page was not: "/market still shows HDB's index alone, and that is the
     leaving-the-site problem this row was written about."

     Both are on 1Q2009 = 100, which is the whole reason ingest:ppi went to
     SingStat table M212261 rather than rebasing anything here, so they can be
     drawn on one scale without either being adjusted.

     Only the quarters HDB covers are sent. URA's series runs from 1975 and
     HDB's from 1990; aligning to the shorter one keeps the two honest and
     keeps 60 quarters of private-only history out of the payload. */
  const priv = ppi();
  const privBy = new Map((priv?.series?.all?.points || []).map(p => [p.quarter, p.index]));
  const privateSeries = privBy.size
    ? idx.points.map(p => ({ quarter: p.quarter, index: privBy.get(p.quarter) ?? null }))
    : null;
  const privateMeta = privBy.size
    ? { source: priv.source, datasource: priv.datasource, base: priv.base,
        latest: priv.latest, qoq: priv.qoq, yoy: priv.yoy,
        accessedAt: priv.accessedAt, href: priv.href }
    : null;
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="How the market actually sits"
        sub="Two numbers move everything else: what resale prices are doing, and what borrowing costs. Both here, both sourced, both dated." />
      {/* NO PageFigure HERE, and that is the finding rather than an omission.
          MarketView already opens with 202.8 under its own label, so adding
          the block above it printed the same number twice within 200px —
          exactly the redundancy this pass exists to remove, created by the
          pass itself. Caught by looking at the page, not by the build.

          What /market actually needs is its EXISTING headline wrapped in the
          bleed, which lives inside MarketView rather than out here. That is a
          change to the component, not a block added to the route. */}
      <section className="pane">
        {/* Four numbers, not the register. This passed `m` whole — 2.6MB of
            HTML, every block back to 1986 serialised twice, so that the supply
            panel could print two totals and a year range. Same bug /mop had. */}
        <MarketView idx={idx} rates={rates} priv={privateSeries} privMeta={privateMeta}
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
