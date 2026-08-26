'use client';
import { useEffect, useRef, useState } from 'react';

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

/** Counts to `value` once, on first sight. `format` renders every frame. */
export function Figure({ value, format = v => v, duration = 600, className = 'statnum', style }) {
  const ref = useRef(null);
  const done = useRef(false);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || done.current || still() || !Number.isFinite(value)) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || done.current) return;
      done.current = true;
      io.disconnect();
      const from = 0, t0 = performance.now();
      let raf = 0;
      const step = now => {
        const k = Math.min(1, (now - t0) / duration);
        setShown(from + (value - from) * easeOut(k));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      el._cancel = () => cancelAnimationFrame(raf);
    }, { threshold: 0.4 });

    io.observe(el);
    return () => { io.disconnect(); el._cancel?.(); };
  }, [value, duration]);

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
