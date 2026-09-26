import { shareCard } from '../../lib/og.js';
import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import FloorplanUpload from '../../components/FloorplanUpload.jsx';

export const metadata = {
  ...shareCard('/floorplan'),
  title: 'Floorplan Reader — layout, light and what to ask a QP | Truestorey',
  description: 'Upload a floor plan and get a report on living in that unit: zoning, privacy, light and air, where the bathrooms and laundry sit, a room-by-room table, a viewing checklist and the wall questions for a qualified person. Shareable. Free, nothing stored.',
  alternates: { canonical: '/floorplan' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Floorplan Reader"
        sub="A report on living in the unit, from its plan. Free; the image is discarded once read." />
      <ToolIntro href="/floorplan" compact />
      <ToolUse id="floorplan" />
      <section className="pane">
        <FloorplanUpload />
        <h2 className="sh floorplan-returns"><span>What it returns</span></h2>
        <div className="floorplan-outcomes" aria-label="What the floor plan check returns">
          <div><b>How it lives</b><p>Zoning, privacy, getting around, light and air.</p></div>
          <div><b>Room by room</b><p>Windows, doors, awkward corners — sizes when printed.</p></div>
          <div><b>What to check</b><p>A viewing checklist, and a link to share the report.</p></div>
        </div>
        <p className="floorplan-limit"><b>It does not decide which walls can come down.</b> An image
          cannot replace structural drawings or a qualified person&rsquo;s assessment.</p>
      </section>

      <details className="pane methoddetails">
        <summary>
          <span><span className="lab">Before you upload</span>
            <b>What this can and cannot read</b></span>
          <span>The safeguards behind orientation, wall questions and image handling.</span>
        </summary>
        <div className="methoddetails-body">
          <div className="note">
            <b>Walls become questions, never determinations.</b> Structural drawings and a qualified
            person decide what can be altered. The result only identifies what is worth asking about.
          </div>
          <div className="note">
            <b>Orientation only when the plan shows it.</b> If there is no north arrow, the tool says
            so rather than guessing.
          </div>
          <div className="note">
            <b>Sizes only when printed.</b> A room size is given only if the plan prints one, and
            nothing is measured off the drawing. Most plans print none, and the report says so.
          </div>
          <div className="note">
            <b>Nothing is stored.</b> The image is read in the request and discarded. A shared link
            carries the report, never the image, and is signed so it cannot be altered.
          </div>
        </div>
      </details>

      <section className="pane">
        <h2 className="sh"><span>Continue checking the same home</span></h2>
        <ul className="idx" style={{ marginTop: 16 }}>
          <li><Link href="/blindspot"><span className="n">The six checks on this property</span><span className="s">Price, lease, liquidity, supply, land nearby, what could be built</span></Link></li>
          <li><Link href="/plan"><span className="n">What the purchase would cost</span><span className="s">Loan, downpayment, both stamp duties</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
