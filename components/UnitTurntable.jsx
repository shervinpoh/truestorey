'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * A flat you can turn, from a plan that carried no dimensions.
 *
 * ── WHY A STEPPED SEQUENCE AND NOT A 3D VIEWER ─────────────────────────────
 * A real 3D viewer means three.js or model-viewer, which is a fourth npm
 * dependency and a large one. Sixteen pre-rendered frames give the thing a
 * reader actually wants — turn it and see the back — at 8KB an AVIF frame, so
 * the whole rotation costs less than one photograph. It is also the pattern
 * already on this site for the construction stages.
 *
 * ── IT MUST WORK WITH NO JAVASCRIPT ────────────────────────────────────────
 * This is a client component, so the server renders its initial state: frame
 * zero, as a plain img with width and height. A reader with no JS gets a
 * picture of the flat rather than an empty box, and the box is reserved before
 * the bytes land either way.
 *
 * ── THE CONTROL IS A RANGE INPUT, ON PURPOSE ───────────────────────────────
 * Dragging the image is the obvious gesture and it is supported, but a drag
 * target is invisible to a keyboard and announces nothing. A native range gets
 * arrow keys, Home and End, a focus ring and a role for free, and it is the one
 * control on the page that says "this turns" before you touch it.
 *
 * There is no auto-spin. Motion on this site has to reveal information, and a
 * flat rotating on its own reveals nothing you would not get by turning it
 * yourself — it just moves while you are trying to read a room.
 */
export default function UnitTurntable({ base, count = 16, alt, label }) {
  const [i, setI] = useState(0);
  const [ready, setReady] = useState(false);
  const drag = useRef(null);

  /* The remaining frames after mount, not with the page. Frame zero is the
     one that has to arrive fast; the other fifteen are only needed once a
     reader decides to turn it, and fetching 120KB up front to serve a gesture
     most readers never make is the wrong trade. */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (let n = 1; n < count; n++) {
        if (!alive) return;
        const img = new Image();
        img.src = `${base}-${String(n).padStart(2, '0')}.webp`;
      }
      if (alive) setReady(true);
    };
    /* A TIMEOUT, BECAUSE AN IDLE CALLBACK CAN STARVE FOREVER.
       requestIdleCallback only runs when the browser decides it is idle, and a
       page that is not compositing — a background tab, a hidden pane, a phone
       with the screen off — may never be. Caught here by the readout sitting on
       "loading views…" indefinitely. CLAUDE.md already records this site
       shipping the same class of bug once, where a count-up keyed on
       requestAnimationFrame froze because rAF does not run in a background tab.

       The `timeout` option is the fix rather than a hand-rolled race: the
       callback is guaranteed to run within it, idle or not. The `||` branch
       still covers browsers without rIC at all, which is a different problem
       and the one the first version mistook this for. */
    const idle = window.requestIdleCallback
      ? f => window.requestIdleCallback(f, { timeout: 1500 })
      : f => setTimeout(f, 300);
    idle(load);
    return () => { alive = false; };
  }, [base, count]);

  const onDown = e => {
    drag.current = { x: e.clientX, i };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = e => {
    if (!drag.current) return;
    /* One full turn per ~420px of travel, which is about a thumb's sweep on a
       phone and a comfortable drag on a trackpad. Wrapping rather than
       clamping, because the subject is a loop. */
    const step = Math.round((e.clientX - drag.current.x) / (420 / count));
    setI(((drag.current.i + step) % count + count) % count);
  };
  const onUp = () => { drag.current = null; };

  const frame = String(i).padStart(2, '0');

  return (
    <figure className="ttable">
      <div className="ttstage" onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerCancel={onUp}>
        <picture>
          <source type="image/avif" srcSet={`${base}-${frame}.avif`} />
          <img src={`${base}-${frame}.webp`} alt={alt}
            width="1400" height="1400" decoding="async" draggable="false" />
        </picture>
      </div>

      <label className="ttctl">
        <span className="lab">Turn it</span>
        <input type="range" min="0" max={count - 1} step="1" value={i}
          onChange={e => setI(Number(e.target.value))}
          aria-label={`Rotate ${label}. ${count} views.`} />
        <span className="mono tthint">
          {ready ? `${i + 1} / ${count}` : 'loading views…'}
        </span>
      </label>
    </figure>
  );
}
