import Link from 'next/link';
import { mop, getIndex } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import MopView from '../../components/MopView.jsx';

export const metadata = {
  title: 'HDB MOP tracker — which blocks reach their fifth year, by town | Truestorey',
  description: 'Blocks approaching the end of their Minimum Occupation Period, by town and by year, with the units behind each. Built on filed resale evidence, not assumed dates.',
  alternates: { canonical: '/mop' },
};

export default function Page() {
  const m = mop();
  const i = getIndex();
  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="When flats can start selling"
        sub={m
          ? `${m.totals.upcomingBlocks.toLocaleString()} blocks reach their fifth year between ${m.generatedForYear} and ${m.generatedForYear + 4} — ${m.totals.upcomingUnits.toLocaleString()} units that could come to market.`
          : 'Blocks approaching the end of their Minimum Occupation Period, by town and by year.'} />
      <section className="pane">
        {m ? <MopView mop={m} /> : (
          <div className="warn">
            <p style={{marginTop:0}}><b>MOP data not downloaded yet.</b> In Terminal:</p>
            <p><code>npm run ingest:hdb</code> then <code>npm run ingest:mop</code></p>
            <p style={{marginBottom:0}}>The HDB ingest has to run first — the tracker cross-references it for filed resales.</p>
          </div>
        )}
        <p className="hint" style={{marginTop:22}}>
          Looking at one block in particular? <Link href="/hdb">Open its town</Link> to see what has actually transacted there,
          or read what this supply means in <Link href="/insights">insights</Link>.
        </p>
        <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid var(--line2)'}}>
          {(i.attribution || []).map((a,k)=><span className="lab" key={k} style={{display:'block'}}>{a}</span>)}
        </div>
      </section>
    </main>
  );
}
