'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Motion, on a short leash.
 *
 * haio.sg reads as smooth and this site reads as static, and the difference is
 * almost entirely that its figures arrive rather than appear. That is worth
 * taking. What is not worth taking is motion for its own sake — this site's
 * argument is that the number is the point, and anything that delays a reader
 * getting to the number is working against it.
 *
 * So the rules here are narrow:
 *
 *  · Only the headline figure animates, and only once, and only when it
 *    scrolls into view. Body text and tables never move.
 *  · ~600ms, eased out. Long enough to register, short enough that nobody
 *    waiting on the number notices they are waiting.
 *  · prefers-reduced-motion is honoured before anything else runs. Someone who
 *    has asked their operating system for less movement gets the final value
 *    immediately, not a shorter animation.
 *  · The final value renders first and the count starts after mount, so the
 *    server-rendered HTML and a JS-less reader both carry the real figure.
 *    A number that only exists after an animation is a number search engines
 *    and screen readers never see.
 */
const still = () =>
  typeof window === 'undefined' ||
  !window.matchMedia ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOut = t => 1 - (1 - t) ** 3;

/**
 * Counts to `value` once, on first sight. `format` renders every frame.
 *
 * THE FIGURE MUST EQUAL ITS VALUE WHENEVER IT IS NOT MID-COUNT. That sounds
 * too obvious to write down, and it is the bug this component shipped with.
 *
 * The first version kept the effect keyed on `[value, duration]` and wrote
 * `shown` only from inside the animation loop. So on any recalculation React
 * ran the cleanup, the cleanup cancelled the in-flight frame, and the new
 * effect hit `if (done.current) return` and never restarted the loop. Nothing
 * else could write `shown`, so the number froze on whatever frame it had
 * reached — mid-ease, and therefore an arbitrary fraction of the truth — and
 * then ignored every later input in silence.
 *
 * On /plan that meant "cash you need on the day" reading S$12,516 against a
 * true S$57,100, next to a table that had the right figure all along, and
 * staying there while the reader changed their income. A wrong number that
 * does not move is worse than no number: it looks settled. Everything this
 * site publishes goes out under a CEA registration, so this is a correctness
 * bug first and a motion bug second.
 *
 * Three things keep it fixed, and a test covers each:
 *   · a tracking effect writes `shown` whenever no count is running, so the
 *     figure follows its value even after the one-time animation is over;
 *   · the observer effect is keyed on `[duration]` only — a recalculation must
 *     never cancel or restart the count;
 *   · the loop reads the target from a ref each frame, so a value that changes
 *     mid-count is animated toward instead of being overwritten on landing.
 */
export function Figure({ value, format = v => v, duration = 600, className = 'statnum', style }) {
  const ref = useRef(null);
  const target = useRef(value);
  const started = useRef(false);
  const animating = useRef(false);
  const raf = useRef(0);
  const settle = useRef(0);
  const [shown, setShown] = useState(value);

  if (Number.isFinite(value)) target.current = value;

  /**
   * Land on the target and give up the animating latch.
   *
   * Every exit from the count goes through here, because the latch is what
   * gates the tracking effect below and a latch that can stick is the whole
   * failure mode. requestAnimationFrame DOES NOT RUN IN A BACKGROUND TAB: a
   * reader who switches away 20ms into a count comes back to a figure stranded
   * on frame one, with `animating` still true and every later value silently
   * refused. That is the same wrong-number-that-will-not-move as before,
   * arriving by a different route, and switching tabs is not an edge case.
   */
  const land = () => {
    cancelAnimationFrame(raf.current);
    clearTimeout(settle.current);
    animating.current = false;
    setShown(target.current);
  };

  // Not mid-count ⇒ the figure IS its value. This is the line whose absence
  // froze every recalculating tool on the site.
  useEffect(() => {
    if (!animating.current) setShown(value);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || started.current || still() || !Number.isFinite(target.current)) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || started.current) return;
      started.current = true;
      animating.current = true;
      io.disconnect();
      const t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / duration);
        if (k >= 1) { land(); return; }   // lands on the CURRENT target
        setShown(target.current * easeOut(k));
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
      // The deadline. setTimeout still fires in a background tab where
      // requestAnimationFrame does not, so this is what guarantees the figure
      // is correct whenever the reader is actually looking at it.
      settle.current = setTimeout(land, duration + 250);
    }, { threshold: 0.4 });

    io.observe(el);
    return () => io.disconnect();
    // Deliberately not keyed on `value`. Re-running this on every keystroke is
    // precisely what cancelled the animation and stranded the figure.
  }, [duration]);

  // Unmount only. A cancel on every value change is the original bug.
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    clearTimeout(settle.current);
    animating.current = false;
  }, []);

  return <b ref={ref} className={className} style={style}>{format(shown)}</b>;
}

