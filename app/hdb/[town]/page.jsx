import Link from 'next/link';
import { notFound } from 'next/navigation';
import { town as getTown, allTowns, getIndex } from '../../../lib/data/query.js';
import { insightsForTown } from '../../../lib/insights.js';
import { titleCase } from '../../../lib/name.js';
import Masthead from '../../../components/Masthead.jsx';
import TownTiles from '../../../components/TownTiles.jsx';

export async function generateStaticParams() {
  return allTowns().map(t => ({ town: t.slug }));
}

export async function generateMetadata({ params }) {
  const { town } = await params;
  const t = getTown(town);
  if (!t) return { title: 'Not found — Truestorey' };
  return {
    title: `${t.name} HDB resale prices — all ${t.blocks.length} blocks | Truestorey`,
    description: `${t.n.toLocaleString('en-SG')} filed resale transactions across ${t.blocks.length} blocks in ${t.name}. Median S$${t.medianPsf} psf. Source: HDB via data.gov.sg.`,
    alternates: { canonical: t.href },
  };
}

export default async function Page({ params }) {
  const { town } = await params;
  const t = getTown(town);
  if (!t) notFound();
  const i = getIndex();
  const posts = insightsForTown(town);
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/hdb', label: 'HDB' }]}
        title={titleCase(t.name)}
        sub={`${t.blocks.length} blocks · ${t.n.toLocaleString('en-SG')} filed resale transactions · median $${t.medianPsf} psf`} />

      <section className="pane">
        <div className="figwrap">
          <div>
            <span className="lab">Town median, per square foot</span>
            <div className="big">{t.medianPsf}<small> psf</small></div>
          </div>
          <div className="figside">
            <span className="lab">Across</span>
            <div className="r">{t.blocks.length} blocks<br />{t.n.toLocaleString('en-SG')} filed sales</div>
          </div>
        </div>
        <div className="note"><b>A town median is context, not an answer.</b> It blends every block, floor
          and lease left in {titleCase(t.name)}. Open your own block below for a figure that means something.</div>
      </section>

      <section className="pane">
        <div className="sh"><span>Every block in {titleCase(t.name)}</span><span>{t.blocks.length}</span></div>
        <TownTiles placeholder="Filter by block number or street…"
          items={t.blocks.map(b => ({
            key: b.slug, href: b.href, n: `Blk ${b.block}`, value: b.medianPsf,
            s: `$${b.medianPsf} psf`,
            b: titleCase(b.street),
          }))} />
        <p className="prov">{i.hdb?.source} · {i.hdb?.period?.from} to {i.hdb?.period?.to} · accessed {i.hdb?.accessedAt}</p>
      </section>

      {posts.length > 0 && (
        <section className="pane">
          <div className="sh"><span>Reading on {titleCase(t.name)}</span><span>{posts.length}</span></div>
          <ul className="idx">
            {posts.map(p => (
              <li key={p.slug}>
                <Link href={p.href}>
                  <span className="n">{p.title}</span>
                  <span className="s">{p.date} · {p.minutes} min</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
