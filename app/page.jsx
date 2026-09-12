import EditorialImage from '../components/EditorialImage.jsx';
import { editorialAsset } from '../lib/editorial-assets.js';
import Link from 'next/link';
import { catalogue, hdbIndex, allUrls, archive, allTowns, projects, boundaries, getIndex } from '../lib/data/query.js';
import { feed } from '../lib/articles.js';
import { NAV, SITUATIONS } from '../lib/nav.js';
import { ogForHome } from '../lib/og.js';
import Search from '../components/Search.jsx';
import WhoBuilt from '../components/WhoBuilt.jsx';
import IslandMap from '../components/IslandMap.jsx';

/* The homepage had no og:image, so the link people actually paste into a chat
   shared as a grey rectangle while every block page had a generated card with
   real figures on it. generateMetadata rather than a static object, because
   the card carries the page count and the current index. */
export function generateMetadata() {
  const image = ogForHome({ pages: (allUrls().urls || []).length, index: hdbIndex() });
  return {
    alternates: { canonical: '/' },
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', images: [image] },
  };
}

/**
 * The homepage.
 *
 * IT USED TO OPEN WITH THE ARTICLE. The reasoning was that the writing is the
 * reason to come back and a block lookup is something you do once and leave.
 * That is true about retention and wrong about a first visit. The search box
 * sat below a full-width headline, a standfirst, a byline and a stat card,
 * which on a 375px phone put the one thing this site exists to do about
 * fifteen hundred pixels down — two entire screens behind an opinion piece
 * from someone the reader has no reason to have heard of yet.
 *
 * "Editorial-first" is a rule about what gets published and how figures are
 * treated. It was never meant to be a rule about scroll order.
 *
 * So the order is now: what you can look up, proof that it is real, a picture
 * of the whole island, then the writing, then the tools. Someone who came to
 * check a block can leave in one interaction. Someone deciding whether this
 * place is worth trusting gets the island — thirteen thousand addresses drawn
 * from government boundaries — which argues better than a paragraph can.
 *
 * The island is server-rendered SVG rather than the real map: /map ships about
 * a megabyte of points and the homepage must not be the slowest page.
 */
