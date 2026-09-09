import Link from 'next/link';
import { topics } from '../../lib/insights.js';
import { feed } from '../../lib/articles.js';
import { brief } from '../../lib/brief.js';
import MarketStrip from '../../components/MarketStrip.jsx';
import Feed from '../../components/Feed.jsx';
import Follow from '../../components/Follow.jsx';

export const metadata = {
  title: 'Truestorey — Singapore property, in filed numbers',
  description:
    'A property and finance desk for Singapore. Short notes when something moves, longer pieces '
    + 'most weeks, every figure read live from the filed data with its source and period.',
  alternates: { canonical: '/insights' },
};

/**
 * The front page of a desk, not the index of a blog.
 *
 * ── WHAT CHANGED AND WHY ───────────────────────────────────────────────────
 * It was a masthead, a filter, and one chronological list. That is a blog
 * convention and it has a cost: a flat river gives every piece the same
 * weight, so nothing leads, and a reader arriving cold has no idea what kind
 * of publication this is until they have read something.
 *
 * A finance paper solves that in the first two inches. The FT opens on
 * markets; Bloomberg opens on tickers. Neither is decoration — it establishes
 * the register before a word of prose. A property blog cannot do it, because
 * it has no market data of its own.
 *
 * This site has four published indices, an MOP cohort and the last land award,
 * all carrying periods and agencies, already assembled by lib/brief.js for the
 * morning brief and going nowhere but Shervin's phone. They lead now.
 *
 * ── THE HIERARCHY ──────────────────────────────────────────────────────────
 * Lead, two seconds, then the river. Not because more furniture is better, but
 * because an editor choosing what leads is the difference between a
 * publication and an archive. The choice here is made by the data — newest
 * long piece leads — rather than by a field somebody has to remember to set.
 *
 * ── WHEN THERE IS ALMOST NOTHING ───────────────────────────────────────────
 * There are three clean articles today and there will be days with one. A
 * newspaper layout over an empty desk looks broken, so the strip carries the
 * page on its own and each slot below simply does not render. What is left is
 * a market page, which is honest about what the site is on a quiet day.
 */
export default async function Page() {
  const posts = await feed();
  const tops = topics();
  const b = brief();

  const dateLabel = new Date().toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore',
  });

  /* The newest long piece leads; if there is no long piece, the newest
     anything does. feed() is already sorted newest first. */
  const lead = posts.find(p => p.kind === 'deep') || posts[0] || null;
  const rest = posts.filter(p => p.slug !== lead?.slug);
  const seconds = rest.slice(0, 2);
  const river = rest.slice(2);

  return (
    <main className="shell wide">
      <header className="edmast">
        <p className="edkicker mono">Truestorey · a property and finance desk for Singapore</p>
        <h1>Filed numbers, and what they mean</h1>
        <p className="edsub">
          Short notes when something actually moves. Longer pieces most weeks. Every figure is read
          live from the filed data, so nothing here goes stale without the number going with it.
        </p>
      </header>

      <MarketStrip brief={b} dateLabel={dateLabel} />

      {!posts.length ? (
        <section className="pane">
          <div className="note">
            <b>Nothing published yet.</b> The figures above are the desk. Run{' '}
            <code>npm run note</code> to scaffold today&rsquo;s entry from whatever moved, then
            write the two sentences that matter.
          </div>
        </section>
      ) : (
        <>
          <section className="edtop">
            {lead && (
              <article className="edlead">
                <Link href={lead.href}>
                  {lead.image && (
                    <img className="edleadimg" src={lead.image} alt={lead.imageAlt || ''}
                      width="1200" height="675" />
                  )}
                  <span className={'kind' + (lead.kind === 'deep' ? ' deep' : '')}>
                    {lead.kind === 'deep' ? 'Deep dive' : 'Note'}
                  </span>
                  <h2>{lead.title}</h2>
                  {lead.summary && <p className="edsum">{lead.summary}</p>}
                  <p className="edmeta mono">
                    {lead.date}{lead.minutes ? ` · ${lead.minutes} min` : ''}
                  </p>
                </Link>
              </article>
            )}

            {seconds.length > 0 && (
              <div className="edseconds">
                {seconds.map(p => (
                  <article key={p.slug}>
                    <Link href={p.href}>
                      <span className={'kind' + (p.kind === 'deep' ? ' deep' : '')}>
                        {p.kind === 'deep' ? 'Deep dive' : 'Note'}
                      </span>
                      <h3>{p.title}</h3>
                      {p.summary && <p className="edsum">{p.summary}</p>}
                      <p className="edmeta mono">
                        {p.date}{p.minutes ? ` · ${p.minutes} min` : ''}
                      </p>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {river.length > 0 && (
            <section className="pane">
              <h2 className="sh"><span>Everything else</span>
                <span className="mono">{river.length}</span></h2>
              <Feed posts={river} topics={tops} />
            </section>
          )}

          <section className="pane">
            <Follow />
          </section>
        </>
      )}
    </main>
  );
}
