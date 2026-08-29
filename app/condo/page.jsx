import { projects, getIndex } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import ProjectBrowse from '../../components/ProjectBrowse.jsx';

const NS = 'condo';

export const metadata = {
  title: 'Condo and apartment prices by project — every project in Singapore | Truestorey',
  description: 'Filed transactions for every private residential project, from the URA Data Service. Median psf, the observed range, and the sales behind them.',
  alternates: { canonical: '/condo' },
};

export default function Page() {
  const list = projects(NS);
  const i = getIndex();
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Private projects"
        sub={`${list.length.toLocaleString('en-SG')} projects with a filed transaction since ${i.private?.period?.from ?? ''}, grouped by district.`} />
      <section className="pane">
        <ProjectBrowse noun="projects"
          items={list.map(p => ({
            slug: p.slug, href: p.href, label: p.label, district: p.district,
            segment: p.segment, n: p.n, medianPsf: p.medianPsf,
          }))} />
        <p className="prov">{i.private?.source} · {i.private?.period?.from} to {i.private?.period?.to} · accessed {i.private?.accessedAt}</p>
      </section>
    </main>
  );
}