export default async function Home() {
  const cat = catalogue();
  /* feed(), not allInsights(). The homepage read file-based notes only, so
     every article the pipeline filed — and every desk piece from now on —
     existed on /insights and nowhere a first-time visitor would see it. With
     both file notes currently drafts, the editorial slot was simply empty on
     the most important page of the site.

     feed() merges both and falls back to files alone if the database is down,
     so a Supabase outage costs the writing, not the homepage. */
  const posts = await feed();
  const idx = hdbIndex();
  const arch = archive();
  const urls = allUrls().urls || [];

  if (cat.missing || (!cat.hasHdb && !cat.hasPrivate)) {
    return (
      <main className="shell">
        <header className="mast"><h1>No data yet</h1></header>
        <div className="warn">
          <p style={{ marginTop: 0 }}><b>The datasets have not been downloaded.</b> Stop the server with
            <b> Ctrl&nbsp;+&nbsp;C</b>, then run <code>npm run data:all</code>, then <code>npm run dev</code>.</p>
        </div>
      </main>
    );
  }

  const lead = posts[0];
  const rest = posts.slice(1, 4);
  const pts = (idx?.points || []).slice(-16);
  const vals = pts.map(p => p.index ?? p.value);
  const lo = Math.min(...vals) * 0.985, hi = Math.max(...vals) * 1.005;
  const latest = pts.at(-1);
  const prev = pts.at(-2);
  const qoq = latest && prev ? (((latest.index ?? latest.value) - (prev.index ?? prev.value)) / (prev.index ?? prev.value)) * 100 : null;

  // The trust strip. Every figure here is counted from the datasets in this
  // repo at build, never typed in — a hand-written count is a claim that goes
  // stale silently, and this row is the site's whole argument in four cells.
  const towns = allTowns();
  const hdbSales = towns.reduce((a, t) => a + t.n, 0);
  const privateSales = [...projects('condo'), ...projects('landed')].reduce((a, p) => a + p.n, 0);
  const blocks = towns.reduce((a, t) => a + t.blockCount, 0);
  const refreshed = getIndex().hdb?.accessedAt;

  const allTools = NAV.find(g => g.group === 'Tools').items.filter(i => i.href !== '/tools');
  // The homepage is a route into the product, not a second /tools. Printing
  // every tool here made eleven equal 118px cards before the archive and the
  // rest of the writing, with no clue which six answer the common buyer and
  // owner decisions. `home` is explicit in the shared nav so adding a tool
  // never promotes it here by accident; every tool still lives in the menu,
  // footer, sitemap and the full index.
  const tools = allTools.filter(i => i.home);
  const num = n => n.toLocaleString('en-SG');

  return (
    <main className="shell wide home-atlas">
      <div className="home-edition">
        <span>Singapore property, openly</span>
        <span>Free to use. No account needed.</span>
      </div>
      <section className="hero">
        <div className="herosay">
          <h1>A clearer view of <span>Singapore property.</span></h1>
          <p className="sub">Start with what was actually paid. Explore the transactions,
            understand the costs, and see the source behind every figure.</p>
          <div className="herosearch">
            <h2 className="sh"><span>Find a block or project</span></h2>
            <Search />
            <div className="home-browse">
              <span className="lab">Or explore</span>
              <Link href="/hdb">HDB towns ↗</Link>
              <Link href="/condo">Condominiums ↗</Link>
              <Link href="/landed">Landed homes ↗</Link>
            </div>
          </div>
        </div>
        <div className="heromap">
          <div className="atlas-heading"><span className="lab">The property atlas</span>
            <Link href="/map" aria-label="Explore the full property map">Explore map ↗</Link></div>
          <IslandMap areas={boundaries().areas} towns={towns}
            plotted={urls.length} source={`${cat.hdbSource} · ${cat.hdbPeriod?.from}–${cat.hdbPeriod?.to}`} compact />
        </div>
      </section>

      <div className="home-evidence">
        <div className="evidence-intro"><span className="lab">Public records.</span><b>Open to everyone.</b>
          <Link href="/methodology">Where the numbers come from ↗</Link></div>
        <dl className="proof">
          <div><dt>{num(blocks)}</dt><dd>HDB blocks with a filed resale</dd></div>
          <div><dt>{num(hdbSales + privateSales)}</dt><dd>filed transactions</dd></div>
          <div><dt>{refreshed || '—'}</dt><dd>HDB data · checked daily</dd></div>
        </dl>
        <p className="prov evidence-source">{cat.hdbSource} · {cat.hdbPeriod?.from}–{cat.hdbPeriod?.to}
          {' / '}{cat.privateSource} · {cat.privatePeriod?.from}–{cat.privatePeriod?.to}</p>
      </div>

      <section className="home-section home-decisions">
        <div className="home-section-heading"><div><p className="lab">Your next move</p>
          <h2>Start with your question.</h2></div><Link href="/tools">All {allTools.length} tools ↗</Link></div>
        <div className="decision-grid">
          {SITUATIONS.map((s, i) => (
            <Link href={s.href} className="decision-link" key={s.id}>
              <span className="decision-symbol" aria-hidden="true">{['↗', '⇄', '⌕'][i]}</span>
              <h3>{s.label}</h3><p>{s.sub}</p><span className="decision-go">See where to start <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section home-perspectives">
        <div className="home-section-heading"><div><p className="lab">Look a little closer</p>
          <h2>There’s more to a home than its price.</h2></div><Link href="/guides">Explore the guides ↗</Link></div>
        <div className="perspective-grid">
          {[
            { subject: 'sun', label: 'Light & orientation', title: 'The part a price can’t show.',
              text: 'See what a floor plan shows about light, orientation and layout—and what it leaves out.', href: '/floorplan', cta: 'Read a floor plan' },
            { subject: 'lease', label: 'Time & tenure', title: 'The years that come with the keys.',
              text: 'Explore how remaining tenure changes the published leasehold relativity.', href: '/lease', cta: 'Explore the lease table' },
            { subject: 'land', label: 'Land & supply', title: 'Before a home, there was a tender.',
              text: 'Trace government land awards back to the bids that were actually filed.', href: '/land', cta: 'See the land awards' },
          ].map(p => (
            <article className="perspective" key={p.subject}>
              <Link href={p.href}>
                <EditorialImage post={editorialAsset(p.subject)} className="perspective-image" />
                <div className="perspective-copy"><p className="lab">{p.label}</p><h3>{p.title}</h3>
                  <p>{p.text}</p><span className="perspective-go">{p.cta} <span aria-hidden="true">↗</span></span></div>
              </Link>
            </article>
          ))}
        </div>
        <p className="prov illustration-caption">Truestorey editorial illustrations · conceptual scenes, not actual properties or sites.</p>
      </section>

      {lead && (
        <section className="home-section home-editorial">
          <div className="home-section-heading"><div><p className="lab">From the desk</p>
            <h2>Read beyond the headline.</h2></div><Link href="/insights">All notes & deep dives ↗</Link></div>
          <div className="home-editorial-grid">
            <article className="home-lead">
              <Link href={lead.href}>
                {lead.image && <EditorialImage post={lead} className="home-lead-image" />}
                <div className="fmeta"><span className="kind deep">{lead.kind === 'deep' ? 'Deep dive' : 'Note'}</span><span className="fdate">{lead.date}</span></div>
                <h3>{lead.title}</h3>{lead.summary && <p className="sub">{lead.summary}</p>}
                <span className="home-read">Read the story ↗</span>
              </Link>
            </article>
            <div className="home-news-side">
              {pts.length > 1 && <Link className="home-index" href="/market">
                <span className="lab">HDB Resale Price Index</span>
                <div className="statrow"><span className="statnum">{latest?.index ?? latest?.value}</span>
                  {qoq != null && <span className={'pill ' + (qoq >= 0 ? 'u' : 'd')}>
                    {qoq >= 0 ? '▲' : '▼'} {Math.abs(qoq).toFixed(1)}% QoQ</span>}</div>
                <div className="bars" style={{ height: 66 }}>
                  {pts.map((p, i) => <i key={p.quarter} className={i === pts.length - 1 ? 'last' : ''}
                    style={{ height: (10 + (((p.index ?? p.value) - lo) / (hi - lo)) * 86) + '%' }}
                    title={`${p.quarter} · ${p.index ?? p.value}`} />)}
                </div>
                <div className="axis"><span className="lab">{pts[0].quarter} · {pts[0].index ?? pts[0].value}</span>
                  <span className="lab">{latest?.quarter} · {latest?.index ?? latest?.value}</span></div>
                <p className="prov">{idx.source} · {pts[0].quarter}–{latest?.quarter}<br />Open the market overview ↗</p>
              </Link>}
              {rest.map(p => <article className="home-news-item" key={p.slug}><Link href={p.href}>
                <span className="lab">{p.kind === 'deep' ? 'Deep dive' : 'Note'} · {p.date}</span><h3>{p.title}</h3>
              </Link></article>)}
            </div>
          </div>
        </section>
      )}

      <section className="home-section home-toolbox">
        <div className="home-section-heading"><div><p className="lab">The working tools</p>
          <h2>Make the numbers make sense.</h2></div><Link href="/tools">Browse every tool ↗</Link></div>
        <div className="deck">{tools.map(t => <Link className="deckcard" key={t.href} href={t.href}>
          <span className="n">{t.label}<span aria-hidden="true">↗</span></span><span className="b">{t.blurb}</span>
        </Link>)}</div>
      </section>

      {arch?.entries?.length > 0 && <section className="home-section home-archive">
        <div className="home-section-heading"><div><p className="lab">Policy & data</p><h2>Go straight to the source.</h2></div>
          <Link href="/archive">The full archive ↗</Link></div>
        <div className="arch">{arch.entries.slice(0,3).map((e,i) => <div className="arow" key={e.date+i}>
          <span className="d mono">{e.date}</span><div><div className="t">{e.url
            ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title} ↗</a> : e.title}</div>
            {e.summary && <div className="s">{e.summary}</div>}</div><span className="src">{e.source}</span>
        </div>)}</div>
      </section>}
      <WhoBuilt />
    </main>
  );
}
