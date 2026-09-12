'use client';
import { bearingOf } from '../lib/facing.js';
import { sunOnFacing, DIRECTNESS } from '../lib/sun.js';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * What the afternoon sun does to this plan, month by month.
 *
 * ── WHY THIS IS NOT A MODEL ANSWERING A QUESTION ───────────────────────────
 * The model read a north arrow off the drawing and wrote down a compass
 * direction. That is all it did. Every angle here is astronomy computed from
 * that reading, the month and Singapore's latitude — the same arithmetic the
 * record pages use, from the same file. A language model never assigns a
 * number, and "which months does the west sun come in" is a number.
 *
 * ── AND WHY IT REFUSES MORE OFTEN THAN IT ANSWERS ──────────────────────────
 * Roughly half of Singapore marketing plans carry no north arrow, and a plan
 * without one cannot be answered. Two separate gates: the route's own
 * confidence, and bearingOf() returning null. Both have to pass, because the
 * first version of the parser read "the plan carries no north arrow" as
 * facing north — a refusal turned into a bearing by the very code written to
 * stop that.
 *
 * "Not shown" is a different sentence from "the sun never reaches it", and a
 * reader must never see the second when the first is true.
 */
export default function FacingSun({ facing }) {
  const confident = facing?.confidence === 'high' || facing?.confidence === 'medium';
  const read = confident ? bearingOf(facing.reading) : null;
  const year = read ? sunOnFacing(read.bearing) : null;

  if (!year) {
    return (
      <div className="note" style={{ marginTop: 18 }}>
        <b>No sun reading from this plan.</b> This needs a north arrow or a compass rose
        printed on the drawing. Without one, which way the unit faces cannot be established
        from the plan alone, and it is not something worth guessing at — so nothing is
        claimed here rather than something being estimated.
      </div>
    );
  }

  const lit = year.months.filter(m => m.band !== 'none');

  return (
    <section style={{ marginTop: 26 }}>
      <h2 className="sh"><span>The afternoon sun on a {read.point} facing</span>
        <span className="mono">{read.bearing}&deg;</span></h2>

      <div className="sunyear">
        {year.months.map(m => (
          <div key={m.month} className={`suncell b-${m.band}`}>
            <span className="sunmon">{MONTH[m.month - 1]}</span>
            <span className="sunoff mono">{m.band === 'none' ? '—' : `${Math.round(m.offset)}°`}</span>
          </div>
        ))}
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        {!lit.length ? (
          <>The low sun sets between 246&deg; and 293&deg; over the year, and a {read.point} facing
          is outside that arc in every month. This side of the home takes no direct low
          afternoon sun at any point in the year.</>
        ) : (
          <>Closest in {MONTH[year.closest.month - 1]}, when the setting sun is{' '}
          <b>{Math.round(year.closest.offset)}&deg;</b> off this facing &mdash;{' '}
          {year.closest.label}.{' '}
          {year.monthsClear.length > 0
            ? `In ${year.monthsClear.length} month${year.monthsClear.length === 1 ? '' : 's'} it sits behind the wall entirely.`
            : 'There is no month in which it sits behind the wall.'}</>
        )}
      </p>

      {/* The bands are named in lib/sun.js so the page cannot invent others,
          and they are printed here because a colour without a key is a
          decoration. */}
      <ul className="sunkey">
        {DIRECTNESS.map(b => (
          <li key={b.id}><i className={`b-${b.id}`} aria-hidden="true" />{b.label}</li>
        ))}
      </ul>

      <p className="prov mono">
        Astronomy computed for Singapore, {new Date().getUTCFullYear()} &middot; sun at or below{' '}
        {year.lowDeg}&deg; &middot; facing read from the north arrow on your plan, nothing stored
      </p>
    </section>
  );
}
