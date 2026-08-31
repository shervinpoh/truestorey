import Masthead from '../../components/Masthead.jsx';
import LandView from '../../components/LandView.jsx';
import { glsAwards } from '../../lib/data/query.js';

export const metadata = {
  title: 'What developers paid for the land — every awarded GLS site since 1993 | Truestorey',
  description: 'Every Government Land Sales site URA has awarded, with the winning tender, the rate per square metre and the number of bids. The floor under any launch price, published and sourced.',
  alternates: { canonical: '/land' },
};

export default function Page() {
  const d = glsAwards();
  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="What developers paid for the land"
        sub="Every Government Land Sales site URA has awarded since 1993 — the winning tender, the rate, and how many wanted it." />
      <section className="pane">
        {d ? <LandView data={d} /> : (
          <div className="warn">
            <p style={{ marginTop: 0 }}><b>The land sales data has not been downloaded yet.</b> In Terminal:</p>
            <p><code>npm run ingest:gls-awards</code></p>
            <p style={{ marginBottom: 0 }}>It reads one spreadsheet from URA and needs no key.</p>
          </div>
        )}
      </section>
    </main>
  );
}
