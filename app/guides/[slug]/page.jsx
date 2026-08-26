import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allGuides, guide } from '../../../lib/guides.js';
import { render } from '../../../lib/md.js';
import { RATES_REVIEWED } from '../../../lib/calc/constants.js';
import Masthead from '../../../components/Masthead.jsx';

export function generateStaticParams() {
  return allGuides().map(g => ({ slug: g.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const g = guide(slug);
  if (!g) return { title: 'Not found — Truestorey' };
  return {
    title: `${g.title} | Truestorey`,
    description: g.blurb,
    alternates: { canonical: g.href },
  };
}

export default async function Page({ params }) {
  const { slug } = await params;
  const g = guide(slug);
  if (!g) notFound();
  const others = allGuides().filter(x => x.slug !== g.slug);

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/guides', label: 'Guides' }]}
        title={g.title} sub={g.blurb} />

      {g.tool && (
        <section className="pane">
          <div className="mapfocus">
            <b>Your own numbers</b>
            <span>The guide explains the rule. The calculator applies it to a price you choose — nothing saved, nothing sent.</span>
            <Link href={g.tool.href}>{g.tool.label} →</Link>
          </div>
        </section>
      )}

      <section className="pane">
        <article className="post guide" dangerouslySetInnerHTML={{ __html: render(g.body) }} />
        <p className="prov">
          Generated {g.generated} from {g.source}, the same research base the decks are built from ·
          rates last reviewed {RATES_REVIEWED}<br />
          General information about how the rules work, not advice on your situation. Figures change
          when policy changes — check the review date above before relying on one.
        </p>
      </section>

      <section className="pane">
        <div className="sh"><span>The other guides</span></div>
        <ul className="idx">
          {others.map(o => (
            <li key={o.slug}>
              <Link href={o.href}><span className="n">{o.title}</span><span className="s">{o.minutes} min</span></Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
