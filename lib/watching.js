/**
 * Which blocks THIS DEVICE is watching.
 *
 * ── WHY THIS IS NOT AN ACCOUNT ─────────────────────────────────────────────
 * The site has no sign-up and that is the whole strategic position, so there
 * is no identity to hang a "my watches" page on. The email address IS the
 * subscription: the server knows it, every digest carries a one-click stop,
 * and nothing about that needs a password.
 *
 * What was missing is smaller and more human. Somebody confirms a watch,
 * lands on a page that congratulates them, and then the site never mentions
 * it again — go back to the same block a week later and it offers to sign you
 * up as though you had never been there. The subscription was real and
 * completely invisible.
 *
 * So the BROWSER remembers, and only the browser. No account, nothing sent,
 * nothing that can identify anyone. It is a note this device keeps for its
 * own reader.
 *
 * ── WHICH MEANS IT IS ALLOWED TO BE WRONG ──────────────────────────────────
 * Clear the browser and the note is gone while the subscription lives on;
 * subscribe on a phone and a laptop knows nothing about it. That is why every
 * surface reading this says "on this device" rather than "your watches", and
 * why nothing here is ever used to decide whether somebody IS subscribed —
 * only whether to remind them that they might be. The server decides the
 * truth; this decides the wording.
 *
 * Every read and write is wrapped: a private window, cleared site data or a
 * browser set to refuse storage must leave the page working exactly as it did
 * before any of this existed.
 */

const KEY = 'truestorey.watching';

/** Hrefs this device believes it is watching. Always an array. */
export function watching() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter(h => typeof h === 'string' && h.startsWith('/')) : [];
  } catch { return []; }
}

export function isWatching(href) {
  return Boolean(href) && watching().includes(href);
}

/** Idempotent — confirming the same block twice must not list it twice. */
export function remember(href) {
  if (!href || !String(href).startsWith('/')) return watching();
  try {
    const next = [...new Set([href, ...watching()])].slice(0, 50);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch { return watching(); }
}

/**
 * Forget one locally. NOT an unsubscribe — the server has never heard of this
 * list. Callers must say so, or a reader will think they have stopped the
 * emails by tidying a page.
 */
export function forget(href) {
  try {
    const next = watching().filter(h => h !== href);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch { return watching(); }
}
