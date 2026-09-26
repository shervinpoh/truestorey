import { shareCard } from '../../lib/og.js';
import Link from 'next/link';
import { storey } from '../../lib/data/query.js';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import HowWorked from '../../components/HowWorked.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import FloorView from '../../components/FloorView.jsx';

export const metadata = {
  ...shareCard('/floors'),
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
     means it cannot drift again.

     ── AND THEN IT WAS THE WRONG FIGURE, COMPUTED ────────────────────────
     Reading it live fixed the drift and kept the definition: lowest storey
     band against highest, floors 1-3 against 46-48. The paragraph after it
     set that beside `within`, which is floors 1-6 against 13+, and said "a
     tenth of that". Two definitions of a high floor is not a comparison. At
     the same cuts pooling gives 26.7% for 4-room, not 144%, and the argument
     holds at that size — so the figure changed and the argument stayed.
     `spread` is computed in build-storey.mjs with exactly the cuts `within`
     uses, which is the only way the two can sit side by side. */
  const pooled = s.hdb.national['4 ROOM']?.spread ?? null;
  const cut = s.cuts.hdb;
  const mostly = pooled != null && hdb4 && hdb4.p50 < pooled / 2;

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Tower view"
        sub="What a higher floor is worth, measured by comparing a building with itself." />

      <ToolIntro href="/floors" compact />
      <ToolUse id="floors" />

      <section className="pane">
        <FloorView storey={trimmed} />
      </section>

      <section className="pane">
        <div className="note">
          <b>Pooling every 4-room flat in the country says floors {cut.hi} and up are worth{' '}
          {pooled != null ? `about ${pooled}%` : 'noticeably'} more per square foot than floors
          1–{cut.lo}.</b> {mostly ? 'Most of that is not the height.' : 'Part of that is not the height.'}{' '}
          Blocks tall enough to have a {cut.hi}th floor are mostly the newer ones; comparing a block
          with itself says about {hdb4 ? `${hdb4.p50}%` : 'less'}.
        </div>
        <HowWorked title="How a building is compared with itself">
          <p><b>Same building, same lease, same location, same flat model</b> — all of it identical on
            both sides of the ratio, so what is left is closer to the height. It is taken across{' '}
            {hdb4 ? hdb4.n.toLocaleString('en-SG') : ''} blocks with enough filed sales high and low to
            be compared at all, on the same floors as the pooled figure, so the two can be read
            against each other.</p>
          <p><b>It is not always positive.</b> {hdb4 ? `${hdb4.neg} of those ${hdb4.n.toLocaleString('en-SG')} blocks` : 'Some blocks'}{' '}
            sold higher floors for less per square foot — afternoon sun, a stack facing a road, a
            renovation. This data cannot say which, and the count is published rather than smoothed
            away.</p>
          <p><b>No floor number is ever inferred.</b> HDB files &ldquo;10 TO 12&rdquo; and URA files
            &ldquo;11-15&rdquo;. Neither is turned into a storey, and basement ranges are dropped rather
            than counted as the ground floor.</p>
        </HowWorked>
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