/**
 * Fades a block up the first time it is seen.
 *
 * Deliberately not applied to whole pages. A page where everything waits to
 * fade in is slower to read than one that is simply there, and the point is
 * that a section feels like it landed, not that the site performs.
 */
export function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (still() || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(e => {
      if (e[0].isIntersecting) { setOn(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className={`reveal${on ? ' in' : ''} ${className}`.trim()}>{children}</div>;
}

/**
 * Run a state change inside a native View Transition.
 *
 * WHAT THIS IS NOT. It is not page-to-page transitions. Those need Next's
 * `experimental.viewTransition`, which is a wrapper over React's
 * `unstable_ViewTransition` — a component the installed React 19.2.8 does not
 * export at all. Turning the flag on means running a React experimental build,
 * and this site publishes under a CEA registration; an unstable React
 * underneath a filed-transaction figure is not a trade worth making for a
 * cross-fade. When React ships it, this is where it goes.
 *
 * WHAT IT IS. Same-document transitions on the state changes where the figures
 * actually move: switching flat type on a record page rewrites the median, the
 * range, the spread, the chart and every transaction row at once. Without this
 * the whole page swaps between frames, which reads as a flicker; with it the
 * old numbers cross-fade to the new ones and the change is legible as a change.
 *
 * flushSync is required, not decorative. startViewTransition snapshots the DOM
 * when the callback returns, and a React state update scheduled normally has
 * not rendered by then — the "after" snapshot would be identical to the
 * "before" one and nothing would animate.
 *
 * Falls through to a plain call on browsers without the API and whenever the
 * reader has asked for less movement, so the result is identical either way.
 */
export function withTransition(update) {
  if (typeof document === 'undefined' || !document.startViewTransition || still()) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

/**
 * Grows a bar chart out of its own axis, once, when it is first seen.
 *
 * THE ORDER OF THE TWO CLASSES IS THE WHOLE THING, and it is not the order
 * Reveal uses. `.reveal` starts at opacity 0 in the stylesheet, so a reader
 * with no JavaScript gets nothing — a tradeoff this file already made for
 * prose. A bar chart cannot make it: the bars ARE the content, and an invisible
 * chart is worse than a chart that does not move.
 *
 * So the un-classed state is the FINISHED chart. On mount — and only if the
 * browser can actually animate and the reader has not asked it not to — this
 * sets `data-anim="ready"`, which is what collapses the bars. Only then does
 * intersection add `.in` and play them back up. No JavaScript, reduced motion,
 * print: the chart is simply there at full height, which is the correct
 * failure. And because `ready` is set in a layout effect rather than after
 * paint, the collapse never flashes.
 */
export function Grow({ children, className = '' }) {
  const ref = useRef(null);
  const [phase, setPhase] = useState('');       // '' | 'ready' | 'in'

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (still() || typeof IntersectionObserver === 'undefined') return;   // stays finished
    setPhase('ready');
    const io = new IntersectionObserver(e => {
      if (e[0].isIntersecting) { setPhase('in'); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);

    /* A failsafe, because `ready` has already collapsed the bars.
     *
     * Everything above assumes the observer eventually fires. If it does not —
     * a backgrounded tab that never gets a rendering opportunity, a browser
     * throttling observers, anything unforeseen — the chart is left at
     * scaleY(0) and the bars are simply gone. That is a worse outcome than no
     * animation, and it is exactly the failure this component was written to
     * avoid; it just arrives by a different route than "no JavaScript".
     *
     * So the animation also plays on a timer. If the chart was off screen the
     * whole time, it plays unseen and ends finished, which costs nothing. What
     * cannot happen is a chart that stays collapsed. */
    const failsafe = setTimeout(() => { setPhase('in'); io.disconnect(); }, 4000);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, []);

  return (
    <div ref={ref} className={`grow${phase === 'in' ? ' in' : ''} ${className}`.trim()}
      data-anim={phase === 'ready' || phase === 'in' ? 'ready' : undefined}>
      {children}
    </div>
  );
}
