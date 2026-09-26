import { shareCard } from '../../lib/og.js';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import Search from '../../components/Search.jsx';
import { coverage } from '../../lib/massing.js';

export const metadata = {
  ...shareCard('/sun'),
  title: 'Sun on a window — direct sun by month and hour, with the blocks in the way | Truestorey',
  description: 'Pick a block or condo, a floor and the way the window faces. See the minutes of direct sun on that window for every month and hour, and which neighbouring blocks shade it — from HDB’s storey counts and OpenStreetMap.',
  alternates: { canonical: '/sun' },
};

/**
 * The door into Sunward. The tool itself lives on every HDB block and
 * condominium page (components/SunStudy.jsx), where the buildings around that
 * home were cut at build time — so this page is a search that lands there,
 * not a second copy of the tool with a dataset behind an API.
 */
export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Sun on a window"
        sub="How much direct sun one window gets, month by month and hour by hour, with the blocks that stand in the way." />
      <ToolIntro href="/sun" compact />
      <ToolUse id="sun" />
      <section className="pane">
        <span className="lab">Choose the block or condominium</span>
        <Search destination="sun" />
        <p className="hint" style={{ marginTop: 12 }}>It opens on that home&rsquo;s page, at the sun. Pick the floor and the
          way the window faces there.</p>
        {/* Read from the data, so it goes when the last area loads. */}
        {coverage()?.missing > 0 && (
          <p className="note"><b>Some parts of the island are still loading.</b> A home there shows the sunset arc
            only, until its neighbouring buildings are in the model.</p>
        )}
      </section>
      <section className="pane">
        <h2 className="sh"><span>What it can and cannot see</span></h2>
        <ul className="idx">
          <li><span className="n">Heights it trusts</span><span className="s">HDB&rsquo;s own storey count for every HDB block; an OpenStreetMap height where one is tagged</span></li>
          <li><span className="n">Heights it will not guess</span><span className="s">A building with no published height is drawn flat and never blocks the sun — the result counts it instead</span></li>
          <li><span className="n">What it leaves out</span><span className="s">Trees, balconies, ledges and awnings are in no dataset</span></li>
        </ul>
        <p className="hint" style={{ marginTop: 12 }}>Landed streets are not covered: the model is built for a flat&rsquo;s
          window above the street. <Link href="/floors">What a higher floor is worth</Link> is the price side of the same question.</p>
      </section>
    </main>
  );
}
