import Link from 'next/link';
import { mop, getIndex, boundaries, geoRecords } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import MopView from '../../components/MopView.jsx';
import { titleCase, slug, hdbHref } from '../../lib/name.js';
import { simplify } from '../../lib/geojson.js';

export const metadata = {
  title: 'HDB MOP tracker — which blocks reach their fifth year, by town | Truestorey',
  description: 'Every block approaching the end of its Minimum Occupation Period, named, mapped and dated, with the units behind each. Built on filed resale evidence, not assumed dates.',
  alternates: { canonical: '/mop' },
};

export default function Page() {
  const m = mop();
  const i = getIndex();

  /*
   * THE PAGE USED TO SHIP data/mop.json WHOLE — 2.7MB of HTML for a view that
   * rendered five bars and a list of town totals. Every block of every year
   * back to 1986 was serialised into the document, twice, because App Router
   * puts a server component's props in the RSC payload as well as the markup.
   *
   * What is sent now is the five upcoming years and, for each, the blocks
   * actually reaching their fifth year in them — named, because "TAMPINES ·
   * 12,960 units" is a statistic and "621A Tampines St 61, 140 units, 2026"
   * is the thing a reader can go and look at.
   */
  const view = m ? build(m) : null;

  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="When flats can start selling"
        sub={m
          ? `${m.totals.upcomingBlocks.toLocaleString()} blocks reach their fifth year between ${m.generatedForYear} and ${m.generatedForYear + 4} — ${m.totals.upcomingUnits.toLocaleString()} units that could come to market.`
          : 'Blocks approaching the end of their Minimum Occupation Period, by town and by year.'} />
      <section className="pane">
        {view ? <MopView {...view} /> : (
          <div className="warn">
            <p style={{marginTop:0}}><b>MOP data not downloaded yet.</b> In Terminal:</p>
            <p><code>npm run ingest:hdb</code> then <code>npm run ingest:mop</code></p>
            <p style={{marginBottom:0}}>The HDB ingest has to run first — the tracker cross-references it for filed resales.</p>
          </div>
        )}
        <p className="hint" style={{marginTop:22}}>
          Looking at one block in particular? <Link href="/hdb">Open its town</Link> to see what has actually transacted there,
          or read what this supply means in <Link href="/insights">insights</Link>.
        </p>
        <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid var(--line2)'}}>
          {(i.attribution || []).map((a,k)=><span className="lab" key={k} style={{display:'block'}}>{a}</span>)}
        </div>
      </section>
    </main>
  );
}

/**
 * The five upcoming years, the towns inside them, and every block by name.
 *
 * A COORDINATE IS ATTACHED WHERE ONE EXISTS AND NOWHERE ELSE. All 749 upcoming
 * blocks currently resolve, but the map is built to draw what it has rather
 * than to assume completeness: a block with no coordinate is listed and not
 * plotted, and the caption counts it. Rule 12, and the reason mopCoverage()
 * exists at all — these are the blocks that have never sold, so they are
 * exactly the ones a geocoder walking transaction records used to miss.
 */
function build(m) {
  const geo = geoRecords();
  const from = m.generatedForYear, until = from + 4;

  const towns = [];
  let plotted = 0, unplotted = 0;

  for (const t of Object.values(m.towns)) {
    const list = [];
    const years = [];
    for (const y of Object.values(t.byYear || {})) {
      if (!(y.year >= from && y.year <= until)) continue;
      years.push({ year: y.year, blocks: y.blocks, units: y.units, withResale: y.withResale });
      for (const b of y.list || []) {
        const href = hdbHref(b.town, b.block, b.street);
        const g = geo[href];
        if (g) plotted++; else unplotted++;
        list.push({
          b: b.block,
          s: titleCase(b.street),
          y: b.earliestMop,
          u: b.units,
          r: b.resalesSeen || 0,
          h: href,
          // Five decimal places is about a metre. The map is 1000px wide for a
          // country 50km across, so anything finer than this is two copies of
          // a digit nobody can be shown — the same argument IslandMap makes.
          ...(g ? { la: Number(g.lat.toFixed(5)), lo: Number(g.lon.toFixed(5)) } : {}),
        });
      }
    }
    if (!list.length) continue;
    list.sort((a, b) => a.y - b.y || b.u - a.u || a.b.localeCompare(b.b, 'en', { numeric: true }));
    towns.push({
      town: titleCase(t.town),
      slug: slug(t.town),
      blocks: list.length,
      units: list.reduce((s, b) => s + b.u, 0),
      years: years.sort((a, b) => a.year - b.year),
      list,
    });
  }
  towns.sort((a, b) => b.units - a.units);

  /* The island, simplified harder than the homepage's copy: this map is a
     panel beside a list, never the full width of a screen. */
  const areas = (boundaries().areas || []).map(a => ({
    slug: a.slug,
    rings: a.rings.map(r => simplify(r, 0.0012).map(([lon, lat]) => [+lon.toFixed(4), +lat.toFixed(4)])),
  }));

  return {
    towns, areas,
    years: m.upcomingByYear,
    totals: m.totals,
    source: m.source,
    accessedAt: m.accessedAt,
    caveat: m.caveat,
    generatedForYear: m.generatedForYear,
    coverage: { plotted, unplotted },
  };
}
