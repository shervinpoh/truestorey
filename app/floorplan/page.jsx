import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import FloorplanUpload from '../../components/FloorplanUpload.jsx';
import UnitTurntable from '../../components/UnitTurntable.jsx';

/* What the renderer actually drew — nine rooms and their sizes, already scaled
   and already snapped. This page must not derive them: the scale comes from
   the stated area and the snap then moves edges by up to 15cm, so computing
   them here would give a table that quietly disagreed with the picture beside
   it. Blender writes this file for exactly that reason. */
function loadRooms() {
  const p = path.join(process.cwd(), 'public', 'layouts', 'unit-a-rooms.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export const metadata = {
  title: 'Floor plan check — layout, light and what to ask a QP | Truestorey',
  description: 'Upload a floor plan and get its layout efficiency, what the plan does and does not show about orientation, and the wall questions to put to your ID and a qualified person. Free, nothing stored.',
  alternates: { canonical: '/floorplan' },
};

export default function Page() {
  const model = loadRooms();
  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Floor plan check"
        sub="What the plan shows about the layout, and the questions it raises for your renovation. Free, and the image is discarded the moment it is read." />
      <ToolIntro href="/floorplan" />
      <ToolUse id="floorplan" />
      <section className="pane"><FloorplanUpload /></section>

      {model && (
        <section className="pane">
          <h2 className="sh"><span>What a plan becomes</span>
            <span className="mono">{model.areaSqm} sqm</span></h2>
          <p className="hint" style={{ margin: '0 0 16px', maxWidth: '62ch' }}>
            A real four-room flat, modelled from its own floor plan. <b>The plan carried no
            dimensions at all</b> — not one. Every measurement below comes from tracing the
            rooms and solving against the single figure such a plan always has, its area:
            metres per pixel is the square root of the stated area over the traced area.
            Drag it, or use the slider.
          </p>

          <UnitTurntable base="/layouts/unit-a-PROVISIONAL" count={16}
            label="a 90 square metre four-room flat"
            alt={`A cutaway model of a ${model.areaSqm} square metre four-room flat seen from above, ` +
                 `walls cut at 1.3 metres so the layout is visible. Three bedrooms with beds and ` +
                 `wardrobes, a living and dining room, a kitchen, two bathrooms and a household shelter.`} />

          <table className="ttrooms">
            <thead><tr><th>Room</th><th style={{ textAlign: 'right' }}>Size</th>
              <th style={{ textAlign: 'right' }}>Area</th></tr></thead>
            <tbody>
              {model.rooms.map(r => (
                <tr key={r.name + r.areaSqm}>
                  <td>{r.name}{r.counts === false && ' — not counted in the area'}</td>
                  <td className="m">{r.boxes.map(b => `${b[0]}×${b[1]}`).join(' + ')}</td>
                  <td className="m">{r.areaSqm} m&sup2;</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="note method" style={{ marginTop: 18 }}>
            <b>The furniture is a fit test, not decoration.</b> A queen bed is drawn at 1.83 by
            2.03 metres and a three-seat sofa at 2.20 by 0.90, the sizes those things actually
            are — and nothing is drawn in a room it does not fit in. That is the question a plan
            is bad at answering and the reason for modelling it at all.
          </div>
          <div className="note">
            <b>Proportions are exact; the absolute scale is about 2% either way.</b> One scale
            factor is solved for the whole plan, so every room is right relative to every other
            room whatever that factor turns out to be. What moves it is what the stated area
            counts — a balcony or an aircon ledge on the wrong side of the figure shifts every
            dimension by roughly 2%, which is 70mm on a 3.5 metre bedroom. {model.areaBasis}
          </div>
          {!model.verified && (
            <div className="note warn">
              <b>This geometry has not been checked against the source plan by a person.</b> It
              was traced once and the arithmetic agrees with itself, which is not the same thing.
              Treat the room sizes as close, not as surveyed, and never as a basis for ordering
              anything.
            </div>
          )}
          <p className="prov mono" style={{ marginTop: 14 }}>
            Traced from the unit&rsquo;s own floor plan · scale{' '}
            {model.scaleMPerUnit ? `${model.scaleMPerUnit.toFixed(5)} m per traced pixel` : '—'} ·
            rendered in Blender. Not a survey, and not a valuation.
          </p>
        </section>
      )}

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
          <li><Link href="/blindspot"><span className="n">The six checks on this property</span><span className="s">Price, lease, liquidity, supply, land nearby, what could be built</span></Link></li>
          <li><Link href="/plan"><span className="n">What the purchase would cost</span><span className="s">Loan, downpayment, both stamp duties</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
