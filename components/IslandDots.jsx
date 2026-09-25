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
 * six pale teals, so at a glance it was a grey island with a faint smudge on
 * it — and a town's median is the least interesting thing the site knows.
 * What the site holds is 12,934 blocks and projects, each with its own filed
 * median. Drawn as points they ARE the island: the estates, the corridors,
 * the empty catchment in the middle. Nothing is drawn that the data does not
 * contain (CLAUDE.md rule 13) — no coastline a point did not put there.
 *
 * ── THE COLOURS ────────────────────────────────────────────────────────────
 * A first version put the points on a near-black card, teal-to-white. It
 * read as somebody else's site — the one dark slab on a warm page — and he
 * said so. The points now sit on the island card in the site's own teal,
 * paler for cheaper and deeper for dearer: a six-step ordinal ramp validated
 * (dataviz validateOrdinal) for monotone lightness, visible steps and a
 * palest step that still clears 2:1 on the card, which the old choropleth's
 * #CDE9E9 did not. Dark mode has its own ramp, brighter for dearer. Both are
 * --dot-1…6 in globals.css, read at draw time, so a theme switch repaints.
 *
 * Each kind of home is ranked within its own kind (map.json's breaks):
 * one scale across all three would paint every condo dark and every flat
 * pale. Point at one to see what it is; press to open its page.
 *
 * ── MOTION ─────────────────────────────────────────────────────────────────
 * The points arrive west to east over about a second — the island filling
 * with data. Reduced motion, a hidden tab (requestAnimationFrame does not run
 * in one; see the Figure note in CLAUDE.md) and a slow device all get the
 * finished picture at once. The box is reserved by CSS aspect-ratio first.
 */

/* The ramp lives in CSS (--dot-1…6) so the two themes can differ. */
const dots = () => {
  const cs = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5, 6].map(i => cs.getPropertyValue(`--dot-${i}`).trim() || '#2D7D85');
};
const KINDS = [
  { id: 'all', label: 'Everything' },
  { id: 0, label: 'HDB' },
  { id: 1, label: 'Condo' },
  { id: 2, label: 'Landed' },
];
const KIND_NAME = ['HDB block', 'Condo or apartment', 'Landed street'];

export default function IslandDots({ bbox, aspect }) {
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
      const LIGHTS = dots();
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
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
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
    const mo = new MutationObserver(() => draw(false));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); };
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
  const shown = kind === 'all' ? null : data?.breaks?.[kind];

  return (
    <div className="islanddots">
      <div className="seg islanddots-kinds" role="group" aria-label="Show">
        {KINDS.map(k => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setTip(null); }}>{k.label}</button>
        ))}
      </div>
      <div className="islanddots-map" ref={wrap} style={{ aspectRatio: aspect }}
        onPointerMove={onMove} onPointerLeave={() => setTip(null)} onClick={open}>
        <canvas ref={canvas} aria-label="Map of Singapore with every block and project drawn as a point, darker where the filed price per square foot is higher" role="img" />
        {!data && !failed && <span className="islanddots-wait">Drawing the island…</span>}
        {failed && <span className="islanddots-wait">The map could not load. The full map is one click away.</span>}
        {tip && info && (
          <div className="islanddots-tip" style={{ left: tip.x, top: tip.y }}>
            <b>{label ? titleCase(label) : KIND_NAME[info[0]]}</b>
            <span className="mono">S${info[3].toLocaleString('en-SG')} psf · {KIND_NAME[info[0]]}</span>
          </div>
        )}
      </div>
      <div className="islandkey">
        <div className="islandramp">
          <span className="lab">Median psf{kind === 'all' ? ', ranked within each kind' : ' · six equal groups'}</span>
          <div className="ramp dotramp" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6].map(i => <div className="step" key={i}><i style={{ background: `var(--dot-${i})` }} /></div>)}
          </div>
          <div className="rampends">{shown
            ? <><span>under S${shown[0].toLocaleString('en-SG')}</span><span>over S${shown.at(-1).toLocaleString('en-SG')}</span></>
            : <><span>Cheaper</span><span>Dearer</span></>}</div>
        </div>
      </div>
      <p className="prov islandprov">{(data?.counts ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0).toLocaleString('en-SG')} blocks and projects ·{' '}
        {data?.source?.hdb || 'HDB Resale Flat Prices (data.gov.sg)'} · {data?.source?.private || 'URA Data Service'}
        {data?.source?.period ? ` · ${data.source.period.from} to ${data.source.period.to}` : ''}</p>
    </div>
  );
}
