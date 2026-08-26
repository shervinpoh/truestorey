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
  const url = process.env.NEXT_PUBLIC_WA_CHANNEL;
  if (!url) return null;
  return (
    <div className="note" style={{ marginTop: compact ? 20 : 28 }}>
      <b>Notes go out as they are written.</b> Short ones most days when something moves,
      a longer piece most weeks. <a href={url} target="_blank" rel="noopener noreferrer">Follow
      on WhatsApp</a> — no sign-up, and nothing on this site is ever held back for subscribers.
    </div>
  );
}
