import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import FloorplanUpload from '../../components/FloorplanUpload.jsx';

export const metadata = {
  title: 'Floorplan Reader — layout, light and what to ask a QP | Truestorey',
  description: 'Upload a floor plan and get its layout efficiency, what the plan does and does not show about orientation, and the wall questions to put to your ID and a qualified person. Free, nothing stored.',
  alternates: { canonical: '/floorplan' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Floorplan Reader"
        sub="What the plan shows about the layout, and the questions it raises for your renovation. Free, and the image is discarded the moment it is read." />
      <ToolIntro href="/floorplan" compact />
      <ToolUse id="floorplan" />
      <section className="pane">
        <FloorplanUpload />
        <h2 className="sh floorplan-returns"><span>What it returns</span></h2>
        <div className="floorplan-outcomes" aria-label="What the floor plan check returns">
          <div><span className="mono">01</span><b>Layout</b><p>What uses space well and what may not.</p></div>
          <div><span className="mono">02</span><b>Light</b><p>Orientation and afternoon sun, only when shown.</p></div>
          <div><span className="mono">03</span><b>Questions</b><p>What to ask your ID and a qualified person.</p></div>
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
            <b>Nothing is stored.</b> The image is read in the request and discarded. There is no
            account, upload history or sign-up.
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
