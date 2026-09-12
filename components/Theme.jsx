'use client';
import { useEffect, useState } from 'react';

/**
 * Light or dark, chosen by the reader and remembered.
 *
 * ── WHY IT IS NOT prefers-color-scheme ─────────────────────────────────────
 * That was tried and rejected, and the note above the dark palette in
 * globals.css says why: "The site is WHITE. It used to follow the operating
 * system, which meant anyone with dark mode on their Mac — most people — got
 * a black site, and that is not what this is."
 *
 * So the decision being honoured here is narrow and exact. The site defaults
 * to white for everybody, every time, and dark is something a reader asks
 * for. The same note ends "only applies when something explicitly sets
 * data-theme. Nothing does today" — this is that something, and it is a
 * choice rather than an inference about somebody's laptop.
 *
 * Two states, not three. A "System" option would reintroduce the behaviour
 * that was removed, wearing a label.
 *
 * ── THE FLASH, AND WHY THE SCRIPT IS IN THE HEAD ───────────────────────────
 * A theme read in an effect is a theme applied after first paint, which is a
 * white flash on every navigation for exactly the readers who asked not to
 * see one. The attribute is set by a blocking inline script in app/layout.jsx
 * before the body renders; this component only reflects and changes it.
 *
 * `mounted` exists for the same reason: the server cannot know what is in
 * localStorage, so rendering the label before hydration would print the wrong
 * one and then correct itself in front of the reader.
 */
export default function Theme() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    if (next) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    /* A preference that does not survive the next page is not a preference.
       Wrapped because Safari in private browsing throws on write, and a
       theme toggle is not worth an unhandled exception. */
    try { localStorage.setItem('truestorey-theme', next ? 'dark' : 'light'); } catch {}
  }

  return (
    <button type="button" className="themetog" onClick={toggle}
      aria-pressed={mounted ? dark : undefined}
      /* The label says what pressing it DOES, not what the state is. A button
         reading "Dark" beside a dark page is ambiguous about which it means. */
      aria-label={mounted && dark ? 'Switch to the light theme' : 'Switch to the dark theme'}>
      <span aria-hidden="true" className="themedot" />
      {mounted && dark ? 'Light' : 'Dark'}
    </button>
  );
}
