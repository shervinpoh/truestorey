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
  /* ── A SECOND SERIES, ON THE SAME SCALE ─────────────────────────────────
     Optional, aligned index-for-index with `points`, and drawn as a line over
     the bars rather than as a second set of bars — two interleaved bar series
     at 146 quarters is a comb nobody can read.

     THE SHARED SCALE IS THE POINT. HDB's resale index and URA's private index
     are both on 1Q2009 = 100, which is the entire reason ingest:ppi went to
     SingStat for it rather than rebasing something here. Giving the line its
     own axis would throw that away and invent a visual relationship the
     numbers do not have. A null in the series is a gap in the line, not a
     zero. */
  compare = null,              // [{ label, value|null }] — same length as points
  compareLabel = '',
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
  const cmpVals = (compare || []).map(c => c?.value).filter(Number.isFinite);
  const vals = points.map(p => p.value).concat(cmpVals);
  const mn = Math.min(...vals) * 0.985;
  const mx = Math.max(...vals) * 1.005;
  const span = mx - mn || 1;
  /* The bars sit in a box 8%–96% tall; the line has to use the same mapping or
     the two series would be drawn against different rulers on one picture. */
  const yOf = v => 100 - (8 + ((v - mn) / span) * 88);
  const cmpAt = i => (compare && Number.isFinite(compare[i]?.value) ? compare[i].value : null);

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
        {compare && cmpAt(cur) != null && (
          <span className="chartcmp">
            <i aria-hidden="true" />{compareLabel} <b>{format(cmpAt(cur))}{unit}</b>
          </span>
        )}
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

        {/* preserveAspectRatio="none" so the line stretches with the box the
            bars already fill, and pointer-events off so it never steals the
            hover the bars are reading. */}
        {compare && (
          <svg className="chartline" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none"
            aria-hidden="true" focusable="false">
            {/* Broken into runs, so a quarter the series does not cover is a
                gap rather than a straight line drawn across missing data. */}
            {(() => {
              const runs = []; let run = [];
              for (let i = 0; i < n; i++) {
                const v = cmpAt(i);
                if (v == null) { if (run.length > 1) runs.push(run); run = []; continue; }
                run.push(`${i + 0.5},${yOf(v).toFixed(2)}`);
              }
              if (run.length > 1) runs.push(run);
              return runs.map((r, k) => (
                <polyline key={k} points={r.join(' ')} fill="none"
                  stroke="var(--ink)" strokeWidth="1.4" vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round" strokeLinecap="round" />
              ));
            })()}
          </svg>
        )}
      </div>

      <div className="axis">
        <span className="lab">{points[0].label}</span>
        <span className="lab">{points[n - 1].label}</span>
      </div>
    </div>
  );
}
