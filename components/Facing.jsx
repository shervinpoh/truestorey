'use client';
import Link from 'next/link';
import { useState } from 'react';
import { offsetFrom, directness, compass } from '../lib/sun.js';

/**
 * Which way does this unit face, and what does that mean across the year.
 *
 * ── THE QUESTION THE PANEL ABOVE COULD NOT ANSWER ──────────────────────────
 * The arc says the sun sets between 247° and 293° seen from this building. A
 * buyer standing in a specific unit wants to know whether it comes into THIS
 * window, and the site cannot tell them: no public dataset carries a unit's
 * orientation. URA publishes a floor band, not a unit, and nothing publishes
 * which way a bedroom points.
 *
 * So the reader supplies it, the way they supply a price to the calculators.
 * They are the one standing in the flat, or holding the plan with the north
 * arrow on it — that is not a gap in the data, it is the one fact they have
 * and the site does not.
 *
 * ── WHY AN ANGLE AND NOT A VERDICT ─────────────────────────────────────────
 * A window takes direct sun whenever the sun is anywhere in front of it, so
 * "does it get west sun" is yes for half the compass and tells nobody
 * anything. What varies is how squarely it arrives, and that is what changes
 * the room. The offset is shown per month and banded; the bands are named in
 * lib/sun.js so this component cannot invent others.
 *
 * Nothing here is a score. A west-facing living room is a fault to one buyer
 * and a sunset to another, and the site has no view on which.
 */
const POINTS = [
  ['N', 0], ['NNE', 22.5], ['NE', 45], ['ENE', 67.5], ['E', 90], ['ESE', 112.5],
  ['SE', 135], ['SSE', 157.5], ['S', 180], ['SSW', 202.5], ['SW', 225], ['WSW', 247.5],
  ['W', 270], ['WNW', 292.5], ['NW', 315], ['NNW', 337.5],
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Facing({ byMonth = [] }) {
  const [facing, setFacing] = useState(null);

  const rows = byMonth.map((m, i) => {
    const off = facing === null ? null : offsetFrom(facing, m.azimuth);
    return { name: MONTHS[i], off, band: directness(off) };
  });
  const best = facing === null ? null
    : rows.reduce((a, b) => (b.off != null && (a.off == null || b.off < a.off) ? b : a), rows[0]);

  return (
    <div className="facing">
      <label className="facinglab">
        <span className="lab">Which way does the unit face?</span>
        <select value={facing ?? ''} onChange={e => setFacing(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Choose a direction</option>
          {POINTS.map(([name, deg]) => (
            <option key={name} value={deg}>{name} — {deg}&deg;</option>
          ))}
        </select>
      </label>

      {facing === null ? (
        <p className="hint">
          Nothing published says which way a unit points &mdash; not URA, not HDB. You are the one
          standing in it, or holding the plan. If the floor plan carries a north arrow,{' '}
          <Link href="/floorplan">the plan reader</Link> will read it off and say so when it
          cannot.
        </p>
      ) : (<>
        <ol className="facingyear" aria-label={`How squarely the setting sun meets a ${compass(facing)} window, by month`}>
          {rows.map(r => (
            <li key={r.name} className={'fm ' + (r.band?.id || '')}>
              <span className="fmn">{r.name}</span>
              <span className="fmo mono">{r.off == null ? '—' : `${Math.round(r.off)}°`}</span>
            </li>
          ))}
        </ol>

        <p className="hint">
          A window facing <b className="mono">{compass(facing)} ({facing}&deg;)</b> takes the
          setting sun most squarely in <b>{best.name}</b>, at{' '}
          <b className="mono">{Math.round(best.off)}&deg;</b> off &mdash; {best.band.label}.
          {' '}Zero would be dead-on; past 90&deg; the sun is behind the wall and the window sees
          none of it directly, whatever the month.
        </p>
        <ul className="facingkey">
          <li><i className="square" />under 25&deg; &mdash; straight in</li>
          <li><i className="oblique" />25&ndash;55&deg; &mdash; at an angle</li>
          <li><i className="grazing" />55&ndash;90&deg; &mdash; grazing the edge</li>
          <li><i className="none" />over 90&deg; &mdash; behind the wall</li>
        </ul>
        <p className="hint">
          This is the sun&rsquo;s bearing against a facing you gave. It does not know what stands
          between the two &mdash; that is the table above, and it is not the same question.
        </p>
      </>)}
    </div>
  );
}
