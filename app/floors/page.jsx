import Link from 'next/link';
import { storey } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import FloorView from '../../components/FloorView.jsx';

export const metadata = {
  title: 'What a high floor is actually worth — HDB and condo floor premium | Truestorey',
  description: 'The floor premium measured within the same building, so the estate, the lease and the location cancel out. Every town, every flat type, from filed transactions. Free, no sign-up.',
  alternates: { canonical: '/floors' },
};

export default function Page() {
  const s = storey();
  if (!s) {
    return (
      <main className="shell">
        <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]} title="Tower view" />
        <div className="warn"><p style={{ margin: 0 }}>Not built yet. Run <code>npm run build:storey</code>.</p></div>
      </main>
    );
  }

  // The units map addresses 1,182 individual buildings and belongs on their own
  // pages, not in this page's payload.
  const trimmed = {
    bars: s.bars, cuts: s.cuts, source: s.source,
    hdb: { national: s.hdb.national, groups: s.hdb.groups },
    private: { national: s.private.national, groups: s.private.groups },
  };
  const hdb4 = s.hdb.national['4 ROOM']?.within;

  /* ── THE POOLED FIGURE IS COMPUTED, NOT TYPED ─────────────────────────────
     This paragraph used to open "Pooling the whole country says a high floor is
     worth about 91%" as literal prose, beside a second paragraph whose figure
     was read live. The data says 144.3%. So the page was making a two-sided
     comparison with one side stale by 53 percentage points — and the stale side
     was the one the argument rests on.

     It is the lowest storey band's median psf against the highest, for 4-room
     flats, across the whole country: exactly the naive comparison the section
     exists to reject. Reading it from the same file the rest of the page reads
     means it cannot drift again. */
  const bands = s.hdb.national['4 ROOM']?.bands || [];
  const pooled = bands.length > 1
    ? Math.round((bands[bands.length - 1][2] / bands[0][2] - 1) * 1000) / 10
    : null;

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Tower view"
        sub="What a higher floor is worth, measured by comparing a building with itself rather than with other buildings. Free, and it stays free." />

      <ToolIntro href="/floors" />
      <ToolUse id="floors" />

      <section className="pane">
        <FloorView storey={trimmed} />
      </section>

      <section className="pane">
        <h2 className="sh"><span>Why this is not the number you usually see</span></h2>
        <div className="note">
          <b>Pooling the whole country says a high floor is worth{' '}
          {pooled ? `about ${pooled}%` : 'a great deal more'}.</b> That figure is
          almost entirely wrong. A 4-room flat on the 35th storey is at Pinnacle@Duxton or in
          Bidadari — central, new, and long-leased. Comparing it against every low-floor 4-room in
          Singapore measures the estate, not the storey.
        </div>
        <div className="note">
          <b>Comparing a block with itself says about {hdb4 ? `${hdb4.p50}%` : 'a tenth of that'}.</b>{' '}
          Same building, same lease, same location, same flat model — all of it identical on both
          sides of the ratio, so what is left is closer to the height. That is the figure this page
          leads with, taken across {hdb4 ? hdb4.n.toLocaleString('en-SG') : ''} blocks that have
          enough filed sales high and low to be compared at all.
        </div>
        <div className="note">
          <b>It is not always positive.</b> {hdb4 ? `${hdb4.neg} of those ${hdb4.n.toLocaleString('en-SG')} blocks` : 'Some blocks'}{' '}
          sold higher floors for less per square foot. West-facing afternoon sun, a unit stack facing
          a road, a renovation difference — the reasons vary and this data cannot tell you which. The
          count is published rather than smoothed away, because a tool that only ever returns a
          reassuring number is not measuring anything.
        </div>
        <div className="note">
          <b>No floor number is ever inferred.</b> HDB files &ldquo;10 TO 12&rdquo; and URA files
          &ldquo;11-15&rdquo;. Neither is turned into a storey here, and basement ranges are dropped
          rather than counted as the ground floor.
        </div>
      </section>

      <section className="pane">
        <h2 className="sh"><span>Your own block</span></h2>
        <p className="hint">
          Every block and project page carries this same comparison for that building specifically,
          where it has enough filed sales at both ends.
        </p>
        <ul className="idx">
          <li><Link href="/hdb"><span className="n">Find an HDB block</span><span className="s">By town, then block</span></Link></li>
          <li><Link href="/condo"><span className="n">Find a project</span><span className="s">By district, then project</span></Link></li>
          <li><Link href="/tools"><span className="n">The calculators</span><span className="s">What you would net, what you can borrow, stamp duty</span></Link></li>
        </ul>
        <p className="prov">
          {s.source.hdb} · accessed {s.source.hdbAccessed}<br />
          {s.source.private} · accessed {s.source.privateAccessed}<br />
          Medians of filed transactions. Not a valuation of any individual home.
        </p>
      </section>
    </main>
  );
}
