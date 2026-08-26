import Link from 'next/link';
import { catalogue, hdbIndex, allUrls, archive } from '../lib/data/query.js';
import { allInsights } from '../lib/insights.js';
import Search from '../components/Search.jsx';

export const metadata = { alternates: { canonical: '/' } };

/**
 * The homepage, editorial first.
 *
 * The writing is the reason to come back; a block lookup is something you do
 * once and leave. So the newest piece takes the top of the page at full
 * width, the price index sits beside it as live proof the data is real, and
 * the search box — which used to be the whole homepage — is one line below.
 *
 * Tools, MOP and the calculators are nav items. They are what someone uses
 * after they have a reason to trust the place, not the reason itself.
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

  return (
    <main className="shell wide">
      {lead ? (
        <section className="lede">
          <div className="ledemain">
            <span className="kind deep">{lead.kind === 'deep' ? 'Deep dive' : 'Note'}</span>
            <h1><Link href={lead.href}>{lead.title}</Link></h1>
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
      ) : (
        <header className="mast"><h1>What was actually paid, block by block</h1></header>
      )}

      <section className="pane">
        <div className="sh"><span>Look up any block or project</span>
          <span>{urls.length ? urls.length.toLocaleString('en-SG') : '13,269'} pages</span></div>
        <div style={{ marginTop: 14 }}><Search /></div>
      </section>

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

      <section className="pane">
        <div className="sh"><span>Browse</span></div>
        <ul className="idx">
          <li><Link href="/hdb"><span className="n">HDB, by town</span>
            <span className="s">{cat.hdbTowns?.length} towns, every block with a filed resale</span></Link></li>
          <li><Link href="/condo"><span className="n">Condos and apartments</span>
            <span className="s">By project, grouped by district</span></Link></li>
          <li><Link href="/landed"><span className="n">Landed</span>
            <span className="s">By street — URA does not name landed projects</span></Link></li>
          <li><Link href="/mop"><span className="n">Which flats can start selling</span>
            <span className="s">Blocks reaching their fifth year, by town and year</span></Link></li>
        </ul>
        <p className="prov" style={{ marginTop: 16 }}>
          {cat.hdbSource} · {cat.hdbPeriod?.from} to {cat.hdbPeriod?.to}<br />
          {cat.privateSource} · {cat.privatePeriod?.from} to {cat.privatePeriod?.to}<br />
          Free to use. No sign-up, no account, no cookies.
        </p>
      </section>
    </main>
  );
}
