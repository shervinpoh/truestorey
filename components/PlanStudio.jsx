'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parsePlan, toSpec, buildBoxes, PAL } from '../lib/planparse.js';

/**
 * A floor plan in, a model of that unit out — entirely on the reader's machine.
 *
 * ── NOTHING IS UPLOADED, AND THAT IS THE ARCHITECTURE ──────────────────────
 * /floorplan already promises the image is discarded and never stored. Doing
 * the detection here rather than on a server is that promise being literally
 * true: the plan is decoded into a canvas, read, and never sent anywhere.
 *
 * It is also what makes the feature possible at all. The first design ran
 * Blender on a server per upload, which Vercel cannot do and which needed a
 * queue, a worker and somewhere to put the results. The geometry is
 * axis-aligned boxes, so an orthographic projection with a painter's algorithm
 * draws it in a few milliseconds with no dependency and no server. Reaching for
 * the tool I had just built instead of asking what the geometry needed cost a
 * day of the wrong answer.
 *
 * ── THE READER FIXES IT, AND THE FIX IS DRAWING A WALL ─────────────────────
 * The detector gets some rooms right and merges others. Measured on a real HDB
 * plan: three bedrooms and the kitchen correct, the two bathrooms found as one,
 * and the main bedroom wrongly merged with the living room.
 *
 * So the correction has to be cheap, and the smallest one that fixes what
 * actually fails is to draw the missing wall. Not dragging room boxes around —
 * a merge means one wall was not detected, and putting it back re-derives every
 * room from it. One gesture, and the geometry stays consistent because nothing
 * is edited by hand.
 *
 * ── WHAT IT WILL NOT CLAIM ─────────────────────────────────────────────────
 * The scale comes from the area the reader types, so proportions are exact and
 * the absolute scale moves with what that figure counts — about 2%, which is
 * 70mm on a 3.5m bedroom. It is not a survey and the page says so. Nothing here
 * is stored, so nothing here is verified by anybody.
 */

const KINDS = [
  ['living', 'Living'], ['dining', 'Dining'], ['master', 'Master bedroom'],
  ['bedroom', 'Bedroom'], ['kitchen', 'Kitchen'], ['bath', 'Bath / WC'],
  ['yard', 'Yard'], ['shelter', 'Store / shelter'], ['corridor', 'Corridor'],
  ['balcony', 'Balcony'], ['ledge', 'Aircon ledge'],
];
/* A balcony and an aircon ledge are the two spaces a published area usually
   does not count, and getting either wrong is the largest error in the method
   — about 2.5% on every dimension. Default them out. */
const EXCLUDED = new Set(['balcony', 'ledge']);
const ROOM_TINT = ['230,90,80', '70,150,200', '120,190,110', '240,180,70', '170,120,200',
  '90,200,195', '235,140,180', '150,160,90', '200,110,60', '110,130,220'];

