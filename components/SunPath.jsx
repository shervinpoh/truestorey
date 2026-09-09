import { compass, sgTime } from '../lib/sun.js';

/**
 * Where the afternoon sun comes from, and what has permission to stand in it.
 *
 * ── WHAT THIS ANSWERS ──────────────────────────────────────────────────────
 * "Will I get west sun" is settled by standing on the balcony at six o'clock.
 * "Will I still get it in three years" is not, and that is the one that
 * matters when you are buying. URA publishes every planning decision it makes
 * and 4,755 permitted ones carry a coordinate; crossed with where the sun
 * actually is, public data answers the second question.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 * Draw a shadow. That needs building footprints and heights, and this repo
 * holds neither — inventing them is rule 13, geometry the data does not
 * contain. The tool everybody shares on Instagram draws shadows; it also
 * licenses a 3D model of the city.
 *
 * So it reports two things and joins neither into a verdict: the bearing the
 * sun arrives on, which is astronomy, and what has been approved along that
 * bearing, which is a filed decision with a reference number. A 3-storey
 * semi-detached at 340m and a 19-storey block at 270m both appear, because the
 * difference between them is the whole judgement and it belongs to the reader.
 *
 * ── THE DIAL ───────────────────────────────────────────────────────────────
 * Bearings and distances, both computed from coordinates this site holds. No
 * outlines, no heights, no footprints — a mark sits at its bearing and its
 * distance and claims nothing about its shape.
 */
export default function SunPath({ sun, approvals, label }) {
  if (!sun) return null;
  const { arc, today, lat } = sun;
  const items = approvals?.items || [];

  /* The dial spans the western half, because that is the half the feature is
     about: the sun is overhead at noon here and the complaint is always the
     last hour. 180°–360° with north at the top. */
  const R = 118, CX = 132, CY = 132;
  const pt = (bearing, r) => {
    const a = (bearing - 90) * Math.PI / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };
  const [ax, ay] = pt(arc.from, R);
  const [bx, by] = pt(arc.to, R);

  return (
    <section className="pane" id="sun">
      <h2 className="sh"><span>The afternoon sun, and what is approved in it</span>
        <span className="mono">{Math.round(arc.from)}&deg;&ndash;{Math.round(arc.to)}&deg;</span></h2>

      <div className="sunwrap">
        <svg className="sundial" viewBox="0 0 264 264" role="img"
          aria-label={`The sun sets between ${Math.round(arc.from)} and ${Math.round(arc.to)} degrees through the year, seen from ${label}.`}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--line)" />
          <circle cx={CX} cy={CY} r={R * 0.62} fill="none" stroke="var(--line2)" strokeDasharray="2 4" />
          <circle cx={CX} cy={CY} r={R * 0.31} fill="none" stroke="var(--line2)" strokeDasharray="2 4" />

          {/* The arc the sun sets across, over the year. */}
          <path d={`M ${CX} ${CY} L ${ax} ${ay} A ${R} ${R} 0 0 1 ${bx} ${by} Z`}
            fill="var(--acc-soft)" stroke="var(--acc-lit)" strokeWidth="1" />

          {['N', 'E', 'S', 'W'].map((c, i) => {
            const [x, y] = pt(i * 90, R + 13);
            return <text key={c} x={x} y={y} className="sunc" textAnchor="middle" dominantBaseline="middle">{c}</text>;
          })}

          {/* One mark per approved decision, at its bearing and its distance.
              Nothing about its shape is drawn, because nothing about its shape
              is known. */}
          {items.map((it, i) => {
            const [x, y] = pt(it.bearing, R * Math.min(1, it.m / (approvals.within || 400)));
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={it.storeys && it.storeys >= 8 ? 6 : 4}
                  fill="var(--acc)" stroke="var(--paper)" strokeWidth="1.5" />
              </g>
            );
          })}
          <circle cx={CX} cy={CY} r="3.5" fill="var(--ink)" />
        </svg>

        <div className="sunfacts">
          <p>
            Seen from here, the sun sets at <b className="mono">{Math.round(arc.from)}&deg;</b>{' '}
            ({compass(arc.from)}) in December and <b className="mono">{Math.round(arc.to)}&deg;</b>{' '}
            ({compass(arc.to)}) in June &mdash; a swing of{' '}
            <b className="mono">{Math.round(arc.to - arc.from)}&deg;</b> across the year. A window on
            one of those bearings takes the low sun for part of the year and none of it for the rest.
          </p>
          {today && (
            <p className="hint">
              Today the sun drops below {sun.lowDeg}&deg; at{' '}
              <b className="mono">{sgTime(today.start)}</b> and sets at{' '}
              <b className="mono">{sgTime(today.end)}</b>, arriving from{' '}
              <b className="mono">{Math.round(today.from)}&deg;</b> ({compass(today.from)}). Above
              that angle it is over the roof rather than through the window; near the equator the
              midday sun is almost overhead, which is why this is only ever about the last hour.
            </p>
          )}
        </div>
      </div>

      {approvals && (
        approvals.total === 0 ? (
          <p className="hint">
            Nothing with planning permission sits on those bearings within{' '}
            <b className="mono">{approvals.within}m</b>. That is a fact about this radius and these
            bearings, not a guarantee of a view &mdash; an application not yet decided does not
            appear here, and neither does anything further out.
          </p>
        ) : (<>
          <p className="hint" style={{ marginBottom: 8 }}>
            <b className="mono">{approvals.total}</b> permitted planning{' '}
            {approvals.total === 1 ? 'decision sits' : 'decisions sit'} on those bearings within{' '}
            {approvals.within}m. What it means depends entirely on which:
          </p>
          <div className="tablewrap">
            <table className="nstable">
              <thead>
                <tr>
                  <th scope="col">Approved</th><th scope="col" className="r">Away</th>
                  <th scope="col" className="r">Bearing</th><th scope="col">Height</th>
                  <th scope="col">What</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="mono">{it.date}</td>
                    <td className="r mono">{it.m}m</td>
                    <td className="r mono">{it.bearing}&deg; {compass(it.bearing)}</td>
                    <td className="mono">{it.storeys ? `${it.storeys} storeys` : '—'}</td>
                    <td className="sunwhat">{sentence(it.what)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)
      )}

      <div className="note">
        <b>This does not tell you whether anything is blocked.</b> A shadow needs the height and
        footprint of every building between you and the sun, and no public dataset here carries
        them &mdash; so none is drawn. What is above is the bearing the sun arrives on, which is
        astronomy, and what has been permitted along it, which is a filed decision with a reference
        number. Joining the two is yours. Bearings and distances are straight-line. A decision is
        permission to build, not a building: some are never started, and heights come from URA&rsquo;s
        own wording, which states one about four times in five.
      </div>
    </section>
  );
}

/* URA writes in capitals. Sentence case reads as prose rather than as a
   warning, and this panel must not read as a warning. */
function sentence(s) {
  const t = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1, 118) + (t.length > 118 ? '…' : '');
}
