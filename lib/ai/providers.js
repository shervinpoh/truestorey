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

/**
 * Gemini vision. `parts` follows the REST shape: text and inline_data blocks.
 *
 * MODEL PINNED 28 AUG 2026. This was `gemini-2.5-flash`, which Google has
 * since closed to new keys: an existing project keeps working, a key created
 * today gets a 404 reading "no longer available to new users". So /floorplan
 * was dead on a fresh key while looking configured, and the failure named the
 * model rather than the key, which is the opposite of where you look first.
 *
 * gemini-3.6-flash is what that 404 recommends. Note it is NOT in the
 * v1beta/models list this key can see and it works anyway — so listing models
 * is not a way to check this. Call it.
 *
 * The alternative is the floating `gemini-flash-latest` alias, which would not
 * break this way again. Not taken: every other rate and source in this repo
 * carries an explicit version and a review date, and a model that silently
 * changes underneath a compliance-sensitive page is the same class of problem
 * as a rate that drifts. Re-check this the way the rates are re-checked.
 */
/*
 * maxTokens 1600 -> 4096, because gemini-3.6-flash THINKS AND THE THINKING IS
 * CHARGED TO THIS BUDGET.
 *
 * The floor plan read came back as a 502 in production — "the reading came
 * back in a shape this page could not use" — while the identical call had
 * worked locally minutes earlier. It was not the key, the model or the image.
 * The response was being truncated mid-JSON, so firstJson() had nothing to
 * parse, and the numbers show how narrow it was: 942 thinking tokens plus 498
 * of actual answer against a 1600 ceiling. Think a little longer than that and
 * the JSON loses its closing brace.
 *
 * That is the worst shape of bug — it passes in dev, it passes on the retry,
 * and it fails for a reader. 4096 leaves the answer room whatever the model
 * spends on reasoning.
 */
export async function gemini(parts, { model = 'gemini-3.6-flash', maxTokens = 4096, signal } = {}) {
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
    // Name a truncation as a truncation. Without this the caller only sees
    // unparseable JSON and reports "a shape this page could not use", which
    // describes the symptom and hides the cause — the answer was cut off, and
    // the fix is a token budget, not a parser.
    const finish = json.candidates?.[0]?.finishReason;
    if (finish === 'MAX_TOKENS') {
      return { error: `Gemini ran out of output budget (thinking used ${json.usageMetadata?.thoughtsTokenCount ?? '?'} of ${maxTokens} tokens). Raise maxTokens.` };
    }
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
