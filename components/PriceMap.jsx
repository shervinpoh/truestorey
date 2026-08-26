'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { titleCase } from '../lib/name.js';

/**
 * Every block and project in Singapore, plotted by price per square foot.
 *
 * NO BASEMAP, ON PURPOSE. There are no tiles, no map library and no third-party
 * host — the island draws itself out of 13,115 transactions. Where there is
 * housing there are dots; where there is a reservoir, an airbase or the
 * catchment there are none. That shape is the data, not a picture behind the
 * data, and it means this page depends on nothing outside the repo.
 *
 * Canvas rather than SVG: 13,115 DOM nodes would crawl, and one canvas pass
 * redraws in a few milliseconds when a filter moves.
 *
 * Colour is SEQUENTIAL — one hue, light to dark, on quantile breaks computed
 * per property type. Quantiles because Singapore psf is heavily right-skewed:
 * on a min-max ramp a dozen Orchard projects would flatten every HDB town into
 * a single shade, and the map would only tell you that Ardmore Park is
 * expensive. Per type because a flat and a bungalow do not share a scale.
 *
 * The two palest steps fall under 3:1 against white. The relief for that is
 * the legend below, which carries the actual psf figure for every band, and
 * the index pages, which are the same data as a table.
 *
 * ── ORIENTATION ────────────────────────────────────────────────────────────
 * The silhouette was right and the affordances were missing: a field of dots
 * with nothing written on it cannot answer "where is Bishan?". Three things
 * fix that without putting a picture behind the data.
 *
 *   TOWN LABELS. Drawn at each region's own median coordinate, so the name
 *   sits in the middle of its housing rather than in the middle of its
 *   boundary — there is no boundary file here and inventing one would be
 *   drawing, not plotting. Labels are laid out largest-region-first and any
 *   label that would collide with one already placed is dropped, so the map
 *   thins out honestly instead of overprinting itself.
 *
 *   JUMP TO A TOWN. Picking one eases the viewport onto that region and dims
 *   everything outside it. Dims rather than hides: the surrounding island is
 *   the only context this map has, and cutting it away would leave a blob.
 *
 *   THE ISLAND ITSELF, when data/boundaries.json has been ingested. URA's own
 *   Master Plan planning areas, drawn as filled land under the dots. This is
 *   still not a basemap: no tiles, no map library, no third-party host at
 *   render time — it is a few hundred kilobytes of published open data in the
 *   repo, drawn by the same canvas pass as everything else. Without it the map
 *   falls back to the dot field it has always been.
 *
 *   STATIONS, OPTIONAL, OFF BY DEFAULT. Stations and not lines — the LTA exit
 *   dataset says where a station is and nothing about which line it belongs
 *   to, so drawing the lines would mean supplying the network from memory.
 *   A confidently wrong rail line over real transactions is the exact failure
 *   this site exists not to commit.
 *
 * There is deliberately no zoom or pan gesture. The viewport only ever moves
 * to a named region, which means every view has a caption and nobody can end
 * up somewhere the page cannot describe.
 */
const RAMP = ['#7AD3DC', '#45BECB', '#17A2B0', '#0A8089', '#065E66', '#03403F'];
const KIND = [
  { code: 0, key: 'hdb', label: 'HDB', unit: 'blocks', region: 'town' },
  { code: 1, key: 'condo', label: 'Condo', unit: 'projects', region: 'district' },
  { code: 2, key: 'landed', label: 'Landed', unit: 'streets', region: 'district' },
];
// region tuple: [label, href, lat, lon, psf, sales, members, plotted]
const R = { LABEL: 0, HREF: 1, LAT: 2, LON: 3, PSF: 4, SALES: 5, MEMBERS: 6, PLOTTED: 7 };

const EASE = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const n = v => (Number.isFinite(v) ? v.toLocaleString('en-SG') : '—');

