'use client';
import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { EVENTS } from '../lib/analytics.js';

/**
 * Client-side event sender. See lib/analytics.js for the privacy contract —
 * no cookies, no IP, no fingerprint, nothing free-text from the lead form.
 *
 * Fire-and-forget. Analytics must never slow a page down or break one, so every
 * failure here is swallowed: a visitor should not know or care that this exists.
 */

const KEY = 'truestorey.sid';

/** Per-tab, dies with the tab. Not a cookie, not persistent, not identifying. */
function sid() {
  try {
    let v = sessionStorage.getItem(KEY);
    if (!v) {
      v = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
        .replace(/-/g, '').slice(0, 20);
      sessionStorage.setItem(KEY, v);
    }
    return v;
  } catch { return 'nostore'; }
}

/** Coarse device class. Not a fingerprint — three buckets, from width alone. */
function device() {
  try {
    const w = window.innerWidth;
    return w < 640 ? 'm' : w < 1024 ? 't' : 'd';
  } catch { return '?'; }
}

export function track(e, props = {}) {
  try {
    const body = JSON.stringify({ e, s: sid(), ...props });
    // sendBeacon survives the page unloading, which is exactly when the most
    // interesting events fire.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* never let analytics break a page */ }
}

/** Mounted once in the layout. Records a pageview on every route change. */
export default function Track() {
  const path = usePathname();
  const last = useRef(null);

  useEffect(() => {
    if (last.current === path) return;   // React strict mode double-fires
    last.current = path;
    let r = '';
    try {
      const ref = document.referrer;
      r = ref && new URL(ref).host !== location.host ? new URL(ref).host : '';
    } catch { /* referrer host only, never the full URL */ }
    track(EVENTS.VIEW, { p: path, d: device(), r });
  }, [path]);

  useVitals(path);
  return null;
}

/**
 * Core Web Vitals, from real visits.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * LCP, CLS and INP have thresholds defined at the 75th percentile of REAL
 * page loads — 2.5s, 0.1 and 200ms. That is a number no laptop can produce.
 * Lighthouse gives a lab simulation on hardware nobody has; a browser pane
 * on a developer's machine gives nothing at all when the tab is hidden,
 * because paint timings do not fire in a background tab. This site has been
 * shipping performance work — the map's aspect ratio, the three-dependency
 * rule, hand-written SVG instead of a chart library — against no evidence
 * about anybody's actual experience.
 *
 * ── WHY NO LIBRARY ─────────────────────────────────────────────────────────
 * web-vitals is the usual answer and it is a fourth npm dependency. Everything
 * needed is native: three PerformanceObservers, all with buffered:true so
 * entries that fired before this component mounted are still counted.
 *
 * ── WHEN IT SENDS ──────────────────────────────────────────────────────────
 * Once, when the page is hidden or being unloaded, because none of the three
 * is final before then: LCP can be superseded by a later paint, CLS
 * accumulates across the whole visit, and INP is the worst interaction so far.
 * Sending on load would report a made-up early value for all three.
 *
 * visibilitychange rather than unload, which iOS Safari does not fire
 * reliably. The latch stops a tab that is hidden and re-shown from sending
 * twice.
 */
function useVitals(path) {
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;
    const v = { lcp: null, cls: 0, inp: 0 };
    const obs = [];
    const watch = (type, fn) => {
      try {
        const o = new PerformanceObserver(l => l.getEntries().forEach(fn));
        o.observe({ type, buffered: true });
        obs.push(o);
      } catch { /* a browser without this entry type reports nothing, not zero */ }
    };

    watch('largest-contentful-paint', e => { v.lcp = Math.round(e.startTime); });
    /* hadRecentInput excludes shifts a reader caused themselves by tapping —
       expanding a disclosure is not layout instability. */
    watch('layout-shift', e => { if (!e.hadRecentInput) v.cls += e.value; });
    watch('event', e => { if (e.duration > v.inp) v.inp = Math.round(e.duration); });

    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== 'hidden') return;
      sent = true;
      obs.forEach(o => { try { o.disconnect(); } catch {} });
      /* Null when nothing was measured — a page nobody interacted with has no
         INP, and reporting 0 would drag a percentile toward a number that
         never happened. */
      track(EVENTS.VITALS, {
        p: path, d: device(),
        lcp: v.lcp ?? undefined,
        cls: v.cls > 0 ? Number(v.cls.toFixed(4)) : 0,
        inp: v.inp > 0 ? v.inp : undefined,
      });
    };

    document.addEventListener('visibilitychange', send);
    return () => {
      document.removeEventListener('visibilitychange', send);
      obs.forEach(o => { try { o.disconnect(); } catch {} });
    };
  }, [path]);
}

/**
 * Fires TOOL_RUN once per tool per tab, on the first real interaction.
 *
 * Not on mount. A pageview already records that somebody arrived, and counting
 * arrivals as uses would make every tool look used and the number mean
 * nothing. `used()` is called by the tool at the point something actually
 * happened — a figure moved, a report ran, a project was picked.
 *
 * The latch is per tab and per tool, so a reader dragging a slider thirty
 * times is one use, which is the honest count.
 */
const RAN = new Set();
export function toolRun(tool) {
  if (!tool || RAN.has(tool)) return;
  RAN.add(tool);
  track(EVENTS.TOOL_RUN, { tool });
}

/** A hook for the common case: latch on the first change to any input. */
export function useToolRun(tool) {
  const fired = useRef(false);
  return useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    toolRun(tool);
  }, [tool]);
}
