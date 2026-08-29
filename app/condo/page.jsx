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
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Private projects"
        sub={`${list.length.toLocaleString('en-SG')} projects with a filed transaction since ${i.private?.period?.from ?? ''}, grouped by district.`} />
      <section className="pane">
        {/* Tuples, and no href — see the header of ProjectBrowse. Every one of
            these 2,980 rows is serialised into the HTML so the browse can
            search without a request, and as objects that was 492KB. */}
        <ProjectBrowse noun="projects" base={`/${NS}/`}
          items={list.map(p => [p.slug, p.label, p.district, p.segment, p.n, p.medianPsf])} />
        <p className="prov">{i.private?.source} · {i.private?.period?.from} to {i.private?.period?.to} · accessed {i.private?.accessedAt}</p>
      </section>
    </main>
  );
}
