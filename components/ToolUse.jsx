'use client';
import { useEffect } from 'react';
import { toolRun } from './Track.jsx';

/**
 * Records that a tool was actually USED, not merely opened.
 *
 * ── WHY A LISTENER AND NOT A CALL INSIDE EACH TOOL ─────────────────────────
 * Eleven tools keep their state eleven different ways — sliders, selects, a
 * file upload, a chat box — and threading a "fire once" call through each
 * would put analytics inside eleven calculation paths for one number. This
 * sits on the page instead and waits for the first real interaction. One line
 * per tool, and no tool has to know it is being counted.
 *
 * ── NOT ON MOUNT ───────────────────────────────────────────────────────────
 * A pageview already records arrival. If arriving counted as using, every
 * tool would look used and the figure would answer nothing — which is the
 * whole reason for adding it, since NEXT.md says measure before judging a
 * specialist tool by taste.
 *
 * ── THE NAV IS NOT THE TOOL ────────────────────────────────────────────────
 * The search box and the menu are on every page, so typing an address into
 * the masthead while standing on /plan would otherwise count as using /plan.
 * Events originating inside the nav, the footer or the menu are ignored, and
 * that check is why this can be trusted as a tool count rather than an
 * interaction count.
 *
 * Fires once per tool per tab. Someone dragging a slider thirty times is one
 * use, which is the honest number. Sends nothing but the tool's id — see the
 * allowlist in lib/analytics.js, which drops anything else.
 */
const TYPES = ['input', 'change', 'submit'];
const OUTSIDE = '.gnav, .site, .navmenu, .navpanel, footer';

export default function ToolUse({ id }) {
  useEffect(() => {
    if (!id) return;
    const fire = (e) => {
      if (e.target?.closest?.(OUTSIDE)) return;
      toolRun(id);
      off();
    };
    const off = () => TYPES.forEach(t => document.removeEventListener(t, fire, true));
    TYPES.forEach(t => document.addEventListener(t, fire, true));
    return off;
  }, [id]);
  return null;
}
