/**
 * Sending email, over plain fetch.
 *
 * NO SDK, for the reason lib/ai/providers.js gives: three npm dependencies is
 * the architecture, and Resend's send endpoint is one POST with a bearer token.
 *
 * Returns null when RESEND_API_KEY is absent, exactly like every provider in
 * this repo, so a deployment without it renders the subscribe form, refuses
 * the subscription honestly, and never 500s a page.
 *
 * WHY RESEND AND NOT SMTP. SMTP from a serverless function needs a long-lived
 * connection, a pooled transport and a dependency to manage both. This is an
 * HTTPS call. If it is ever swapped, the only thing that has to change is the
 * body shape below.
 *
 * ⚠ THE FROM ADDRESS MUST BE ON A VERIFIED DOMAIN. Resend rejects anything
 * else, and the rejection is a 403 naming the domain rather than the key —
 * which, as with the Gemini 404 in providers.js, is the opposite of where
 * anyone looks first.
 */

export const configured = () => Boolean(process.env.RESEND_API_KEY && process.env.DIGEST_FROM);

const timeout = (ms, signal) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  signal?.addEventListener('abort', () => c.abort());
  return { signal: c.signal, done: () => clearTimeout(t) };
};

/**
 * One email. Returns { id } or { error }, never throws.
 *
 * `text` is required, not optional. An HTML-only email is a spam signal and a
 * screen reader's problem, and the plain-text part is the one a Gmail preview
 * actually shows.
 */
export async function send({ to, subject, html, text, unsubscribeUrl, signal }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  if (!key || !from) return null;
  if (!to || !subject || !text) return { error: 'send() needs to, subject and text' };

  const t = timeout(20_000, signal);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to, subject, html, text,
        /*
         * One-click unsubscribe, in the headers as well as the body.
         *
         * PDPA s45 gives fifteen days to action a withdrawal, and Gmail and
         * Yahoo both require these headers for bulk senders. Both reasons say
         * the same thing: a person must be able to leave without writing to
         * anybody. The body link is not enough on its own.
         */
        ...(unsubscribeUrl ? {
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        } : {}),
      }),
      signal: t.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { error: `Resend ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}` };
    }
    const json = await res.json();
    return { id: json.id };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Resend timed out' : e.message };
  } finally { t.done(); }
}
