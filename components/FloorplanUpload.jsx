'use client';
import { useEffect, useRef, useState } from 'react';
import { floorplanQuestions } from '../lib/floorplan-questions.js';
import { byTheme, viewingChecklist, BEDS, CLEAR } from '../lib/floorplan.js';
import FacingSun from './FacingSun.jsx';
import ShareResult from './ShareResult.jsx';

/**
 * Reading a floor plan, as a report.
 *
 * One job above the rest still: the wall section must never read as a
 * determination. It is titled as questions, every entry ends in something to
 * ask a qualified person, and confidence is printed on each.
 *
 * The report is about living in the unit — zoning, privacy, getting around,
 * light, air, services, storage — not a description of the drawing. Sizes
 * and "which bed fits" appear only when the plan prints a size (see
 * lib/floorplan.js). A report can be shared as a link that carries the
 * report, never the image; the link is signed and checked before it shows.
 *
 * The image is resized in this browser, sent, read and discarded.
 */

/* Plans off a phone camera arrive at 4000px and 8MB. The reader sees 1568px
   at most, so the upload is resized here first: faster, and under the
   limit, and nothing leaves the browser that is not needed. */
async function shrink(file, max = 2000) {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    if (k === 1 && file.size < 3 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return blob ? new File([blob], 'plan.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

export default function FloorplanUpload() {
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState('idle');     // idle | reading | done | error | shared
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const input = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  /* A shared report: the link's fragment holds it; the server checks it. */
  useEffect(() => {
    const m = /(?:^#|&)r=([A-Za-z0-9_\-.]+)/.exec(window.location.hash);
    if (!m) return;
    setState('reading');
    fetch('/api/ai/floorplan/shared', { method: 'POST', body: JSON.stringify({ token: m[1] }) })
      .then(r => r.json().then(j => (r.ok ? j : Promise.reject(new Error(j.error)))))
      .then(j => { setResult({ ...j, share: m[1] }); setState('shared'); })
      .catch(e => { setError(e.message || 'That shared report could not be opened.'); setState('error'); });
  }, []);

  async function send(picked) {
    if (!picked) return;
    setError(''); setResult(null); setCopied(''); setState('reading');
    setPreview(URL.createObjectURL(picked));
    const file = await shrink(picked);
    if (file.size > 6 * 1024 * 1024) { setError('That image is over 6MB — try a smaller export.'); setState('error'); return; }
    const body = new FormData();
    body.append('image', file);
    try {
      const res = await fetch('/api/ai/floorplan', { method: 'POST', body });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'That did not work.');
      setResult(j); setState('done');
      if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    } catch (e) { setError(e.message); setState('error'); }
  }

  async function copy(text, what) {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(what); }
    catch { setCopied('failed'); }
  }

  const r = result?.isFloorPlan ? result : null;
  const shareUrl = () => `${window.location.origin}/floorplan#r=${result.share}`;
  const sized = r?.rooms?.some(x => x.printedSize);

  return (
    <>
      <div className="drop" aria-busy={state === 'reading'}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); send(e.dataTransfer.files?.[0]); }}>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
          onChange={e => send(e.target.files?.[0])} />
        {preview
          ? <img src={preview} alt="The plan you uploaded" className="dropimg" />
          : <div className="floorplan-empty">
              <span className="lab">{state === 'shared' ? 'Read your own plan' : 'Start with the image you were sent'}</span>
              <h2>Upload the floor plan.</h2>
              <p>A screenshot is fine. PNG, JPEG or WebP.</p>
            </div>}
        <button type="button" className="cta floorplan-choose"
          onClick={() => input.current?.click()} disabled={state === 'reading'}>
          {state === 'reading' ? 'Reading the plan — about half a minute…' : preview ? 'Choose another plan' : 'Choose a floor plan'}
        </button>
        <p className="floorplan-privacy">Read once, then discarded. No upload history.</p>
        <p className="vh" role="status" aria-live="polite">
          {state === 'reading' ? 'Reading the floor plan. The report will appear below.' : ''}
        </p>
      </div>

      {error && <div className="warn" style={{ marginTop: 18 }}><p style={{ margin: 0 }}>{error}</p></div>}

      {result && !result.isFloorPlan && (
        <div className="warn" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }}>That does not look like a floor plan.</p>
        </div>
      )}

      {r && (
        <article className="fpreport" aria-labelledby="fp-title">
          {state === 'shared' && (
            <p className="note" style={{ marginTop: 0 }}>
              <b>A shared report.</b> The link carries the report, not the plan image — ask the
              sender for the plan to read it alongside.
            </p>
          )}

          <header className="fpreport-head">
            <span className="lab">Floor plan report</span>
            <h2 id="fp-title">{r.unit.type || 'This unit'}</h2>
            {r.unit.summary && <p>{r.unit.summary}</p>}
            <dl className="fpfacts">
              <div><dt>Bedrooms</dt><dd>{r.unit.bedrooms ?? '—'}</dd></div>
              <div><dt>Bathrooms</dt><dd>{r.unit.bathrooms ?? '—'}</dd></div>
              <div><dt>Area on the plan</dt><dd>{r.unit.printedArea || 'Not printed'}</dd></div>
              <div><dt>Facing</dt><dd>{r.facing.confidence === 'cannot tell' || !r.facing.reading ? 'Not shown' : r.facing.reading}</dd></div>
            </dl>
          </header>

          {byTheme(r.findings).map(g => (
            <section key={g.theme} className="fpgroup">
              <h3 className="sh"><span>{g.heading}</span></h3>
              {g.items.map((f, i) => (
                <div key={i} className="checkrow">
                  <div className="ch"><b>{f.observation}</b></div>
                  {f.whyItMatters && <p>{f.whyItMatters}</p>}
                </div>
              ))}
            </section>
          ))}

          {r.rooms.length > 0 && (
            <section className="fpgroup">
              <h3 className="sh"><span>Room by room</span></h3>
              <div className="tablewrap">
                <table className="fprooms">
                  <thead><tr><th>Room</th><th>Where</th><th>Windows</th>
                    {sized && <th>Size on the plan</th>}<th>Worth knowing</th></tr></thead>
                  <tbody>
                    {r.rooms.map((x, i) => (
                      <tr key={i}>
                        <td><b>{x.name}</b></td>
                        <td>{x.where}</td>
                        <td>{x.windows || '—'}</td>
                        {sized && <td className="mono">{x.printedSize
                          ? <>{x.printedSize} · {x.areaSqm} m²{x.bed && <><br />{x.bed === 'none of the standard sizes' ? 'no standard bed fits with walkways' : `fits a ${x.bed.toLowerCase()} bed`}</>}</>
                          : '—'}</td>}
                        <td>{[x.note, x.door].filter(Boolean).join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="prov">
                {sized
                  ? <>Sizes as printed on the plan; areas and bed fits worked out from them. A bed fits
                    when it leaves {CLEAR.foot}m at the foot and {CLEAR.oneSide}m down one side (single
                    and super single) or {CLEAR.eachSide}m down both (queen, king). Mattresses at
                    Singapore sizes: {BEDS.map(b => `${b.name.toLowerCase()} ${Math.round(b.w * 100)}×${Math.round(b.l * 100)}cm`).join(', ')}.</>
                  : <>This plan prints no room sizes, so none are given. Measure at the viewing.</>}
              </p>
            </section>
          )}

          <FacingSun facing={r.facing} />

          <section className="fpgroup">
            <h3 className="sh"><span>Walls to ask about — not walls you can remove</span></h3>
            <p className="hint">A floor plan cannot show which walls are structural. These are questions
              for your interior designer and a qualified person.</p>
            {r.wallsToAskAbout.length > 0 ? r.wallsToAskAbout.map((w, i) => (
              <div key={i} className="checkrow">
                <div className="ch"><b>{w.where}</b><span className="mono pts">confidence: {w.confidence}</span></div>
                {w.whyItMatters && <p>{w.whyItMatters}</p>}
                <p style={{ marginTop: 4 }}><b>Ask:</b> {w.askYourQP}</p>
              </div>
            )) : <p className="hint">Nothing specific to flag from this plan.</p>}
          </section>

          {r.atTheViewing.length > 0 && (
            <section className="fpgroup">
              <h3 className="sh"><span>Check at the viewing</span></h3>
              <ol className="fpchecks">{r.atTheViewing.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </section>
          )}

          {r.cannotTell.length > 0 && (
            <section className="fpgroup">
              <h3 className="sh"><span>Not shown on this plan</span></h3>
              <ul className="fpnot">{r.cannotTell.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </section>
          )}

          <div className="fpactions">
            <button type="button" className="ghost" onClick={() => copy(viewingChecklist(r), 'checklist')}
              disabled={!r.atTheViewing.length}>{copied === 'checklist' ? 'Checklist copied' : 'Copy the viewing checklist'}</button>
            {floorplanQuestions(r.wallsToAskAbout) && (
              <button type="button" className="ghost" onClick={() => copy(floorplanQuestions(r.wallsToAskAbout), 'walls')}>
                {copied === 'walls' ? 'Questions copied' : 'Copy the wall questions'}</button>
            )}
            {copied === 'failed' && <span className="hint" role="status">Copy is unavailable here; select the text above.</span>}
          </div>

          {result.share
            ? <ShareResult tool="floorplan" title="Floor plan report — Truestorey" url={shareUrl}
                note={<p className="hint">The link carries this report, not your plan image.</p>} />
            : <p className="hint">Sharing is not available on this site right now.</p>}

          <p className="prov" style={{ marginTop: 18 }}>
            A reading of the drawing by a vision model, held to published rules — not a survey. Printed
            figures are transcribed; nothing is measured off the drawing. No valuation, rent or
            renovation cost is given. {state === 'shared' ? 'Shared as a signed link.' : 'Your image was read and discarded.'}
          </p>
        </article>
      )}
    </>
  );
}
