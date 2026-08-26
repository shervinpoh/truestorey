import Link from 'next/link';
import { yields } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import YieldView from '../../components/YieldView.jsx';

export const metadata = {
  title: 'Gross rental yields by project and district | Truestorey',
  description: 'Filed rents over filed prices, matched on unit size, project by project. Gross, and clear about it. Free, no sign-up.',
  alternates: { canonical: '/yield' },
};

const pc = v => `${v.toFixed(2)}%`;

export default function Page() {
  const y = yields();

  if (!y) {
    return (
      <main className="shell">
        <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
          title="Rental yields"
          sub="Filed rents over filed prices, matched on unit size." />
        <section className="pane">
          <div className="warn">
            <p style={{ margin: 0 }}>
              <b>Not built yet.</b> This is the one dataset that cannot be produced from the repo
              alone — it needs the URA rental endpoint, which means the access key and a network
              connection. Run <code>npm run ingest:rental</code> and then{' '}
              <code>npm run build:yield</code>.
            </p>
          </div>
          <div className="note">
            <b>The derivation is already written and tested.</b> The size join — matching a rent
            only to sales inside its own published area band — has unit tests against fixtures, so
            the logic is not waiting on the data. Only the data is.
          </div>
        </section>
      </main>
    );
  }

  const districts = Object.entries(y.districts).sort((a, b) => b[1].grossYield - a[1].grossYield);
  const projects = Object.values(y.projects).sort((a, b) => b.grossYield - a.grossYield);

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Rental yields"
        sub={`Gross yield for ${projects.length.toLocaleString('en-SG')} projects — filed rents over filed prices, matched on unit size.`} />

      <section className="pane">
        <YieldView
          projects={projects.map(p => ({ label: p.label, district: p.district, href: p.href, grossYield: p.grossYield, cohorts: p.cohorts }))}
          districts={districts}
          min={y.min} />
      </section>

      <section className="pane">
        <div className="sh"><span>By district</span></div>
        <table className="bandtable">
          <thead><tr><th scope="col">District</th><th scope="col">Gross yield</th><th scope="col">Projects</th></tr></thead>
          <tbody>
            {districts.map(([d, v]) => (
              <tr key={d}>
                <th scope="row" className="mono">D{d}</th>
                <td><span className="barwrap"><span className="bar" style={{ width: `${Math.round((v.grossYield / districts[0][1].grossYield) * 100)}%` }} /></span><span className="mono">{pc(v.grossYield)}</span></td>
                <td className="mono">{v.projects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pane">
        <div className="note">
          <b>This is a gross yield and it is not what you keep.</b> Property tax at the
          non-owner-occupied rate, maintenance, agent fees, insurance and the months a unit sits
          empty all come out of it. Every one of those is in the renting guide with a figure beside
          it. None of them is in this data, so none of them is guessed at here.
        </div>
        <div className="note">
          <b>Rents are matched to sales of the same size only.</b> URA publishes rent against an
          area range and price against an exact area. A three-bedroom&rsquo;s rent over a
          one-bedroom&rsquo;s price is not a yield, so a rent is only ever compared with sales that
          fall inside its own published band, and a project with no overlap produces nothing.
        </div>
        <div className="note">
          <b>Rent psf is carried as a range.</b> The published area is a band, so a single rent per
          square foot would be an invention. Where it appears it appears as two ends.
        </div>
      </section>

      <section className="pane">
        <div className="sh"><span>Where this leads</span></div>
        <ul className="idx">
          <li><Link href="/guides/renting"><span className="n">What a landlord actually carries</span><span className="s">The costs between gross and net</span></Link></li>
          <li><Link href="/plan"><span className="n">What the purchase would cost</span><span className="s">Loan, downpayment, duties</span></Link></li>
        </ul>
        <p className="prov">
          {y.source.rental} · accessed {y.source.rentalAccessed} · periods {(y.source.periods || []).join(', ')}<br />
          {y.source.sales} · accessed {y.source.salesAccessed}<br />
          Gross yield only. Medians of filed records, not a projection of what any unit will earn.
        </p>
      </section>
    </main>
  );
}
