import EditorialImage from '../components/EditorialImage.jsx';
import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { catalogue, hdbIndex, allUrls, allTowns, projects, getIndex, storey, glsAwards, mop } from '../lib/data/query.js';
import { feed } from '../lib/articles.js';
import { SITUATIONS, TOOL_GROUPS } from '../lib/nav.js';
import { ogForHome } from '../lib/og.js';
import Search from '../components/Search.jsx';
import WhoBuilt from '../components/WhoBuilt.jsx';
import IslandDots from '../components/IslandDots.jsx';
import Icon from '../components/Icon.jsx';
import RecentStrip from '../components/RecentStrip.jsx';

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
/* The map's frame and counts, read once. The points themselves are fetched
   by the client from /api/island; the page only needs the box, so its
   aspect ratio is reserved before any script runs (the PriceMap lesson). */
let _frame;
function mapFrame() {
  if (_frame !== undefined) return _frame;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'map.json'), 'utf8'));
    const [s, w, n, e] = m.bbox;
    _frame = { bbox: m.bbox, aspect: `${((e - w) * 1000).toFixed(0)} / ${((n - s) * 1000).toFixed(0)}`, counts: m.counts };
  } catch { _frame = null; }
  return _frame;
}

/* ── SIX TOOLS, NOT SIXTEEN ────────────────────────────────────────────────
   The homepage is a doorway, not a second index (browse-href.test.js holds it
   to that). These are the six questions most visitors arrive with; the other
   ten are one click away in the header and on /tools. */
