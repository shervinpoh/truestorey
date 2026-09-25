'use client';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/**
 * Follow the WhatsApp channel — one component for every place it appears.
 *
 * It was a text link at the end of each note and nowhere else, so the only
 * readers who ever saw it were the ones already reading notes. Shervin, 25 Sep:
 * put it on the Blindspot result and the footer, and make it obvious.
 *
 * Obvious, not loud. A button in the interface teal with the WhatsApp mark,
 * never WhatsApp green: green on this site means a price that moved, and a
 * green button would borrow that meaning. The mark is monochrome and takes the
 * button's colour.
 *
 * WHAT IT MAY PROMISE. Nothing about frequency — how often notes go out is
 * Shervin's call on any given week, and a stated cadence that lapses is the
 * kind of promise this site keeps refusing to make. What it can say is true
 * every day: it is free, it needs no sign-up, and nothing on the site is held
 * back for followers. The channel is reach, not a lead list (NEXT.md §8.8) —
 * followers cannot be exported or messaged, so this collects nobody.
 *
 * Renders nothing when NEXT_PUBLIC_WA_CHANNEL is unset: an empty promise is
 * worse than no promise.
 */
const URL = process.env.NEXT_PUBLIC_WA_CHANNEL;

export function WhatsAppMark({ size = 18 }) {
  return (
    <svg className="wamark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * @param where   'footer' | 'blindspot' | 'insights' — recorded on click, so
 *                it is visible which placement people actually use.
 * @param variant 'band' (the footer), 'panel' (end of a note), 'row' (a single
 *                line inside another block, as on the Blindspot result).
 */
export default function FollowWhatsApp({ where, variant = 'panel', lead = null }) {
  if (!URL) return null;
  const onClick = () => track(EVENTS.FOLLOW, { where });
  const button = (
    <a className="wafollow-btn" href={URL} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      <WhatsAppMark /> Follow on WhatsApp
    </a>
  );

  if (variant === 'row') {
    return (
      <div className="wafollow row">
        <p>{lead || 'New notes and data updates go out on a WhatsApp channel.'}</p>
        {button}
      </div>
    );
  }

  return (
    <div className={`wafollow ${variant}`}>
      <div className="wafollow-say">
        <span className="lab">The Truestorey channel</span>
        <p className="wafollow-head">{lead || 'New notes and data updates, on WhatsApp.'}</p>
        <p className="wafollow-sub">Free and one-way: no sign-up, no messages to reply to, and nothing
          on this site is held back for followers. Leave whenever you like.</p>
      </div>
      {button}
    </div>
  );
}
