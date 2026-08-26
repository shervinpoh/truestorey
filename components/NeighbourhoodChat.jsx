'use client';
import { useRef, useState } from 'react';

/**
 * Live retrieval, streamed, with the sources as links.
 *
 * Reads the provider's own SSE stream directly rather than through an SDK. The
 * shape is stable and small: lines of `data: {...}` carrying deltas, ending in
 * `data: [DONE]`. Translating that into another library's protocol would add a
 * dependency and a second thing to keep in step.
 *
 * The sources panel is not a footnote. Rule 9 — this site links reporting and
 * never reproduces it — and a retrieval answer without its links is exactly
 * the thing that rule forbids.
 */
const SUGGESTIONS = [
  'What has been announced for Bishan in the last six months?',
  'Tengah — what is completing and when?',
  'Any policy change affecting HDB resale this quarter?',
];

export default function NeighbourhoodChat() {
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState([]);
  const [live, setLive] = useState('');
  const [sources, setSources] = useState([]);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const abort = useRef(null);
  const end = useRef(null);

  async function ask(text) {
    const question = (text ?? q).trim();
    if (!question || state === 'streaming') return;

    setQ(''); setError(''); setLive(''); setSources([]);
    setState('streaming');
    const history = [...turns, { role: 'user', content: question }];
    setTurns(history);

    abort.current?.abort();
    abort.current = new AbortController();

    try {
      const res = await fetch('/api/ai/neighbourhood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Retrieval failed.');
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = '', answer = '', cites = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) { answer += delta; setLive(answer); }
            const c = j.citations || j.search_results?.map(r => r.url);
            if (Array.isArray(c) && c.length) { cites = c; setSources(c); }
          } catch { /* a partial frame — the next chunk completes it */ }
        }
        end.current?.scrollIntoView({ block: 'end' });
      }

      setTurns(t => [...t, { role: 'assistant', content: answer, sources: cites }]);
      setLive(''); setState('idle');
    } catch (e) {
      if (e.name === 'AbortError') { setState('idle'); return; }
      setError(e.message); setState('error'); setLive('');
      setTurns(t => t.slice(0, -1));
    }
  }

  return (
    <>
      <form onSubmit={e => { e.preventDefault(); ask(); }}>
        <div className="fld">
          <label className="lab" htmlFor="nt-q" style={{ display: 'block', marginBottom: 6 }}>
            Ask about an estate, a town or a project
          </label>
          <input id="nt-q" value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
            placeholder="What has been announced for Bishan recently?" />
        </div>
        <div className="mapctl" style={{ marginTop: 12 }}>
          <button type="submit" className="mapopt" disabled={!q.trim() || state === 'streaming'}
            style={{ padding: '11px 16px' }}>
            {state === 'streaming' ? 'Searching…' : 'Ask'}
          </button>
          {state === 'streaming' && (
            <button type="button" className="mapopt" onClick={() => abort.current?.abort()}>Stop</button>
          )}
        </div>
      </form>

      {turns.length === 0 && state === 'idle' && (
        <ul className="idx" style={{ marginTop: 18 }}>
          {SUGGESTIONS.map(s => (
            <li key={s}>
              <button type="button" className="pickrow" onClick={() => ask(s)}>
                <span className="n">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="warn" style={{ marginTop: 18 }}><p style={{ margin: 0 }}>{error}</p></div>}

      <div style={{ marginTop: 22 }}>
        {turns.map((t, i) => (
          t.role === 'user' ? (
            <p key={i} className="askq"><b>{t.content}</b></p>
          ) : (
            <Answer key={i} text={t.content} sources={t.sources} />
          )
        ))}
        {live && <Answer text={live} sources={sources} streaming />}
        <div ref={end} />
      </div>
    </>
  );
}

function Answer({ text, sources = [], streaming = false }) {
  return (
    <div className="answer">
      {text.split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
      {streaming && <span className="caret" aria-hidden="true" />}
      {sources.length > 0 && (
        <>
          <span className="filtn" style={{ display: 'block', marginTop: 14 }}>Sources</span>
          <ul className="srcs">
            {sources.map(u => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer nofollow">{host(u)}</a>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ marginTop: 8 }}>
            Linked, not reproduced. Open the source before relying on anything above.
          </p>
        </>
      )}
    </div>
  );
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