const FEATURED = ['/blindspot', '/plan', '/cost', '/tools?calc=sell', '/compare', '/land'];
const featured = () => FEATURED.map(h => TOOL_GROUPS.flatMap(g => g.items).find(t => t.href === h)).filter(Boolean);

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
  const num = n => Number(n).toLocaleString('en-SG');
  /* "24 Sep", not "2026-09-24": the long form wrapped onto two lines on a
     phone, and the year is not in doubt on a figure checked daily. */
  const checkedOn = refreshed
    ? new Date(`${refreshed}T00:00:00Z`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    : null;
  const frame = mapFrame();

  /* ── THIS WEEK IN THE RECORDS ─────────────────────────────────────────────
     A reason to come back is something that changed since the last visit.
     Four things the agencies publish on their own schedule, each dated and
     sourced, each a door into the page that holds the rest. */
  const pulse = [];
  if (latest && qoq != null) {
    pulse.push({ label: 'HDB resale price index', href: '/market', fig: String(latest.index ?? latest.value),
      say: `${qoq >= 0 ? 'Up' : 'Down'} ${Math.abs(qoq).toFixed(1)}% on the quarter`, src: `${idx.source} · ${latest.quarter}` });
  }
  const award = glsAwards()?.sites?.find(x => /^Residential/i.test(x.use) && Number.isFinite(x.psmGfaOrGpr));
  if (award) {
    pulse.push({ label: 'Latest land award', href: '/land', fig: award.site,
      say: `S$${Math.round(award.psmGfaOrGpr / 10.7639).toLocaleString('en-SG')} psf ppr${Number.isFinite(award.bids) ? ` · ${award.bids} bid${award.bids === 1 ? '' : 's'}` : ''}`,
      src: `URA Government Land Sales · awarded ${award.award}` });
  }
  const m = mop();
  const thisYear = m?.upcomingByYear?.find(y => y.year === m.generatedForYear);
  if (thisYear) {
    const top = Object.entries(thisYear.towns || {}).sort((a, b) => b[1] - a[1])[0];
    pulse.push({ label: `Flats reaching MOP in ${thisYear.year}`, href: '/mop', fig: num(thisYear.units),
      say: top ? `Most in ${top[0].charAt(0) + top[0].slice(1).toLowerCase()}: ${num(top[1])}` : 'Eligible to sell, not supply',
      src: `${m.source} · ${thisYear.year}` });
  }
  if (posts[0]) {
    pulse.push({ label: 'Newest from the desk', href: posts[0].href, fig: posts[0].title,
      say: posts[0].summary ? posts[0].summary.slice(0, 110) + (posts[0].summary.length > 110 ? '…' : '') : '',
      src: posts[0].date });
  }

  /* ── THE FIRST SCREEN SAID NOTHING ABOUT ANY PROPERTY ─────────────────────
     It opened with "A clearer view of Singapore property" — a sentence any
     portal in this market could print — then a search box, then a count of how
     many rows the site holds. A claim, a piece of homework, and a boast about
     volume. A stranger could read all of it and learn nothing they did not
     already know, which is the whole of the retention problem.

     What replaces it is the site's own strongest finding, and it has to be
     COMPUTED rather than typed. /floors carried "about 91%" as literal prose
     for long enough that the data moved to 144% underneath it; a headline
     figure on the homepage would rot the same way and be seen by more people.

     Why this finding and not another: it is counter to what nearly every buyer
     and agent believes, it is provable from filed sales alone, no listing
     portal can compute it because it needs every sale in a building rather
     than one, and it demonstrates in one sentence what the site is FOR —
     comparing like with like and saying so when the received wisdom does not
     survive it. A spread-within-one-block finding was measured first and
     dropped: the widest was 241%, and it turned out to be two-room flats,
     which makes it an artefact rather than a finding. So was the typical
     cheapest-to-dearest gap inside one block: $68k, $85k or $108k depending
     only on how many sales a block needed to count, because a range grows
     with its sample. A headline whose size is a threshold choice is not one.

     ── IT SHIPPED COMPARING TWO DIFFERENT "HIGH FLOORS" ────────────────────
     The first version read the pooled figure off the band table — floors
     46-48 against floors 1-3 — and set it against `within`, which is floors
     13+ against 1-6. That printed 144% beside 10.5% and called the gap the
     cost of pooling. At the same cuts pooling gives 26.7%. The finding
     survives the correction; the drama did not, and the drama was the part
     a reader would have repeated. Both figures now come from the same cuts,
     and the headline only says "most" while the data says it. */
  const st = storey();
  const s4 = st?.hdb?.national?.['4 ROOM'];
  const floorFinding = s4?.within && s4.spread != null ? {
    pooled: s4.spread,
    within: s4.within.p50,
    neg: s4.within.neg,
    blocks: s4.within.n,
    sales: s4.n,
    mostly: s4.within.p50 < s4.spread / 2,
    cut: st.cuts.hdb, side: st.bars.side,
    source: st.source?.hdb, period: st.source?.period,
  } : null;


  return (
    <main className="shell wide home-atlas">
      <section className="hero">
        <div className="herosay">
          <p className="hero-product lab">Singapore property, openly · free, no account</p>
          <h1>Before you fall for the home,<span>see what the records know.</span></h1>
          <p className="sub">Every filed HDB and private sale in Singapore, block by block. Check an
            asking price against them in two minutes, or look up any address — nothing to sign up for.</p>
          <div className="herosearch">
            <p className="lab">Check a home · start with a block or project</p>
            <Search destination="blindspot" />
            <p className="searchpromise">Blindspot compares the asking price with filed sales and raises the
              lease, resale, land and planning questions worth asking at the viewing.</p>
          </div>
          <dl className="heroproof">
            <div><dt>{num((frame?.counts?.hdb || blocks) + (frame?.counts?.condo || 0) + (frame?.counts?.landed || 0))}</dt><dd>blocks and projects</dd></div>
            <div><dt>{num(hdbSales + privateSales)}</dt><dd>filed sales</dd></div>
            <div><dt>{refreshed ? checkedOn : '—'}</dt><dd>data checked daily</dd></div>
          </dl>
        </div>
        <div className="heromap">
          {frame ? <IslandDots bbox={frame.bbox} aspect={frame.aspect} fallbackCounts={frame.counts} /> : null}
          <Link href="/map" className="heromap-go">Open the full price map <Icon name="arrow" size={15} /></Link>
        </div>
      </section>
      <p className="prov evidence-source">{cat.hdbSource} · {cat.hdbPeriod?.from}–{cat.hdbPeriod?.to}
        {' / '}{cat.privateSource} · {cat.privatePeriod?.from}–{cat.privatePeriod?.to}
        {' · '}<Link href="/methodology">Where the numbers come from</Link></p>

      <RecentStrip />

      <section className="home-section home-tools" aria-labelledby="tools-title">
        <div className="home-section-heading"><div><p className="lab">Free tools · no sign-up</p>
          <h2 id="tools-title">What are you trying to work out?</h2></div>
          <Link href="/tools">All sixteen tools ↗</Link></div>
        <div className="hometools">
          {featured().map(t => (
            <Link key={t.href} href={t.href.includes('?calc=') ? `${t.href}#quick` : t.href} className="hometool">
              <span className="hometool-ico"><Icon name={t.icon} size={26} /></span>
              <b>{t.name}</b><span>{t.note}</span>
            </Link>
          ))}
        </div>
      </section>

      {pulse.length > 0 && (
        <section className="home-section home-pulse" aria-labelledby="pulse-title">
          <div className="home-section-heading"><div><p className="lab">Updated as the agencies publish</p>
            <h2 id="pulse-title">This week in the records</h2></div></div>
          <div className="pulse">
            {pulse.map(c => (
              <Link key={c.label} href={c.href} className="pulsecard">
                <span className="lab">{c.label}</span>
                <b className="pulsecard-fig">{c.fig}</b>
                <span className="pulsecard-say">{c.say}</span>
                <span className="prov">{c.src}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {floorFinding && (
        <section className="home-finding" aria-labelledby="finding-title">
          <div>
            <p className="lab">Original analysis · the proof behind the tool</p>
            <h2 id="finding-title">{floorFinding.mostly
              ? 'Most of a high-floor premium isn’t the height.'
              : 'What a high floor is worth, inside the building.'}</h2>
          </div>
          <div>
            <p>Across Singapore, 4-room flats on floors {floorFinding.cut.hi} and up sold for{' '}
              <b>{floorFinding.pooled}% more</b> per square foot than floors{' '}
              <span style={{ whiteSpace: 'nowrap' }}>1–{floorFinding.cut.lo}</span>. Inside the same block,
              it was <b>{floorFinding.within}%</b>. In {floorFinding.neg} of {floorFinding.blocks} blocks,
              the higher floors sold for less. <Link href="/floors">See how that is measured →</Link></p>
            <p className="prov"><b>Source</b> · {floorFinding.source} ·{' '}
              <span style={{ whiteSpace: 'nowrap' }}>{floorFinding.period?.from}–{floorFinding.period?.to}</span>
              {' · '}median psf · {num(floorFinding.sales)} sales · {floorFinding.blocks} blocks with{' '}
              {floorFinding.side}+ sales at each end</p>
          </div>
        </section>
      )}

      <section className="home-section home-decisions">
        <div className="home-section-heading"><div><p className="lab">Find → read → work out</p>
          <h2>The next step depends on where you are.</h2>
          <p className="section-intro">An address opens the evidence. Your situation decides which numbers
            are useful after that.</p></div><Link href="/tools">Browse every tool ↗</Link></div>
        <div className="decision-grid">
          {SITUATIONS.map((s, i) => (
            <Link href={s.href} className="decision-link" key={s.id}>
              <span className="decision-symbol" aria-hidden="true">0{i + 1}</span>
              <h3>{s.label}</h3><p>{s.sub}</p>
              <ol className="decision-flow">
                {s.flow.map(step => <li key={step}>{step}</li>)}
              </ol>
              <span className="decision-go">Follow this path <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </section>

      <WhoBuilt />

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

    </main>
  );
}
