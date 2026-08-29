'use client';
import { useRef, useState } from 'react';

/**
 * A bar chart you can read a figure off.
 *
 * WHAT WAS WRONG. Every chart on this site marked exactly one bar with the
 * accent — the latest quarter, or the first MOP year — and left the other
 * hundred and forty-five as an undifferentiated grey slab. The only way to
 * learn what any of them meant was to rest the pointer on one and wait for the
 * operating system's `title` tooltip, which is slow, unstyleable, invisible on
 * a touchscreen and unreachable from a keyboard. On a site whose argument is
 * that the figures are the point, the charts were the one place a figure could
 * not be read.
 *
 * WHAT THIS DOES INSTEAD. The value under the pointer is printed above the
 * chart in the readout, at full size, as you move. Nothing is hidden behind a
 * hover delay and nothing needs a tooltip. Move away and it falls back to the
 * latest bar, so the readout always says something true rather than going
 * blank.
 *
 * POINTER POSITION, NOT PER-BAR HOVER. With 146 quarters a bar is under three
 * pixels wide, and hover targets that small are a lottery. The index is
 * computed from the pointer's x position across the whole plot, so every pixel
 * of the chart selects something and the reading never falls between bars.
 *
 * KEYBOARD. The plot is one tab stop, not one per bar — 146 tab stops is a
 * trap, not access. Arrow keys move the cursor, Home and End jump to the ends,
 * and the readout is an aria-live region so the value is announced as it
 * changes.
 */
export default function Chart({
  points,                      // [{ label, value }]
  format = v => String(v),
  unit = '',
  height = 118,
  markFrom = null,             // index: start of a highlighted span
  markTo = null,               // index: end of a highlighted span
  ariaLabel,
}) {
  const [at, setAt] = useState(null);          // hovered/focused index, or null
  const ref = useRef(null);

  if (!points?.length) return null;
  const n = points.length;
  const vals = points.map(p => p.value);
  const mn = Math.min(...vals) * 0.985;
  const mx = Math.max(...vals) * 1.005;
  const span = mx - mn || 1;

  // Falls back to the latest bar so the readout is never empty.
  const cur = at == null ? n - 1 : at;
  const p = points[cur];

  const fromIdx = markFrom == null ? null : Math.max(0, Math.min(n - 1, markFrom));
  const toIdx = markTo == null ? null : Math.max(0, Math.min(n - 1, markTo));
  const inSpan = i => fromIdx != null && toIdx != null && i >= Math.min(fromIdx, toIdx) && i <= Math.max(fromIdx, toIdx);

  const fromX = e => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    const k = Math.floor(((e.clientX - r.left) / r.width) * n);
    return Math.max(0, Math.min(n - 1, k));
  };

  const onKey = e => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (step) { e.preventDefault(); setAt(Math.max(0, Math.min(n - 1, cur + step))); return; }
    if (e.key === 'Home') { e.preventDefault(); setAt(0); }
    if (e.key === 'End') { e.preventDefault(); setAt(n - 1); }
  };

  return (
    <div className="chart">
      <p className="chartread" aria-live="polite">
        <b>{format(p.value)}{unit}</b>
        <span>{p.label}</span>
        {at == null && <em>latest — point at the chart to read any bar</em>}
      </p>

      <div
        ref={ref}
        className="bars chartplot"
        style={{ height }}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel || `${n} points, from ${points[0].label} to ${points[n - 1].label}.`}
        onPointerMove={e => { const k = fromX(e); if (k != null) setAt(k); }}
        onPointerLeave={() => setAt(null)}
        onKeyDown={onKey}
        onBlur={() => setAt(null)}
      >
        {points.map((q, i) => (
          <i
            key={q.label + i}
            className={[
              i === cur ? 'on' : '',
              inSpan(i) ? 'span' : '',
              i === n - 1 && at == null ? 'last' : '',
            ].filter(Boolean).join(' ')}
            style={{ height: (8 + ((q.value - mn) / span) * 88) + '%' }}
          />
        ))}
      </div>

      <div className="axis">
        <span className="lab">{points[0].label}</span>
        <span className="lab">{points[n - 1].label}</span>
      </div>
    </div>
  );
}
