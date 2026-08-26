import { projects, getIndex } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import ProjectBrowse from '../../components/ProjectBrowse.jsx';

const NS = 'landed';

export const metadata = {
  title: 'Landed property prices by street — Singapore | Truestorey',
  description: 'Filed landed transactions by street, from the URA Data Service. URA does not name landed projects, so landed is addressed by street.',
  alternates: { canonical: '/landed' },
};

export default function Page() {
  const list = projects(NS);
  const i = getIndex();
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Landed, by street"
        sub={`${list.length.toLocaleString('en-SG')} streets with a filed transaction since ${i.private?.period?.from ?? ''}, grouped by district.`} />
      <div className="note"><b>Landed is addressed by street, not by project.</b> URA does not publish a
        project name for landed housing, so a street is the finest honest unit available.</div>
      <section className="pane">
        <ProjectBrowse noun="streets"
          items={list.map(p => ({
            slug: p.slug, href: p.href, label: p.label, district: p.district,
            segment: p.segment, n: p.n, medianPsf: p.medianPsf,
          }))} />
        <p className="prov">{i.private?.source} \u00b7 {i.private?.period?.from} to {i.private?.period?.to} \u00b7 accessed {i.private?.accessedAt}</p>
      </section>
    </main>
  );
}
