'use client';
import { useRef, useState } from 'react';

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
export default function FloorplanUpload() {
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const input = useRef(null);

  async function send(file) {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { setError('That image is over 6MB — try a smaller export.'); setState('error'); return; }
    setError(''); setResult(null); setState('reading');
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

  return (
    <>
      <div className="drop"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); send(e.dataTransfer.files?.[0]); }}>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
          onChange={e => send(e.target.files?.[0])} />
        {preview
          ? <img src={preview} alt="The plan you uploaded" className="dropimg" />
          : <p className="hint" style={{ margin: 0 }}>Drop a floor plan here, or choose a file. PNG, JPEG or WebP, up to 6MB.</p>}
        <button type="button" className="mapopt" style={{ marginTop: 14 }}
          onClick={() => input.current?.click()} disabled={state === 'reading'}>
          {state === 'reading' ? 'Reading…' : preview ? 'Try another' : 'Choose a file'}
        </button>
      </div>

      {error && <div className="warn" style={{ marginTop: 18 }}><p style={{ margin: 0 }}>{error}</p></div>}

      {result && !result.isFloorPlan && (
        <div className="warn" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }}>That does not look like a floor plan or an interior photograph.</p>
        </div>
      )}

      {result?.isFloorPlan && (
        <div style={{ marginTop: 26 }}>
          {result.spatialHealth && (
            <div className="storeygrid">
              <div className="storeycard">
                <span className="filtn">Layout efficiency</span>
                <b className="statnum">{result.spatialHealth.score}<em style={{ fontSize: '1.1rem', fontStyle: 'normal', color: 'var(--mute)' }}> / 10</em></b>
                <p className="hint">{result.spatialHealth.basis}</p>
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

          {result.layout?.length > 0 && (
            <>
              <div className="sh" style={{ marginTop: 26 }}><span>The layout</span></div>
              {result.layout.map((l, i) => (
                <div key={i} className="checkrow">
                  <div className="ch"><b>{l.observation}</b></div>
                  <p>{l.impact}</p>
                </div>
              ))}
            </>
          )}

          <div className="sh" style={{ marginTop: 26 }}><span>Walls to ask about — not walls you can remove</span></div>
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

          {result.renovationNotes?.length > 0 && (
            <>
              <div className="sh" style={{ marginTop: 26 }}><span>Worth knowing</span></div>
              <ul className="idx" style={{ listStyle: 'disc', paddingLeft: 20 }}>
                {result.renovationNotes.map((n, i) => <li key={i} style={{ padding: '5px 0' }}>{n}</li>)}
              </ul>
            </>
          )}

          {result.cannotTell?.length > 0 && (
            <>
              <div className="sh" style={{ marginTop: 26 }}><span>What this image does not show</span></div>
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
