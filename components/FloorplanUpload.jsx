'use client';
import { useEffect, useRef, useState } from 'react';
import { floorplanQuestions } from '../lib/floorplan-questions.js';

/**
 * Reading a floor plan.
 *
 * The design carries one job above the rest: the wall section must never read
 * as a determination. It is titled as questions, every entry ends in something
 * to ask a qualified person, and confidence is printed on each. A page that
 * lets "this partition can come down" be skim-read is a page that gets
 * somebody to hack a structural wall.
 *
 * The image is sent, read and discarded. Nothing is stored.
 */
import FacingSun from './FacingSun.jsx';

export default function FloorplanUpload() {
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const input = useRef(null);

  /* Object URLs survive until they are explicitly released. Replacing a plan
     should not leave every previous image resident for the rest of the visit. */
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function send(file) {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { setError('That image is over 6MB — try a smaller export.'); setState('error'); return; }
    setError(''); setResult(null); setCopyState('idle'); setState('reading');
    setPreview(URL.createObjectURL(file));

    const body = new FormData();
    body.append('image', file);
    try {
      const res = await fetch('/api/ai/floorplan', { method: 'POST', body });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'That did not work.');
      setResult(j); setState('done');
    } catch (e) { setError(e.message); setState('error'); }
  }

  async function copyQuestions() {
    const text = floorplanQuestions(result?.wallsToAskAbout);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <>
      <div className="drop"
        aria-busy={state === 'reading'}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); send(e.dataTransfer.files?.[0]); }}>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
          onChange={e => send(e.target.files?.[0])} />
        {preview
          ? <img src={preview} alt="The plan you uploaded" className="dropimg" />
          : <div className="floorplan-empty">
              <span className="lab">Start with the image you were sent</span>
              <h2>Upload the floor plan.</h2>
              <p>A screenshot is fine. PNG, JPEG or WebP, up to 6MB.</p>
            </div>}
        <button type="button" className="cta floorplan-choose"
          onClick={() => input.current?.click()} disabled={state === 'reading'}>
          {state === 'reading' ? 'Reading the plan…' : preview ? 'Choose another plan' : 'Choose a floor plan'}
        </button>
        <p className="floorplan-privacy">Read once, then discarded. No upload history.</p>
        <p className="vh" role="status" aria-live="polite">
          {state === 'reading' ? 'Reading the floor plan. The result will appear below.' : ''}
        </p>
      </div>

      {error && <div className="warn" style={{ marginTop: 18 }}><p style={{ margin: 0 }}>{error}</p></div>}

      {result && !result.isFloorPlan && (
        <div className="warn" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }}>That does not look like a floor plan or an interior photograph.</p>
        </div>
      )}

      {result?.isFloorPlan && (
        <div className="floorplan-result" style={{ marginTop: 26 }}>
          <div className="result-heading">
            <span className="lab">What the image supports</span>
            <h2>The plan, separated from the assumptions.</h2>
          </div>
          {result.spatialHealth && (
            <div className="storeygrid">
              <div className="storeycard">
                <span className="filtn">What the layout suggests</span>
                <p>{result.spatialHealth.basis || 'The plan did not provide enough detail for a layout observation.'}</p>
              </div>
              <div className="storeycard">
                <span className="filtn">Which way it faces</span>
                <b className="statnum" style={{ fontSize: '1.5rem' }}>
                  {result.facing?.confidence === 'cannot tell' ? 'Not shown' : result.facing?.reading}
                </b>
                <p className="hint">
                  {result.facing?.note}{' '}
                  {result.facing?.confidence && <b>Confidence: {result.facing.confidence}.</b>}
                </p>
              </div>
            </div>
          )}

          {/* Astronomy from the compass reading above. It refuses when the
              plan carries no north arrow, which is about half of them. */}
          <FacingSun facing={result.facing} />

          {result.layout?.length > 0 && (
            <>
              <h2 className="sh" style={{ marginTop: 26 }}><span>The layout</span></h2>
              {result.layout.map((l, i) => (
                <div key={i} className="checkrow">
                  <div className="ch"><b>{l.observation}</b></div>
                  <p>{l.impact}</p>
                </div>
              ))}
            </>
          )}

          <h2 className="sh" style={{ marginTop: 26 }}><span>Walls to ask about — not walls you can remove</span></h2>
          <div className="note">
            <b>A floor plan cannot tell you which walls are structural.</b> Nothing below is a
            determination. These are the questions to put to your interior designer and to a
            qualified person, who are the only people who can answer them.
          </div>
          {result.wallsToAskAbout?.length > 0 ? result.wallsToAskAbout.map((w, i) => (
            <div key={i} className="checkrow">
              <div className="ch">
                <b>{w.where}</b>
                <span className="mono pts">confidence: {w.confidence}</span>
              </div>
              <p>{w.whyItMatters}</p>
              <p style={{ marginTop: 4 }}><b>Ask:</b> {w.askYourQP}</p>
            </div>
          )) : <p className="hint">Nothing specific to flag from this plan.</p>}

          {floorplanQuestions(result.wallsToAskAbout) && (
            <div className="floorplan-next">
              <button type="button" className="ghost" onClick={copyQuestions}>
                {copyState === 'copied' ? 'Questions copied' : 'Copy these questions'}
              </button>
              <span className="hint" role="status">
                {copyState === 'failed' ? 'Copy unavailable here. You can select the questions above.' :
                  copyState === 'copied' ? 'Show them to a qualified person before planning alterations.' : ''}
              </span>
            </div>
          )}

          {result.renovationNotes?.length > 0 && (
            <>
              <h2 className="sh" style={{ marginTop: 26 }}><span>Worth knowing</span></h2>
              <ul className="idx" style={{ listStyle: 'disc', paddingLeft: 20 }}>
                {result.renovationNotes.map((n, i) => <li key={i} style={{ padding: '5px 0' }}>{n}</li>)}
              </ul>
            </>
          )}

          {result.cannotTell?.length > 0 && (
            <>
              <h2 className="sh" style={{ marginTop: 26 }}><span>What this image does not show</span></h2>
              <ul className="idx" style={{ listStyle: 'disc', paddingLeft: 20 }}>
                {result.cannotTell.map((n, i) => <li key={i} style={{ padding: '5px 0' }}>{n}</li>)}
              </ul>
            </>
          )}

          <p className="prov" style={{ marginTop: 22 }}>
            {result.disclaimer}<br />
            Your image was read and discarded. Nothing was stored.
          </p>
        </div>
      )}
    </>
  );
}
