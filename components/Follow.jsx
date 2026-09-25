import FollowWhatsApp from './FollowWhatsApp.jsx';

/**
 * How to get the next one.
 *
 * Deliberately NOT a gate and not an email wall — everything on this site is
 * readable without giving anything up, and a subscribe box that blocks the
 * text would contradict the whole position. This is an offer at the end,
 * which people take or ignore.
 *
 * Points at a WhatsApp channel because that is the channel he actually has.
 * With NEXT_PUBLIC_WA_CHANNEL unset it renders nothing rather than a dead
 * button — an empty promise is worse than no promise.
 */
export default function Follow({ compact = false }) {
  /* The same component as the footer and the Blindspot result, so the offer
     reads and looks the same wherever it is made. */
  return (
    <div style={{ marginTop: compact ? 20 : 28 }}>
      <FollowWhatsApp where="insights" variant="panel" />
    </div>
  );
}
