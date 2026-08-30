'use client';
import { useEffect, useRef, useState } from 'react';
import { still } from './Motion.jsx';

/**
 * A record page's own table of contents, pinned under the global nav.
 *
 * These pages run to five or six thousand pixels: the figures, the fork, the
 * monthly chart, every filed sale, the floor premium, what is within reach,
 * the proceeds waterfall. All of it is worth having and none of it is worth
 * scrolling past to find the one part you came for. So the sections name
 * themselves, and the bar says which one you are in.
 *
 * ONLY SECTIONS THAT EXIST. Items are filtered against the DOM on mount rather
 * than assumed: a block with no Tower View data has no #floor, and a link that
 * scrolls nowhere is worse than one fewer link. Filtering happens after paint
 * because the anchors live in sibling components.
 *
 * The active item comes from scroll position rather than IntersectionObserver
 * thresholds. Sections here vary from 200px to 2,000px tall, so "which section
 * is intersecting" is frequently several of them; "which section head did I
 * last pass" is the question a reader is actually asking, and it has one
 * answer at every scroll offset.
 */
const ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Price history' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'floor', label: 'Floor premium' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'proceeds', label: 'Sale proceeds' },
];

/** Matches scroll-margin-top in globals.css, plus the sticky bars above it. */
const OFFSET = 120;

export default function SectionNav() {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    setItems(ITEMS.filter(i => document.getElementById(i.id)));
  }, []);

  useEffect(() => {
    if (!items.length) return;
    // Read straight off the scroll event, with no requestAnimationFrame
    // throttle. rAF DOES NOT RUN IN A BACKGROUND TAB, and a throttle that
    // latches a "frame pending" flag which is then never cleared stops the
    // handler permanently rather than slowing it down — this repo has now
    // been bitten by background-tab rAF three times, in Motion.jsx, in the
    // map's flyTo and here. Six getBoundingClientRect reads per scroll event
    // is cheap, and the browser already coalesces scroll to about frame rate.
    const onScroll = () => {
      let current = items[0].id;
      for (const i of items) {
        const el = document.getElementById(i.id);
        if (el && el.getBoundingClientRect().top <= OFFSET) current = i.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [items]);

  // Keep the active chip in view on a narrow screen, where the bar scrolls
  // sideways and the section you are in is often off the end of it.
  useEffect(() => {
    if (!active || !barRef.current) return;
    const chip = barRef.current.querySelector(`[data-id="${active}"]`);
    if (!chip) return;
    const bar = barRef.current;
    const left = chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: still() ? 'auto' : 'smooth' });
  }, [active]);

  if (items.length < 2) return null;

  return (
    <nav className="secnav" aria-label="On this page">
      <div className="secnavin" ref={barRef}>
        {items.map(i => (
          <a key={i.id} href={`#${i.id}`} data-id={i.id}
            aria-current={active === i.id ? 'true' : undefined}>{i.label}</a>
        ))}
      </div>
    </nav>
  );
}
