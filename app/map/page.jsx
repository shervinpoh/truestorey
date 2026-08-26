import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import Masthead from '../../components/Masthead.jsx';
import PriceMap from '../../components/PriceMap.jsx';

export const metadata = {
  title: 'Price map — every block and project in Singapore by psf | Truestorey',
  description: 'All 13,115 HDB blocks and private projects with a filed transaction, plotted by median price per square foot. Free, no sign-up.',
  alternates: { canonical: '/map' },
};

function loadMap() {
  const p = path.join(process.cwd(), 'data', 'map.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export default function Page() {
  const map = loadMap();
  if (!map) {
    return (
      <main className="shell">
        <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Price map" />
        <div className="warn"><p style={{ margin: 0 }}>Not built yet. Run <code>npm run build:map</code>.</p></div>
      </main>
    );
  }
  const total = Object.values(map.counts).reduce((a, b) => a + b, 0);

  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Price map"
        sub={`All ${total.toLocaleString('en-SG')} blocks and projects with a filed transaction, plotted by median price per square foot. Hover for the figure, click to open. Jump to a town to frame it and dim the rest.`} />

      <section className="pane">
        <PriceMap map={map} />
      </section>

      <section className="pane">
        <div className="note"><b>There is still no map service underneath this.</b> No tiles, no
          basemap host, no mapping library — nothing is fetched from anyone else when this page
          loads. {map.land
            ? <>The land is {map.land.source}, downloaded once, simplified to about fifteen metres and
              stored in this repo as a few hundred kilobytes of coordinates. It is drawn by the same
              canvas pass as the dots.</>
            : <>The island currently draws itself out of the transactions alone. Run{' '}
              <code>npm run ingest:boundaries</code> to add URA&rsquo;s published coastline.</>}</div>
        <div className="note"><b>The dots are still the data.</b> Where there is housing there are
          dots, and where there is a reservoir, an airbase or the water catchment there are none —
          which is why the built-up areas read as solid and the middle of the island does not.</div>
        <div className="note"><b>Stations, not lines.</b> The station marks are optional and off
          until you ask for them. They are stations and not rail lines because the source — {map.source.rail}
          {map.source.railAccessed ? `, accessed ${map.source.railAccessed}` : ''} — gives a name and a
          coordinate for every station exit and says nothing about which line a station sits on. Drawing
          the lines would mean supplying the network from memory, and a rail line in the wrong place over
          real transactions is worse than no rail line at all.</div>
        <div className="note"><b>A town name sits where its housing is.</b> Each label is drawn at the
          median coordinate of that town's own plotted blocks, not at the centre of a boundary — there is
          no boundary file here, and drawing one from memory would be the same mistake as drawing the rail
          lines. Names that would overlap are dropped rather than overprinted, so the map thins out instead
          of turning into a smear of text.</div>
        <div className="note"><b>128 records are missing from this map.</b> They are the ones whose
          address could not be placed confidently enough to publish. They still have their own pages
          with full transaction histories — they just are not plotted, because a dot in the wrong
          street is worse than no dot.</div>
      </section>

      <section className="pane">
        <div className="sh"><span>The same data as a list</span></div>
        <ul className="idx">
          <li><Link href="/hdb"><span className="n">HDB, by town</span>
            <span className="s">{(map.counts.hdb || 0).toLocaleString('en-SG')} blocks</span></Link></li>
          <li><Link href="/condo"><span className="n">Condos and apartments</span>
            <span className="s">{(map.counts.condo || 0).toLocaleString('en-SG')} projects</span></Link></li>
          <li><Link href="/landed"><span className="n">Landed, by street</span>
            <span className="s">{(map.counts.landed || 0).toLocaleString('en-SG')} streets</span></Link></li>
        </ul>
        <p className="prov">
          {map.source.hdb} · {map.source.private}<br />
          {map.source.period?.from} to {map.source.period?.to} · accessed {map.source.accessedAt}<br />
          Coordinates from {map.source.geo}, accessed {map.source.geoAccessed}. Median psf per block or
          project, not a valuation.
        </p>
      </section>
    </main>
  );
}
