'use client';
import { useRef, useState } from 'react';
import AnswerText from './AnswerText.jsx';
import { splitAnswer, citedIndexes } from '../lib/answer.js';

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
 *
 * THE SOURCES LIST IS WHAT THE ANSWER CITED, NOT WHAT THE SEARCH TOUCHED. The
 * provider returns up to twenty results and the prose typically cites four, so
 * listing all twenty put Britannica, hotels.com and a travel blog under the
 * heading "Sources" beside claims that came from URA. That is a provenance
 * claim the answer does not support. The numbers on the chips are the same
 * numbers as the superscripts above them, so a reader can follow any sentence
 * to the page it came from — which is the only thing this panel is for.
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
            <Answer key={i} text={t.content} sources={t.sources}
              onAsk={i === turns.length - 1 && state === 'idle' ? ask : null} />
          )
        ))}
        {live && <Answer text={live} sources={sources} streaming />}
        <div ref={end} />
      </div>
    </>
  );
}

function Answer({ text, sources = [], streaming = false, onAsk = null }) {
  const { offIsland, body, followUps } = splitAnswer(text);

  /*
   * A question about somewhere else is refused, not answered. The refusal is
   * written here rather than by the model, so it says the same thing every
   * time and in the site's own voice; what arrives from the route is only the
   * subject, so the reader is told which of their own words put the question
   * out of scope instead of being told "Singapore only" and left guessing.
   */
  if (offIsland) {
    return (
      <div className="answer">
        <div className="note" style={{ marginTop: 0 }}>
          <b>This tracker covers Singapore only.</b> It read <span className="mono">{offIsland}</span> in
          that question and stopped there — it does not answer on markets outside Singapore, not
          even partly, because a half-answer about somewhere else is the last thing a Singapore
          property site should publish. Ask about a town, an estate, a project or a policy here.
        </div>
      </div>
    );
  }

  const used = citedIndexes(body);
  const shown = used.map(n => ({ n, url: sources[n - 1] })).filter(s => s.url);

  return (
    <div className="answer">
      <AnswerText text={body} sources={sources} />
      {streaming && <span className="caret" aria-hidden="true" />}

      {shown.length > 0 && (
        <>
          <span className="filtn" style={{ display: 'block', marginTop: 14 }}>Sources</span>
          <ul className="srcs">
            {shown.map(s => (
              <li key={s.n}>
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                  <span className="srcn">{s.n}</span>{host(s.url)}
                </a>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ marginTop: 8 }}>
            Linked, not reproduced. Open the source before relying on anything above.
          </p>
        </>
      )}

      {/* Absence of evidence must never read as evidence. An answer that cited
          nothing is not a sourced answer, and saying nothing here would let it
          pass as one. */}
      {!streaming && body.trim() && shown.length === 0 && (
        <div className="warn" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}><b>Nothing above carries a source.</b> Retrieval came back
            without citations, so treat this as unverified and check it before relying on it.</p>
        </div>
      )}

      {/*
        * IT USED TO OFFER AND YOU COULD NOT TAKE IT UP. Answers ended with "If
        * you want, I can also give: the Singapore property angle — the list of
        * states — the district called East Coast", which is a menu printed as a
        * sentence: nothing to click, and no way to accept short of retyping the
        * offer yourself. The route now forbids offering in prose and requires a
        * trailer instead, which arrives here as buttons that ask the question.
        */}
      {onAsk && followUps.length > 0 && (
        <>
          <span className="filtn" style={{ display: 'block', marginTop: 16 }}>Ask next</span>
          <ul className="nextq">
            {followUps.map(f => (
              <li key={f}><button type="button" onClick={() => onAsk(f)}>{f}</button></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
