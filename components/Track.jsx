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

  return null;
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