export default function PlanStudio({ hdbNotes = null }) {
  const [img, setImg] = useState(null);
  const [parse, setParse] = useState(null);
  const [busy, setBusy] = useState(false);
  const [walls, setWalls] = useState([]);       // walls the reader drew
  const [kinds, setKinds] = useState({});
  const [area, setArea] = useState('');
  const [az, setAz] = useState(0.6);
  const planRef = useRef(null);
  const viewRef = useRef(null);
  const drag = useRef(null);

  const onFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const i = new Image();
    i.onload = () => { setImg(i); setWalls([]); setKinds({}); setParse(null); };
    i.src = URL.createObjectURL(f);
  };

  /* Detection is tens of milliseconds on a phone-sized plan and a few hundred
     on a large scan. Deferred a frame so the browser paints "reading…" first,
     rather than appearing to hang with nothing on screen. */
  useEffect(() => {
    if (!img) return;
    setBusy(true);
    const t = setTimeout(() => {
      const max = 1400;
      const k = Math.min(max / img.width, max / img.height, 1);
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, w, h);
      const { data } = cx.getImageData(0, 0, w, h);
      setParse({ ...parsePlan(data, w, h, walls), w, h });
      setBusy(false);
    }, 30);
    return () => clearTimeout(t);
  }, [img, walls]);

  /* the plan, with rooms tinted and the reader's own walls drawn over it */
  useEffect(() => {
    const cv = planRef.current;
    if (!cv || !img || !parse) return;
    cv.width = parse.w; cv.height = parse.h;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0, parse.w, parse.h);
    const { gx, gy, rooms } = parse;
    rooms.forEach((r, n) => {
      c.fillStyle = `rgba(${ROOM_TINT[n % ROOM_TINT.length]},0.34)`;
      for (const [i, j] of r.cells) c.fillRect(gx[i], gy[j], gx[i + 1] - gx[i], gy[j + 1] - gy[j]);
    });
    c.strokeStyle = '#164F52'; c.lineWidth = 5; c.lineCap = 'round';
    for (const wl of walls) {
      c.beginPath();
      if (wl.horizontal) { c.moveTo(wl.a, wl.pos); c.lineTo(wl.b, wl.pos); }
      else { c.moveTo(wl.pos, wl.a); c.lineTo(wl.pos, wl.b); }
      c.stroke();
    }
  }, [img, parse, walls]);

  const spec = parse && Number(area) > 0
    ? toSpec({ gx: parse.gx, gy: parse.gy, rooms: parse.rooms, h: parse.h, areaSqm: Number(area), kinds })
    : null;

  /* the model */
  const drawView = useCallback(() => {
    const cv = viewRef.current;
    if (!cv || !spec) return;
    let built;
    try { built = buildBoxes(spec); } catch { return; }
    const { boxes, span } = built;
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    c.fillStyle = `rgb(${PAL.ground.join(',')})`;
    c.fillRect(0, 0, W, H);
    const ELEV = 34 * Math.PI / 180;
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(ELEV), se = Math.sin(ELEV);
    const k = W / (span * 1.5);
    const px = (x, y, z) => [W / 2 + (x * ca - y * sa) * k,
      H / 2 - ((x * sa + y * ca) * se - z * ce) * k + span * k * 0.08];
    const depth = b => (b.x * sa + b.y * ca) * ce + b.z * se;
    for (const b of [...boxes].sort((p, q) => depth(p) - depth(q))) {
      const hx = b.sx / 2, hy = b.sy / 2, hz = b.sz / 2;
      const V = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
        [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]
        .map(([x, y, z]) => px(b.x + x, b.y + y, b.z + z));
      const faces = [[[4, 5, 6, 7], 1],
        sa > 0 ? [[0, 1, 5, 4], 0.74] : [[3, 2, 6, 7], 0.74],
        ca > 0 ? [[0, 3, 7, 4], 0.6] : [[1, 2, 6, 5], 0.6]];
      for (const [ix, shade] of faces) {
        c.beginPath();
        c.moveTo(...V[ix[0]]);
        for (let i = 1; i < ix.length; i++) c.lineTo(...V[ix[i]]);
        c.closePath();
        c.fillStyle = `rgb(${b.c.map(v => Math.round(v * shade)).join(',')})`;
        c.fill();
      }
    }
  }, [spec, az]);
  useEffect(() => { drawView(); }, [drawView]);

  /* drawing a wall: drag on the plan, snapped to the nearer axis */
  const planPoint = e => {
    const cv = planRef.current, r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height];
  };
  const onDown = e => { drag.current = planPoint(e); e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onUp = e => {
    if (!drag.current) return;
    const [x0, y0] = drag.current, [x1, y1] = planPoint(e);
    drag.current = null;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    if (Math.max(dx, dy) < 25) return;
    /* Snapped to whichever axis the drag was mostly along. A wall drawn at 3
       degrees off is a wall the grid cannot use, and asking someone to drag
       straight on a phone is asking for the feature to fail. */
    setWalls(w => [...w, dx > dy
      ? { horizontal: true, pos: Math.round((y0 + y1) / 2), a: Math.round(Math.min(x0, x1)), b: Math.round(Math.max(x0, x1)) }
      : { horizontal: false, pos: Math.round((x0 + x1) / 2), a: Math.round(Math.min(y0, y1)), b: Math.round(Math.max(y0, y1)) }]);
  };

  const setKind = (n, patch) => setKinds(k => ({ ...k, [n]: { ...k[n], ...patch } }));
  const scale = spec && parse
    ? Math.sqrt(Number(area) / parse.rooms.reduce((t, r, n) =>
      t + (kinds[n]?.exclude ? 0 : r.areaPx), 0))
    : null;

  return (
    <div className="studio">
      <div className="fld">
        <span className="lab">Your floor plan</span>
        <input type="file" accept="image/*" onChange={onFile} />
        <p className="hint" style={{ margin: '6px 0 0' }}>
          Read in this browser and never uploaded. Nothing leaves your device and nothing is stored.
        </p>
      </div>

      {img && (
        <>
          <div className="studiostage" onPointerDown={onDown} onPointerUp={onUp}>
            <canvas ref={planRef} />
            {busy && <span className="studiobusy mono">reading the plan…</span>}
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            {parse ? <><b>{parse.rooms.length} rooms found.</b> Where two rooms have run together,
              drag across the missing wall to split them. </> : 'Finding walls… '}
            {walls.length > 0 && (
              <button className="linkish" onClick={() => setWalls([])}>
                undo {walls.length} drawn wall{walls.length > 1 ? 's' : ''}
              </button>
            )}
          </p>

          <div className="fld" style={{ marginTop: 18 }}>
            <label>
              <span className="lab">Floor area of this unit (sqm)</span>
              <input type="number" value={area} min="1" step="0.1" placeholder="e.g. 90"
                onChange={e => setArea(e.target.value)} />
            </label>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              The one figure a plan always has. Every dimension is solved against it — metres per
              pixel is the square root of the area over the traced area.
            </p>
          </div>
        </>
      )}

      {parse && parse.rooms.length > 0 && (
        <table className="ttrooms">
          <thead><tr><th>Room</th><th>What it is</th>
            <th style={{ textAlign: 'right' }}>Size</th><th>Counts</th></tr></thead>
          <tbody>
            {parse.rooms.map((r, n) => {
              const xs = r.cells.flatMap(([i]) => [parse.gx[i], parse.gx[i + 1]]);
              const ys = r.cells.flatMap(([, j]) => [parse.gy[j], parse.gy[j + 1]]);
              const k = kinds[n] || {};
              return (
                <tr key={n}>
                  <td><i className="swatch" style={{ background: `rgb(${ROOM_TINT[n % ROOM_TINT.length]})` }} />
                    {k.name || `Room ${n + 1}`}</td>
                  <td>
                    <select value={k.kind || 'living'} onChange={e => {
                      const kind = e.target.value;
                      setKind(n, { kind, name: KINDS.find(x => x[0] === kind)[1],
                        exclude: EXCLUDED.has(kind) });
                    }}>
                      {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="m">{scale
                    ? `${((Math.max(...xs) - Math.min(...xs)) * scale).toFixed(2)}×${((Math.max(...ys) - Math.min(...ys)) * scale).toFixed(2)} · ${(r.areaPx * scale * scale).toFixed(1)} m²`
                    : '—'}</td>
                  <td><input type="checkbox" checked={!k.exclude}
                    onChange={e => setKind(n, { exclude: !e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {spec && (
        <figure className="ttable" style={{ marginTop: 20 }}>
          <div className="ttstage">
            <canvas ref={viewRef} width="1200" height="900" style={{ width: '100%', height: 'auto' }} />
          </div>
          <label className="ttctl">
            <span className="lab">Turn it</span>
            <input type="range" min="0" max="628" value={Math.round(az * 100)}
              onChange={e => setAz(Number(e.target.value) / 100)}
              aria-label="Rotate the model" />
          </label>
          <div className="note" style={{ marginTop: 14 }}>
            <b>Proportions are exact; the absolute scale is about 2% either way.</b> One scale factor
            is solved for the whole plan, so every room is right relative to every other room. What
            moves it is what your area figure counts — a balcony or aircon ledge on the wrong side
            shifts every dimension by roughly 2%, which is 70mm on a 3.5 metre bedroom. This is not
            a survey, and nothing here has been checked by a person.
          </div>
          {hdbNotes && (
            <div className="note method" style={{ marginTop: 12 }}>
              <b>If you took the area off an HDB transaction, read HDB&rsquo;s own note first.</b>{' '}
              The filed floor area is not always the area drawn on the plan, and this model is
              scaled entirely from that figure. HDB publishes this with the data:
              <span className="prov" style={{ display: 'block', marginTop: 8, whiteSpace: 'pre-line' }}>
                {hdbNotes}
              </span>
            </div>
          )}
        </figure>
      )}
    </div>
  );
}