export default function PriceMap({ map }) {
  const router = useRouter();
  const wrapRef = useRef(null);
  const cvsRef = useRef(null);
  const labelsRef = useRef([]);          // hit rects for the drawn labels
  const animRef = useRef(0);

  const [kind, setKind] = useState(0);
  const [sel, setSel] = useState(-1);
  const [showRail, setShowRail] = useState(false);
  const [hover, setHover] = useState(null);
  const [hoverRegion, setHoverRegion] = useState(-1);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const base = map.bbox;
  const [minLat, minLon, maxLat, maxLon] = base;
  // Longitude degrees are ~0.9997 of latitude degrees at 1.35°N, so a plain
  // ratio is true enough here. Getting this wrong stretches the island.
  const aspect = (maxLon - minLon) / (maxLat - minLat);

  const [view, setView] = useState(base);
  const viewRef = useRef(base);

  const shown = useMemo(() => map.points.filter(p => p[0] === kind), [map.points, kind]);
  const regions = useMemo(() => map.regions?.[kind] || [], [map.regions, kind]);
  const rail = map.rail || [];
  const land = map.land || null;
  const breaks = map.breaks[kind] || [];
  const region = sel >= 0 ? regions[sel] : null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w, h: Math.round(w / aspect) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  /** Widen a rect until it matches the canvas, so nothing is ever squashed. */
  const toAspect = useCallback(rect => {
    let [a, b, c, d] = rect;
    const latSpan = c - a, lonSpan = d - b;
    if (lonSpan / latSpan < aspect) {
      const want = latSpan * aspect, pad = (want - lonSpan) / 2;
      b -= pad; d += pad;
    } else {
      const want = lonSpan / aspect, pad = (want - latSpan) / 2;
      a -= pad; c += pad;
    }
    return [a, b, c, d];
  }, [aspect]);

  /** Ease the viewport from wherever it is to a new rect. */
  const flyTo = useCallback(target => {
    cancelAnimationFrame(animRef.current);
    const start = viewRef.current.slice();
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 380), e = EASE(k);
      const next = start.map((v, i) => v + (target[i] - v) * e);
      viewRef.current = next;
      setView(next);
      if (k < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  function focus(i) {
    setSel(i);
    setHover(null);
    if (i < 0) return flyTo(base);
    // The region's own extent, taken from its points — the only honest way to
    // frame a place when the repo holds no boundaries.
    const pts = shown.filter(p => p[7] === i);
    if (!pts.length) return;
    const lats = pts.map(p => p[1]), lons = pts.map(p => p[2]);
    let rect = [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)];
    const padLat = Math.max((rect[2] - rect[0]) * 0.18, 0.004);
    const padLon = Math.max((rect[3] - rect[1]) * 0.18, 0.004);
    rect = [rect[0] - padLat, rect[1] - padLon, rect[2] + padLat, rect[3] + padLon];
    flyTo(toAspect(rect));
  }

  function switchKind(code) {
    setKind(code); setSel(-1); setHover(null); setHoverRegion(-1);
    cancelAnimationFrame(animRef.current); viewRef.current = base; setView(base);
  }

  const project = useMemo(() => {
    const [a, b, c, d] = view;
    return (lat, lon, w, h) => [((lon - b) / (d - b)) * w, ((c - lat) / (c - a)) * h];
  }, [view]);

  const scale = (maxLat - minLat) / (view[2] - view[0]);

  const bandOf = psf => {
    let b = 0;
    while (b < breaks.length && psf > breaks[b]) b++;
    return b;
  };

  useEffect(() => {
    const cvs = cvsRef.current;
    if (!cvs || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = size.w * dpr;
    cvs.height = size.h * dpr;
    const ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // ── the island ────────────────────────────────────────────────────────
    // Land is painted before anything else so every dot sits ON Singapore
    // rather than in a void. Two greys and a hairline: the map is still about
    // the prices, and a coastline that competes with the data for attention has
    // stopped being a background.
    if (land) {
      const areaPath = rings => {
        const p = new Path2D();
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) {
            const [x, y] = project(ring[i][1], ring[i][0], size.w, size.h);
            if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
          }
          p.closePath();
        }
        return p;
      };
      const selSlug = region ? String(region[R.LABEL]).toLowerCase().replace(/[^a-z0-9]+/g, '-') : null;
      for (const [, slug, , rings] of land.areas) {
        const path = areaPath(rings);
        const on = selSlug && slug === selSlug;
        ctx.fillStyle = on ? '#E8FAFB' : '#EEF1F4';
        ctx.fill(path);
        ctx.strokeStyle = on ? '#00A7B0' : '#DFE3E8';
        ctx.lineWidth = on ? 1.4 : 0.7;
        ctx.stroke(path);
      }
    }

    // ── rail, on the land and under the dots, as reference only ───────────
    if (showRail) {
      for (const st of rail) {
        const [x, y] = project(st[1], st[2], size.w, size.h);
        if (x < -6 || y < -6 || x > size.w + 6 || y > size.h + 6) continue;
        const s = st[3] ? 3 : 5;                       // LRT reads smaller than MRT
        ctx.strokeStyle = '#9AA3AB';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      }
    }

    // ── the transactions ──────────────────────────────────────────────────
    // Cheapest first, dearest last, so an expensive outlier is never buried
    // under the cluster of ordinary blocks around it.
    const order = shown.slice().sort((a, b) => a[3] - b[3]);
    const r = Math.min(6, (shown.length > 6000 ? 2 : 3) * Math.max(1, scale * 0.55));
    for (const pass of sel >= 0 ? [false, true] : [true]) {
      ctx.globalAlpha = pass ? 1 : 0.13;               // dim, never hide
      for (const p of order) {
        if (sel >= 0 && (p[7] === sel) !== pass) continue;
        const [x, y] = project(p[1], p[2], size.w, size.h);
        if (x < -4 || y < -4 || x > size.w + 4 || y > size.h + 4) continue;
        ctx.fillStyle = RAMP[bandOf(p[3])];
        ctx.fillRect(x - r / 2, y - r / 2, r, r);      // square, like everything else here
      }
    }
    ctx.globalAlpha = 1;

    // ── labels ────────────────────────────────────────────────────────────
    // Biggest region first, and anything that would overlap is dropped. A map
    // that overprints its own names is worse than one that names fewer places.
    const placed = [];
    const hits = [];
    const fits = box => !placed.some(q =>
      box.x < q.x + q.w + 4 && box.x + box.w + 4 > q.x && box.y < q.y + q.h + 3 && box.y + box.h + 3 > q.y);

    const draw = (text, x, y, { weight = 600, size: fs = 11, colour = '#0B0D0F', pad = 0 } = {}) => {
      ctx.font = `${weight} ${fs}px "DM Mono", ui-monospace, SFMono-Regular, monospace`;
      const w = ctx.measureText(text).width;
      const box = { x: x - w / 2 - pad, y: y - fs / 2 - pad, w: w + pad * 2, h: fs + pad * 2 };
      if (box.x < 2 || box.y < 2 || box.x + box.w > size.w - 2 || box.y + box.h > size.h - 2) return null;
      if (!fits(box)) return null;
      placed.push(box);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255,255,255,.94)';       // halo, so a name over dense dots still reads
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, y);
      return box;
    };

    // A dropped label is a town nobody can find, so before giving up on one
    // it is nudged a few pixels off its centroid. Bukit Panjang sits close
    // enough to Choa Chu Kang that at island scale the two names touch, and
    // losing the smaller of the pair every time is not a map, it is a ranking.
    const NUDGE = [[0, 0], [0, -14], [0, 14], [0, -27], [0, 27], [-34, 0], [34, 0]];
    // With boundaries loaded, a name sits at the centroid of its actual area
    // rather than at the median of its transactions. Those are close in a
    // dense town and quite far apart in one with a reservoir in the middle.
    const byCentroid = new Map((land?.areas || []).map(([, slug, c]) => [slug, c]));
    const byWeight = regions.map((rg, i) => [i, rg]).sort((a, b) => b[1][R.PLOTTED] - a[1][R.PLOTTED]);
    for (const [i, rg] of byWeight) {
      const home = byCentroid.get(String(rg[R.LABEL]).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      const [x, y] = project(home?.[0] ?? rg[R.LAT], home?.[1] ?? rg[R.LON], size.w, size.h);
      if (x < 0 || y < 0 || x > size.w || y > size.h) continue;
      const on = i === sel;
      const opts = {
        weight: on ? 700 : 600,
        size: on ? 12.5 : 11,
        colour: sel >= 0 && !on ? '#9AA3AB' : on ? '#00767E' : '#0B0D0F',
        pad: 3,
      };
      let box = null;
      for (const [dx, dy] of NUDGE) {
        box = draw(titleCase(rg[R.LABEL]).toUpperCase(), x + dx, y + dy, opts);
        if (box) break;
      }
      if (box) hits.push({ i, ...box });
    }

    // Station names only once a region is framed — at island scale they are
    // 190 names on top of 9,477 dots, which is noise, not orientation.
    if (showRail && scale > 2.2) {
      for (const st of rail) {
        if (st[3]) continue;                            // MRT only; LRT names crowd the north-east
        const [x, y] = project(st[1], st[2], size.w, size.h);
        if (x < 0 || y < 0 || x > size.w || y > size.h) continue;
        draw(titleCase(st[0]), x, y - 9, { weight: 400, size: 9.5, colour: '#6B747C', pad: 2 });
      }
    }
    labelsRef.current = hits;

    if (hover) {
      const [x, y] = project(hover[1], hover[2], size.w, size.h);
      ctx.strokeStyle = '#0B0D0F';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    }
  }, [shown, size, hover, project, breaks, regions, sel, showRail, rail, scale, land, region]);

  function pick(e) {
    const cvs = cvsRef.current;
    if (!cvs || !size.w) return { point: null, region: -1 };
    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    // Labels are drawn on top, so they take the pointer first — otherwise the
    // one thing on this map with a name would be the one thing you cannot hover.
    for (const l of labelsRef.current) {
      if (mx >= l.x && mx <= l.x + l.w && my >= l.y && my <= l.y + l.h) return { point: null, region: l.i };
    }
    let best = null, bestD = 12 * 12;          // a generous hit target for a 3px mark
    for (const p of shown) {
      if (sel >= 0 && p[7] !== sel) continue;  // a dimmed dot is out of play, not just faint
      const [x, y] = project(p[1], p[2], size.w, size.h);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return { point: best, region: -1 };
  }

  const tipAt = (lat, lon) => ({
    left: Math.min(project(lat, lon, size.w, size.h)[0] + 12, size.w - 230),
    top: Math.max(project(lat, lon, size.w, size.h)[1] - 10, 0),
  });

  const hr = hoverRegion >= 0 ? regions[hoverRegion] : null;
  const k = KIND[kind];

  return (
    <>
      <div className="seg" role="group" aria-label="Property type">
        {KIND.map(kk => (
          <button key={kk.code} aria-pressed={kind === kk.code} onClick={() => switchKind(kk.code)}>
            {kk.label} ({n(map.counts[kk.key] || 0)})
          </button>
        ))}
      </div>

      <div className="mapctl">
        <label className="mapjump">
          <span className="filtn">Jump to a {k.region}</span>
          <select value={sel} onChange={e => focus(Number(e.target.value))}
            aria-label={`Jump to a ${k.region}`}>
            <option value={-1}>All of Singapore</option>
            {regions.map((rg, i) => (
              <option key={rg[R.LABEL]} value={i}>
                {titleCase(rg[R.LABEL])}{Number.isFinite(rg[R.PSF]) ? ` — $${n(rg[R.PSF])} psf` : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="mapopt" aria-pressed={showRail} onClick={() => setShowRail(v => !v)}>
          {showRail ? '✓ ' : ''}MRT and LRT stations
        </button>
        {sel >= 0 && (
          <button className="mapopt" onClick={() => focus(-1)}>Show all of Singapore</button>
        )}
      </div>

      {region && (
        <div className="mapfocus">
          <b>{titleCase(region[R.LABEL])}</b>
          <span className="mono">
            {Number.isFinite(region[R.PSF]) ? `$${n(region[R.PSF])} psf median` : 'no median'}
            {' · '}{n(region[R.PLOTTED])} of {n(region[R.MEMBERS])} {k.unit} plotted
          </span>
          {region[R.HREF] && <Link href={region[R.HREF]}>Open {titleCase(region[R.LABEL])} →</Link>}
        </div>
      )}

      <div className="mapwrap" ref={wrapRef} style={{ height: size.h || undefined }}>
        <canvas ref={cvsRef} style={{ width: size.w, height: size.h, cursor: hover || hr ? 'pointer' : 'crosshair' }}
          onMouseMove={e => { const p = pick(e); setHover(p.point); setHoverRegion(p.region); }}
          onMouseLeave={() => { setHover(null); setHoverRegion(-1); }}
          onClick={() => { if (hover) router.push(hover[4]); else if (hr) focus(hoverRegion); }}
          role="img"
          aria-label={region
            ? `${titleCase(region[R.LABEL])}: ${n(region[R.PLOTTED])} ${k.unit} plotted by median price per square foot, with the rest of Singapore dimmed`
            : `${n(shown.length)} ${k.label} locations plotted by median price per square foot, labelled by ${k.region}`} />
        {hover && (
          <div className="maptip" style={tipAt(hover[1], hover[2])}>
            <b>{titleCase(hover[5])}</b>
            <span className="mono">${n(hover[3])} psf median · {hover[6]} filed</span>
            <span className="go">Click to open →</span>
          </div>
        )}
        {!hover && hr && (
          <div className="maptip" style={tipAt(hr[R.LAT], hr[R.LON])}>
            <b>{titleCase(hr[R.LABEL])}</b>
            <span className="mono">
              {Number.isFinite(hr[R.PSF]) ? `$${n(hr[R.PSF])} psf median` : 'no median'}
              {' · '}{n(hr[R.PLOTTED])} {k.unit}
            </span>
            <span className="mono">
              {kind === 0
                ? `across ${n(hr[R.SALES])} filed sales`
                : `median of ${n(hr[R.MEMBERS])} ${k.unit === 'streets' ? 'street' : 'project'} medians`}
            </span>
            <span className="go">{hoverRegion === sel ? 'Showing this one' : 'Click to focus →'}</span>
          </div>
        )}
      </div>

      {/* The legend carries the figures, which is the required relief for the
          two palest steps sitting under 3:1 against white. */}
      <div className="maplegend">
        <span className="lab">Median psf</span>
        <div className="ramp">
          {RAMP.map((c, i) => (
            <div key={c} className="step">
              <i style={{ background: c }} />
              <span className="mono">
                {i === 0 ? `under $${n(breaks[0])}`
                  : i === RAMP.length - 1 ? `$${n(breaks[breaks.length - 1])}+`
                  : `$${n(breaks[i - 1])}`}
              </span>
            </div>
          ))}
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Six equal-sized groups, not six equal price steps — so the map shows where places actually
          differ instead of showing that a handful of Orchard projects are expensive. Scales are
          separate for each property type.
        </p>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          {land
            ? <>The land is {land.source}, simplified and stored in this repo — there is still no tile
              server and no map library. A {k.region} name sits at the centroid of its own area.</>
            : <>A {k.region} name sits at the median coordinate of its own {k.unit}, because no
              boundary data has been ingested yet.</>}
          {' '}Names that would overlap are dropped rather than overprinted.
          {kind === 0
            ? ' A town figure is the median of every filed sale in that town, the same number /hdb shades its tiles by.'
            : ` A district figure is the median of that district's own ${k.unit === 'streets' ? 'street' : 'project'} medians, the same number the index page shades its tiles by.`}
        </p>
      </div>
    </>
  );
}
