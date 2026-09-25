'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { still } from './Motion.jsx';
import { titleCase } from '../lib/name.js';

/**
 * The island, as every block and project on it.
 *
 * ── WHY THE HOMEPAGE MAP CHANGED ───────────────────────────────────────────
 * Shervin, 26 Sep: the map on the front page "doesn't show me anything or
 * want to make the user excited to use the page." It shaded 24 HDB towns in
 * six pale teals on a pale card, so at a glance it was a grey island with a
 * faint smudge on it — and a town's median is the least interesting thing the
 * site knows. What the site actually holds is 12,934 blocks and projects,
 * each with its own filed median. Drawn as points of light on a dark card,
 * they ARE the island: the estates, the corridors, the empty catchment in the
 * middle. Nothing is drawn that the data does not contain (CLAUDE.md rule 13)
 * — there is no coastline here that a point did not put there.
 *
 * Brighter is dearer, within each kind of home: HDB, condo and landed are
 * ranked against their own kind (map.json's breaks), because one scale across
 * all three would light every condo and leave every flat dark. Point at one
 * to see what it is and what it filed at; press to open its page.
 *
 * ── MOTION ─────────────────────────────────────────────────────────────────
 * The points arrive west to east over about a second — the island filling
 * with data, which teaches what the picture is built from. Reduced motion,
 * a hidden tab (requestAnimationFrame does not run in one; see the Figure
 * note in CLAUDE.md) and a slow device all get the finished picture at once.
 * The card's box is reserved by CSS aspect-ratio before any script runs.
 */

/* Dim to bright, all in the data teal: on a dark ground brightness is the
   scale a reader reads without a legend. --acc-lit sits in the middle, which
   is its job — live data. */
const LIGHTS = ['#1E5559', '#27767C', '#3799A0', '#58BCC3', '#9ADFE2', '#E6FAF9'];
const KINDS = [
  { id: 'all', label: 'Everything' },
  { id: 0, label: 'HDB' },
  { id: 1, label: 'Condo' },
  { id: 2, label: 'Landed' },
];
const KIND_NAME = ['HDB block', 'Condo or apartment', 'Landed street'];

