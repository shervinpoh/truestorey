import Link from 'next/link';
import { catalogue, hdbIndex, allUrls, archive, allTowns, projects, boundaries, getIndex } from '../lib/data/query.js';
import { allInsights } from '../lib/insights.js';
import { NAV } from '../lib/nav.js';
import Search from '../components/Search.jsx';
import IslandMap from '../components/IslandMap.jsx';

export const metadata = { alternates: { canonical: '/' } };

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
export default function Home() {
  const cat = catalogue();
  const posts = allInsights();
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

  const tools = NAV.find(g => g.group === 'Tools').items.filter(i => i.href !== '/tools');
  const num = n => n.toLocaleString('en-SG');

  return (
    <main className="shell wide">
      <section className="hero">
        <h1>Every block in Singapore, in filed numbers</h1>
        <p className="sub">What was actually paid, by block and by project — with the
          source and the period printed beside it. Free, and there is nothing to sign up to.</p>
        <div className="herosearch">
          <div className="sh"><span>Look up any block or project</span>
            <span>{urls.length ? num(urls.length) : ''} pages</span></div>
          <div style={{ marginTop: 14 }}><Search /></div>
        </div>
      </section>

      <section className="trust" aria-label="What is behind these figures">
        <div><span className="tv">{num(blocks)}</span>
          <span className="lab">HDB blocks with a filed resale</span></div>
        <div><span className="tv">{num(hdbSales + privateSales)}</span>
          <span className="lab">filed transactions behind the figures</span></div>
        <div><span className="tv">{refreshed || '—'}</span>
          <span className="lab">last refreshed, and it refreshes daily</span></div>
        <div><span className="tv">Free</span>
          <span className="lab">no sign-up, no account, no cookies</span></div>
      </section>

      <section className="pane">
        <div className="sh"><span>The whole island</span>
          <Link href="/map">Open the map →</Link></div>
        <IslandMap areas={boundaries().areas} towns={towns}
          plotted={urls.length} source={cat.hdbSource} />
      </section>

      {lead && (
        <section className="lede">
          <div className="ledemain">
            <span className="kind deep">{lead.kind === 'deep' ? 'Deep dive' : 'Note'}</span>
            <h2 className="ledetitle"><Link href={lead.href}>{lead.title}</Link></h2>
            {lead.summary && <p className="sub">{lead.summary}</p>}
            <p className="prov" style={{ marginBottom: 0 }}>
              {process.env.NEXT_PUBLIC_AGENT_NAME || 'Shervin Poh'} · {lead.date}
              {lead.kind === 'deep' ? ` · ${lead.minutes} min` : ''} · built on filed transactions
            </p>
          </div>
          <div className="ledeside">
            {pts.length > 1 && (
              <div className="statcard">
                <span className="lab">HDB Resale Price Index</span>
                <div className="bars" style={{ height: 84, marginTop: 10 }}>
                  {pts.map((p, i) => (
                    <i key={p.quarter} className={i === pts.length - 1 ? 'last' : ''}
                      style={{ height: (10 + (((p.index ?? p.value) - lo) / (hi - lo)) * 86) + '%' }}
                      title={`${p.quarter} · ${p.index ?? p.value}`} />
                  ))}
                </div>
                <div className="statrow">
                  <span className="statnum">{latest?.index ?? latest?.value}</span>
                  {qoq != null && (
                    <span className={'pill ' + (qoq >= 0 ? 'u' : 'd')}>
                      {qoq >= 0 ? '▲' : '▼'} {Math.abs(qoq).toFixed(1)}% QoQ
                    </span>
                  )}
                </div>
                <p className="prov" style={{ margin: '8px 0 0' }}>
                  {latest?.quarter} · {idx.points.length} quarters since {idx.points[0]?.quarter}<br />
                  {idx.source}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="pane">
        <div className="sh"><span>What people work out here</span>
          <Link href="/tools">All tools →</Link></div>
        <div className="deck">
          {tools.map(t => (
            <Link className="deckcard" key={t.href} href={t.href}>
              <span className="n">{t.label}</span>
              <span className="b">{t.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      {arch?.entries?.length > 0 && (
        <section className="pane">
          <div className="sh"><span>Latest from the archive</span>
            <Link href="/archive">All {arch.entries.length} →</Link></div>
          <div className="arch">
            {arch.entries.slice(0, 5).map((e, i) => (
              <div className="arow" key={e.date + i}>
                <span className="d mono">{e.date}</span>
                <div><div className="t">{e.url
                  ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}</div>
                  {e.summary && <div className="s">{e.summary}</div>}</div>
                <span className="src">{e.source}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="pane">
          <div className="sh"><span>More writing</span><Link href="/insights">Everything →</Link></div>
          <ul className="feed">
            {rest.map(p => (
              <li key={p.slug} className={p.kind === 'deep' ? 'deep' : undefined}>
                <Link href={p.href}>
                  {p.image && <img className="fimg" src={p.image} alt={p.imageAlt} loading="lazy" width="1200" height="675" />}
                  <div className="fmeta">
                    <span className={'kind' + (p.kind === 'deep' ? ' deep' : '')}>
                      {p.kind === 'deep' ? 'Deep dive' : 'Note'}</span>
                    <span className="fdate">{p.date}</span>
                  </div>
                  <p className="ftitle">{p.title}</p>
                  {p.summary && <p className="fsum">{p.summary}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="prov">
        {cat.hdbSource} · {cat.hdbPeriod?.from} to {cat.hdbPeriod?.to}<br />
        {cat.privateSource} · {cat.privatePeriod?.from} to {cat.privatePeriod?.to}
      </p>
    </main>
  );
}
