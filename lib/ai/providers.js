/**
 * The three model providers, over plain fetch.
 *
 * NO SDK, DELIBERATELY. The site ships with three npm dependencies — next,
 * react, react-dom — and that is not an accident: every dependency is a supply
 * chain, a build cost and something that can break a deploy on a Tuesday. All
 * three providers expose ordinary HTTPS endpoints, streaming included, so the
 * SDKs would buy nothing here except a version to keep up with.
 *
 * Every function returns null when its key is absent rather than throwing. The
 * tools are built so the deterministic half works with no key at all: the
 * numbers come from the repo, the models only write around them.
 */

const timeout = (ms, signal) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  signal?.addEventListener('abort', () => c.abort());
  return { signal: c.signal, done: () => clearTimeout(t) };
};

export const configured = {
  perplexity: () => Boolean(process.env.PERPLEXITY_API_KEY),
  anthropic: () => Boolean(process.env.ANTHROPIC_API_KEY),
  gemini: () => Boolean(process.env.GEMINI_API_KEY),
};

/**
 * Perplexity, non-streaming. Returns { text, citations } or null.
 *
 * `citations` is the reason this provider is here at all: rule 9 says never
 * reproduce news, so what reaches a page is the link and the date, not the
 * body. Anything that comes back without citations is treated as unusable.
 */
export async function perplexity(messages, { model = 'sonar', maxTokens = 900, signal } = {}) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  const t = timeout(30_000, signal);
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
      signal: t.signal,
    });
    if (!res.ok) return { error: `Perplexity ${res.status}` };
    const json = await res.json();
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      citations: json.citations || json.search_results?.map(r => r.url) || [],
    };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Perplexity timed out' : e.message };
  } finally { t.done(); }
}

/** Perplexity, streaming. Returns the raw Response so a route can pipe it. */
export async function perplexityStream(messages, { model = 'sonar', maxTokens = 900, signal } = {}) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  return fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2, stream: true }),
    signal,
  });
}

/** Claude, for synthesis. Returns { text } or null. */
export async function claude(system, messages, { model = 'claude-sonnet-4-6', maxTokens = 1400, signal } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const t = timeout(45_000, signal);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, temperature: 0.2 }),
      signal: t.signal,
    });
    if (!res.ok) return { error: `Anthropic ${res.status}` };
    const json = await res.json();
    return { text: (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Claude timed out' : e.message };
  } finally { t.done(); }
}

/** Gemini vision. `parts` follows the REST shape: text and inline_data blocks. */
export async function gemini(parts, { model = 'gemini-2.5-flash', maxTokens = 1600, signal } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const t = timeout(60_000, signal);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        }),
        signal: t.signal,
      });
    if (!res.ok) return { error: `Gemini ${res.status}` };
    const json = await res.json();
    const text = (json.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join('');
    return { text };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Gemini timed out' : e.message };
  } finally { t.done(); }
}

/** Models return prose around JSON often enough that this is worth having. */
export function firstJson(text) {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  for (let end = body.length; end > start; end--) {
    try { return JSON.parse(body.slice(start, end)); } catch { /* keep shrinking */ }
  }
  return null;
}