export default function IslandDots({ bbox, aspect, fallbackCounts }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [data, setData] = useState(null);
  const [labels, setLabels] = useState(null);
  const [kind, setKind] = useState('all');
  const [tip, setTip] = useState(null);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  const grid = useRef(null);
  const drawn = useRef(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetch('/api/island', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData).catch(e => { if (e?.name !== 'AbortError') setFailed(true); });
    return () => ctl.abort();
  }, []);

  const bandOf = useMemo(() => {
    if (!data) return () => 0;
    return (k, psf) => { const b = data.breaks[k] || []; let i = 0; while (i < b.length && psf > b[i]) i++; return i; };
  }, [data]);

  /* Draw, sized to the box and the screen's pixel density. */
  useEffect(() => {
    if (!data || !wrap.current || !canvas.current) return;
    const el = canvas.current;
    let raf = 0, alive = true;
    const [s, w, n, e] = bbox;
    const draw = animate => {
      const W = wrap.current.clientWidth, H = wrap.current.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
      el.style.width = `${W}px`; el.style.height = `${H}px`;
      const ctx = el.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pad = 10;
      const sx = (W - pad * 2) / (e - w), sy = (H - pad * 2) / (n - s);
      const k = Math.min(sx, sy);
      const ox = pad + ((W - pad * 2) - (e - w) * k) / 2, oy = pad + ((H - pad * 2) - (n - s) * k) / 2;
      /* Smaller on a phone, or 12,934 points at 310px wide merge into blobs. */
      const r = Math.max(0.75, Math.min(2.3, W / 560));
      const pts = [];
      for (let i = 0; i < data.pts.length; i++) {
        const [kd, la, lo, psf] = data.pts[i];
        if (kind !== 'all' && kd !== kind) continue;
        const lat = data.base.lat + la / 1e5, lon = data.base.lon + lo / 1e5;
        pts.push({ i, x: ox + (lon - w) * k, y: oy + (n - lat) * k, c: LIGHTS[bandOf(kd, psf)], band: bandOf(kd, psf) });
      }
      /* Dearest last, so the bright points sit on top of the dim ones. */
      pts.sort((a, b) => a.band - b.band);
      /* A 12px grid for pointing: nearest point without scanning 12,934. */
      const G = new Map();
      for (const p of pts) { const key = `${Math.floor(p.x / 12)},${Math.floor(p.y / 12)}`; (G.get(key) || G.set(key, []).get(key)).push(p); }
      grid.current = G;

      const paint = upto => {
        ctx.clearRect(0, 0, W, H);
        for (const p of pts) {
          if (p.x > upto) continue;
          ctx.fillStyle = p.c;
          ctx.globalAlpha = p.band >= 4 ? 0.95 : 0.8;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.band >= 4 ? r * 1.15 : r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      if (!animate) { paint(Infinity); return; }
      const t0 = performance.now(), dur = 1100;
      const step = now => {
        if (!alive) return;
        const t = Math.min(1, (now - t0) / dur);
        paint(W * (1 - (1 - t) ** 3) + 4);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      /* If the frame never comes (a background tab), the finished picture
         must still be what is left on the canvas. */
      setTimeout(() => { if (alive) { cancelAnimationFrame(raf); paint(Infinity); } }, dur + 400);
    };
    draw(!drawn.current && !still() && !document.hidden);
    drawn.current = true;
    const ro = new ResizeObserver(() => draw(false));
    ro.observe(wrap.current);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [data, kind, bbox, bandOf]);

  const nearest = (x, y) => {
    const G = grid.current; if (!G) return null;
    let best = null, bd = 12 * 12;
    const cx = Math.floor(x / 12), cy = Math.floor(y / 12);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const p of G.get(`${cx + dx},${cy + dy}`) || []) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
    }
    return best;
  };
  const ensureLabels = () => {
    if (labels) return;
    setLabels('loading');
    fetch('/api/island?labels=1').then(r => r.json()).then(j => setLabels(j.labels || [])).catch(() => setLabels([]));
  };
  const onMove = ev => {
    ensureLabels();
    const b = canvas.current.getBoundingClientRect();
    const p = nearest(ev.clientX - b.left, ev.clientY - b.top);
    setTip(p ? { p, x: p.x, y: p.y } : null);
  };
  const open = () => {
    if (!tip || !Array.isArray(labels)) return;
    const l = labels[tip.p.i];
    if (l?.[1]) router.push(l[1]);
  };

  const info = tip && data ? data.pts[tip.p.i] : null;
  const label = info && Array.isArray(labels) ? labels[tip.p.i]?.[0] : null;
  const counts = data?.counts || fallbackCounts;
  const total = counts ? (counts.hdb || 0) + (counts.condo || 0) + (counts.landed || 0) : null;

  return (
    <div className="islanddots">
      <div className="islanddots-top">
        <div>
          <span className="lab">Every block and project, lit by its filed price</span>
          {total ? <b className="islanddots-count">{total.toLocaleString('en-SG')} <span>places on the map</span></b> : null}
        </div>
        <div className="islanddots-kinds" role="group" aria-label="Show">
          {KINDS.map(k => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setTip(null); }}>{k.label}</button>
          ))}
        </div>
      </div>
      <div className="islanddots-map" ref={wrap} style={{ aspectRatio: aspect }}
        onPointerMove={onMove} onPointerLeave={() => setTip(null)} onClick={open}>
        <canvas ref={canvas} aria-label="Map of Singapore with every block and project drawn as a point, brighter where the filed price per square foot is higher" role="img" />
        {!data && !failed && <span className="islanddots-wait">Drawing the island…</span>}
        {failed && <span className="islanddots-wait">The map could not load. The full map is one click away.</span>}
        {tip && info && (
          <div className="islanddots-tip" style={{ left: tip.x, top: tip.y }}>
            <b>{label ? titleCase(label) : KIND_NAME[info[0]]}</b>
            <span>S${info[3].toLocaleString('en-SG')} psf median · {KIND_NAME[info[0]]}</span>
            {label && <em>Tap to open</em>}
          </div>
        )}
      </div>
      <div className="islanddots-foot">
        <span className="islanddots-scale" aria-hidden="true">
          <i>Cheaper</i>{LIGHTS.map(c => <s key={c} style={{ background: c }} />)}<i>Dearer</i>
        </span>
        <span className="prov">Median psf of filed sales, each kind ranked against its own ·{' '}
          {data?.source?.hdb || 'HDB Resale Flat Prices (data.gov.sg)'} · {data?.source?.private || 'URA Data Service'}
          {data?.source?.period ? ` · ${data.source.period.from} to ${data.source.period.to}` : ''}</span>
      </div>
    </div>
  );
}
