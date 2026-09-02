import Link from 'next/link';
import { notFound } from 'next/navigation';
import Masthead from '../../../components/Masthead.jsx';
import { SITUATIONS, situationTools } from '../../../lib/nav.js';
import SituationSeen from '../../../components/SituationSeen.jsx';

/**
 * One page per situation somebody is actually in.
 *
 * ── WHY THESE ARE ROUTES AND NOT ANCHORS ───────────────────────────────────
 * They were anchors — /tools#buying, /tools#owning, /tools#checking — into a
 * page that showed all three cards at once. Every item in the Tools menu
 * therefore landed on the same screen, and on a desktop all three cards were
 * already above the fold, so the anchor did not even scroll. Three choices,
 * one outcome: the menu looked broken because it effectively was.
 *
 * That was my departure from the brief, which said selecting a situation
 * should REVEAL its recommendations, and the brief was right. Real routes are
 * the honest version of it: three pages that differ, each with its own title
 * and description, each shareable and each findable on its own. /tools keeps
 * the overview and the full index.
 *
 * The content still comes from lib/nav.js. A situation is defined once and
 * rendered by the menu, the overview and this page, so the three cannot drift.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return SITUATIONS.map(s => ({ situation: s.id }));
}

export async function generateMetadata({ params }) {
  const { situation } = await params;
  const s = SITUATIONS.find(x => x.id === situation);
  if (!s) return { title: 'Not found — Truestorey' };
  return {
    title: `${s.title} | Truestorey`,
    description: `${s.intro} Free, no sign-up, and every figure shows the rate it used and when that rate was last checked.`,
    alternates: { canonical: s.href },
  };
}

export default async function Page({ params }) {
  const { situation } = await params;
  const s = situationTools(situation);
  if (!s) notFound();

  return (
    <main className="shell">
      <Masthead
        crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title={s.label}
        sub={s.sub} />
      <SituationSeen id={s.id} />

      <section className="pane">
        <p className="lede" style={{ maxWidth: '68ch' }}>{s.intro}</p>

        <div className="sh" style={{ marginTop: 22 }}><span>Start here</span></div>
        <ul className="idx">
          {s.primaryItems.map(i => (
            <li key={i.href}>
              <Link href={i.href}>
                <span className="n">{i.plain}</span>
                <span className="s">{i.get}</span>
              </Link>
            </li>
          ))}
        </ul>

        {s.moreItems.length > 0 && (
          <>
            {/* Open on a page dedicated to this situation. It was behind a
                disclosure on the overview because three situations' tails at
                once is a list again; here there is only one. */}
            <div className="sh" style={{ marginTop: 26 }}><span>Also useful here</span></div>
            <ul className="idx">
              {s.moreItems.map(i => (
                <li key={i.href}>
                  <Link href={i.href}>
                    <span className="n">{i.plain || i.label}</span>
                    {i.get && <span className="s">{i.get}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="pane">
        <div className="sh"><span>Not what you are trying to work out?</span></div>
        <ul className="idx">
          {SITUATIONS.filter(o => o.id !== s.id).map(o => (
            <li key={o.id}>
              <Link href={o.href}><span className="n">{o.label}</span><span className="s">{o.sub}</span></Link>
            </li>
          ))}
          <li><Link href="/tools"><span className="n">Browse every tool</span>
            <span className="s">All eleven, the four quick answers, and the lookups behind them</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
