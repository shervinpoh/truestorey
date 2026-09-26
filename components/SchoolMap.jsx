'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Schools on a plain canvas: the land, the schools coloured by how far their
 * places reached, and — around one school — its 1 km and 2 km circles and the
 * homes inside them.
 *
 * ── WHY NO MAP LIBRARY ─────────────────────────────────────────────────────
 * Leaflet was the brief's suggestion. The site draws its price map the same
 * way as this (components/PriceMap.jsx) and holds three npm dependencies on
 * purpose. There are at most a few hundred marks here.
 *
 * ── THE CIRCLES ARE NOT MOE'S LINE ─────────────────────────────────────────
 * They are drawn from the school's registered coordinate. MOE measures from
 * the school's land boundary to the registered address, so a home just inside
 * a circle here can be outside the band for MOE. Every page that draws them
 * says so beside them, and points to OneMap's SchoolQuery.
 *
 * The box keeps its shape from `box` on the server, so the page does not jump
 * when the canvas measures itself (the PriceMap lesson in CLAUDE.md).
 *
 * Supplementary to the list or table on the same page, which carries every
 * figure drawn here; the canvas is aria-hidden and nothing is reachable only
 * through it.
 */
const STEP_VAR = { 0: '--w4', 1: '--dot-1', 2: '--dot-2', 3: '--dot-3', 4: '--dot-4', 5: '--dot-6' };

export default function SchoolMap({ box, rings = [], schools = [], selected = null, onSelect = null, homes = [], centre = null, label = 'Map' }) {
  const wrap = useRef(null), cv = useRef(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState(null);

  const [lat0, lon0, lat1, lon1] = box;
  const kx = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
  const aspect = ((lon1 - lon0) * kx) / (lat1 - lat0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = w ? Math.round(w / aspect) : 0;
  const px = (lat, lon) => [((lon - lon0) * kx) / ((lon1 - lon0) * kx) * w, (lat1 - lat) / (lat1 - lat0) * h];
  const perKm = h / ((lat1 - lat0) * 111.32);

  useEffect(() => {
    const c = cv.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    g.clearRect(0, 0, w, h);

    g.fillStyle = v('--sunk'); g.strokeStyle = v('--line'); g.lineWidth = 1;
    for (const ring of rings) {
      g.beginPath();
      ring.forEach(([lon, lat], i) => { const [x, y] = px(lat, lon); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath(); g.fill(); g.stroke();
    }

    const focus = centre || (selected && schools.find(s => s.slug === selected));
    if (focus) {
      const [cx, cy] = px(focus.lat, focus.lon);
      g.strokeStyle = v('--ink'); g.lineWidth = 1;
      g.setLineDash([]); g.beginPath(); g.arc(cx, cy, perKm, 0, Math.PI * 2); g.stroke();
      g.setLineDash([4, 4]); g.beginPath(); g.arc(cx, cy, perKm * 2, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.fillStyle = v('--ink2'); g.font = `11.5px "IBM Plex Mono", monospace`;
      g.fillText('1 km', cx + perKm * 0.71 + 4, cy - perKm * 0.71 - 4);
      g.fillText('2 km', cx + perKm * 1.41 + 4, cy - perKm * 1.41 - 4);
    }

    for (const hm of homes) {
      const [x, y] = px(hm.lat, hm.lon);
      g.fillStyle = hm === hover ? v('--acc-lit') : hm.kind === 'hdb' ? v('--acc') : v('--ink2');
      if (hm.kind === 'hdb') g.fillRect(x - 2.5, y - 2.5, 5, 5);
      else { g.beginPath(); g.arc(x, y, 2.8, 0, Math.PI * 2); g.fill(); }
    }

    for (const s of schools) {
      const [x, y] = px(s.lat, s.lon);
      const on = s.slug === selected;
      g.beginPath(); g.arc(x, y, on ? 7 : 5, 0, Math.PI * 2);
      g.fillStyle = v(STEP_VAR[s.step] || '--w4'); g.fill();
      g.lineWidth = on ? 2 : 1; g.strokeStyle = on ? v('--ink') : v('--card'); g.stroke();
    }
    if (centre) {
      const [x, y] = px(centre.lat, centre.lon);
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = v('--ink'); g.fill();
      g.lineWidth = 2; g.strokeStyle = v('--card'); g.stroke();
    }
  }, [w, h, rings, schools, selected, homes, hover, centre]);

  function nearest(e, list, max = 14) {
    const r = cv.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = max * max;
    for (const it of list) {
      const [x, y] = px(it.lat, it.lon);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  return (
    <div className="schoolmap" ref={wrap} style={{ aspectRatio: `${aspect}` }}>
      <canvas ref={cv} aria-hidden="true" style={{ width: '100%', height: h || undefined, cursor: onSelect ? 'pointer' : 'default' }}
        onMouseMove={e => { if (homes.length) setHover(nearest(e, homes, 10)); }}
        onMouseLeave={() => setHover(null)}
        onClick={e => { if (!onSelect) return; const s = nearest(e, schools); if (s) onSelect(s.slug); }} />
      {hover && (() => {
        const [x, y] = px(hover.lat, hover.lon);
        return (
          <div className="schoolmap-tip" style={{ left: Math.min(x + 10, w - 200), top: Math.max(y - 44, 0) }}>
            <b>{hover.label}</b>
            <span className="mono">{(hover.m / 1000).toFixed(2)} km · S${hover.medianPsf?.toLocaleString('en-SG')} psf</span>
          </div>
        );
      })()}
      <span className="vh">{label}</span>
    </div>
  );
}
