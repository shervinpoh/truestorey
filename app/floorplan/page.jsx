import Link from 'next/link';
import Masthead from '../../components/Masthead.jsx';
import FloorplanUpload from '../../components/FloorplanUpload.jsx';

export const metadata = {
  title: 'Floor plan check — layout, light and what to ask a QP | Truestorey',
  description: 'Upload a floor plan and get its layout efficiency, what the plan does and does not show about orientation, and the wall questions to put to your ID and a qualified person. Free, nothing stored.',
  alternates: { canonical: '/floorplan' },
};

export default function Page() {
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Floor plan check"
        sub="What the plan shows about the layout, and the questions it raises for your renovation. Free, and the image is discarded the moment it is read." />
      <section className="pane"><FloorplanUpload /></section>
      <section className="pane">
        <div className="note">
          <b>It will not tell you which walls can come down, and no floor plan can.</b> That lives in
          the structural drawings and in a qualified person&rsquo;s assessment. What this gives you is
          the list of walls worth asking about, phrased as questions — which is what your ID needs
          anyway. Removing a structural wall without approval is an offence before it is a danger.
        </div>
        <div className="note">
          <b>Orientation only when the plan shows it.</b> If there is no north arrow, the tool says
          so rather than guessing. West sun is worth knowing about and worth knowing honestly.
        </div>
        <div className="note">
          <b>Nothing is stored.</b> The image is read in the request and discarded. There is no
          account, no upload history and no sign-up on this site.
        </div>
        <ul className="idx" style={{ marginTop: 16 }}>
          <li><Link href="/blindspot"><span className="n">The four checks on this property</span><span className="s">Price, supply, land nearby, what could be built</span></Link></li>
          <li><Link href="/plan"><span className="n">What the purchase would cost</span><span className="s">Loan, downpayment, both stamp duties</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
