import { shareCard } from '../../lib/og.js';
import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import Masthead from '../../components/Masthead.jsx';
import PriceMap from '../../components/PriceMap.jsx';
import IslandRelief from '../../components/IslandRelief.jsx';
import HowWorked from '../../components/HowWorked.jsx';

export const metadata = {
  ...shareCard('/map'),
  title: 'Price map — every block and project in Singapore by psf | Truestorey',
  description: 'All 13,115 HDB blocks and private projects with a filed transaction, plotted by median price per square foot. Free, no sign-up.',
  alternates: { canonical: '/map' },
};

function loadMap() {
  const p = path.join(process.cwd(), 'data', 'map.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* Eleven scalars for the relief's caption. NOT island.json, which is 85KB of
   coordinates — see the note at the top of IslandRelief.jsx. This page is
   static, so the read happens at build and never at request time; it is
   outside the tracer's problem for the same reason. */
function loadRelief() {
  const p = path.join(process.cwd(), 'data', 'render', 'island-meta.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export default function Page() {
  const map = loadMap(), relief = loadRelief();
  if (!map) {
    return (
      <main className="shell">
        <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Price map" />
        <div className="warn"><p style={{ margin: 0 }}>Not built yet. Run <code>npm run build:map</code>.</p></div>
      </main>
    );
  }
  const total = Object.values(map.counts).reduce((a, b) => a + b, 0);
  const unplotted = map.skipped ? (map.skipped.weak || 0) + (map.skipped.noCoord || 0) : 0;

  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Price map"
        sub={`All ${total.toLocaleString('en-SG')} blocks and projects with a filed transaction, by median price per square foot. Hover for the figure, click to open.`} />

      <IslandRelief meta={relief} />

      {/* The relief above links here by id. The generic rule in globals.css
          gives every main section[id] a scroll-margin clearing the sticky nav
          stack, so this needs nothing of its own. */}
      <section className="pane" id="map">
        <PriceMap map={map} />
      </section>

      <section className="pane">
        {/* Counted by scripts/build-map.mjs and carried in map.json. This was a
            sentence with "128" typed into it, true once; on 26 Sep it was 104. */}
        {unplotted > 0 && (
          <div className="note"><b>{unplotted.toLocaleString('en-SG')} records are not plotted.</b> Their
            address could not be placed confidently enough to publish, and a dot in the wrong street
            is worse than none. Their pages still carry every filed sale.</div>
        )}
        <HowWorked title="How this map is drawn, and what it will not draw">
          {/* This said "no tiles, no basemap host" long after OneMap's street
              tiles became a switch on the map itself — test/tiles.test.js had
              already caught the same claim in PriceMap.jsx. */}
          <p><b>The data is drawn here, not by a map service.</b>{' '}
            {map.land
              ? <>The land is {map.land.source}, downloaded once, simplified to about fifteen metres and
                stored in this repo, and drawn by the same canvas pass as the dots. </>
              : <>The island currently draws itself out of the transactions alone. </>}
            OneMap&rsquo;s street tiles load only when you switch them on, underneath and dimmed.</p>
          <p><b>The dots are the data.</b> Where there is housing there are dots; where there is a
            reservoir, an airbase or the water catchment there are none.</p>
          <p><b>Stations, not lines.</b> The source &mdash; {map.source.rail}
            {map.source.railAccessed ? `, accessed ${map.source.railAccessed}` : ''} &mdash; gives a name and a
            coordinate for every station exit and says nothing about which line a station sits on. Drawing
            the lines would mean supplying the network from memory.</p>
          <p><b>No outline is invented.</b> A postal district is not a planning area and no district
            boundary is published, so district names sit at the median of their own projects. Names that
            would overlap are dropped rather than overprinted.</p>
        </HowWorked>
      </section>

      <section className="pane">
        <h2 className="sh"><span>The same data as a list</span></h2>
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
