import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allInsights, insight, around } from '../../../lib/insights.js';
import { piece } from '../../../lib/articles.js';
import { town as getTown, mop } from '../../../lib/data/query.js';
import { slugify } from '../../../lib/slug.js';
import Masthead from '../../../components/Masthead.jsx';
import Insight from '../../../components/Insight.jsx';
import Gate from '../../../components/Gate.jsx';
import Follow from '../../../components/Follow.jsx';
import { ogForPost } from '../../../lib/og.js';

export async function generateStaticParams() {
  return allInsights().map(p => ({ slug: p.slug }));
}

// The files are prerendered; a pipeline article is rendered the first time
// someone asks for it and cached from then on. That is what lets a piece
// published from /studio appear without a rebuild.
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = insight(slug) || await piece(slug);
  if (!p) return { title: 'Not found — Truestorey' };
  return {
    title: `${p.title} | Truestorey`,
    description: p.summary || undefined,
    alternates: { canonical: p.href },
    openGraph: { type: 'article', publishedTime: p.date, title: p.title, description: p.summary,
      images: [{ url: ogForPost(p), width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', images: [ogForPost(p)] },
  };
}

export default async function Page({ params }) {
  const { slug } = await params;
  // A file first, then the pipeline. generateStaticParams only knows about the
  // files, so a pipeline piece renders on demand and is cached from then on —
  // which is also what lets a freshly published article appear without a build.
  const post = insight(slug) || await piece(slug);
  if (!post) notFound();

  // A town with no filed resale has no page — and that absence is itself the
  // point on a supply post, so say so rather than silently dropping the link.
  const townRefs = post.towns.map(name => ({ name, t: getTown(slugify(name)) }));
  const towns = townRefs.filter(x => x.t).map(x => x.t);

  // Say WHY a town has no page. Usually it is not that owners are sitting tight —
  // it is that nothing there is eligible to be sold yet. Check before implying
  // anything: an estate completed in 2023 cannot have a resale in 2026.
  const m = mop();
  const unlisted = townRefs.filter(x => !x.t).map(({ name }) => {
    const t = m && Object.values(m.towns).find(x => x.town === name.toUpperCase());
    if (!t) return { name, reason: null };
    const years = Object.values(t.byYear).map(y => y.year);
    const earliest = years.length ? Math.min(...years) : null;
    const eligible = years.filter(y => y <= m.generatedForYear).length;
    return { name, reason: eligible === 0 && earliest ? earliest : null };
  });
  const others = allInsights().filter(p => p.slug !== post.slug).slice(0, 4);
  const { newer, older } = around(post.slug);

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/insights', label: 'Insights' }]}
        kicker={post.kind === 'deep' ? `Deep dive · ${post.date}` : `Note · ${post.date}`}
        title={post.title} sub={post.summary || undefined} />
      <section className="pane">
        <p className="prov" style={{marginTop:0}}>
          {post.kind === 'deep' ? `${post.minutes} min read · ` : ''}
          Written by Shervin Poh. Figures are read live from the filed data, so nothing here
          goes stale without the number going with it.
        </p>
        {post.image && (
          <figure className="posthero">
            <img src={post.image} alt={post.imageAlt} width="1200" height="675" />
            {post.imageCredit && <figcaption>{post.imageCredit}</figcaption>}
          </figure>
        )}
        <Insight post={post} />

        {post.tags?.length > 0 && (
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:24}}>
            {post.tags.map(t => <span key={t} className="kind">{t}</span>)}
          </div>
        )}

        {towns.length > 0 && (
          <div style={{marginTop:26,paddingTop:18,borderTop:'1px solid var(--line)'}}>
            <span className="lab" style={{display:'block',marginBottom:8}}>Look at the actual blocks</span>
            <ul className="idx">
              {towns.map(t => (
                <li key={t.slug}>
                  <Link href={t.href}>
                    <span className="n">{t.name}</span>
                    <span className="s mono">{t.blocks.length} blocks · {t.n.toLocaleString('en-SG')} filed resales · ${t.medianPsf} psf median</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unlisted.length > 0 && (
          <div className="note" style={{marginTop:16}}>
            <b>Why {unlisted.length > 1 ? 'these towns have' : `${unlisted[0].name} has`} no resale page</b>
            <ul style={{margin:'8px 0 0',paddingLeft:18}}>
              {unlisted.map(u => (
                <li key={u.name} style={{marginBottom:5}}>
                  <b>{u.name}</b> — {u.reason
                    ? `nothing there is eligible to be sold yet. The earliest block reaches its fifth year in ${u.reason}, so an empty column is expected, not a signal.`
                    : 'no resale transaction filed in the period covered, so there is nothing to show.'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Chronological neighbours, because on a site that publishes short notes
          the next thing you want is usually the one either side in time. */}
      {(newer || older) && (
        <section className="pane">
          <div className="sh"><span>Either side of this one</span></div>
          <ul className="idx">
            {newer && (
              <li><Link href={newer.href}>
                <span className="s">Newer →</span>
                <span className="n">{newer.title}</span>
              </Link></li>
            )}
            {older && (
              <li><Link href={older.href}>
                <span className="s">← Older</span>
                <span className="n">{older.title}</span>
              </Link></li>
            )}
          </ul>
        </section>
      )}

      <section className="pane">
        <Follow />
        <Gate />
      </section>

      {others.length > 0 && (
        <section className="pane">
          <div className="sh"><span>More</span><Link href="/insights">Everything →</Link></div>
          <ul className="feed">
            {others.map(p => (
              <li key={p.slug} className={p.kind === 'deep' ? 'deep' : undefined}>
                <Link href={p.href}>
                  <div className="fmeta">
                    <span className={'kind' + (p.kind === 'deep' ? ' deep' : '')}>
                      {p.kind === 'deep' ? 'Deep dive' : 'Note'}
                    </span>
                    <span className="fdate">{p.date}</span>
                  </div>
                  <p className="ftitle">{p.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
