'use client';
import { useEffect, useRef } from 'react';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/**
 * Records which of the three guided paths a reader took.
 *
 * The whole navigation rebuild rests on an untested belief: that people would
 * rather choose a situation than a tool. A pageview on /tools/buying says
 * somebody arrived there, and comparing the three against each other and
 * against "Browse every tool" is what says whether the belief was right — or
 * whether everyone still walks past them to the full index.
 *
 * Fires on arrival rather than on interaction, unlike ToolUse: choosing the
 * situation IS the interaction being measured. The id and nothing else.
 */
export default function SituationSeen({ id }) {
  const last = useRef(null);
  useEffect(() => {
    if (!id || last.current === id) return;   // strict mode double-fires
    last.current = id;
    track(EVENTS.SITUATION, { id });
  }, [id]);
  return null;
}
