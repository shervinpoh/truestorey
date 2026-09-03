'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { still } from './Motion.jsx';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { titleCase } from '../lib/name.js';
import { tilesFor, BASEMAP } from '../lib/tiles.js';

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
 * ── NAVIGATION ─────────────────────────────────────────────────────────────
 * This used to say: "There is deliberately no zoom or pan gesture. The
 * viewport only ever moves to a named region, which means every view has a
 * caption and nobody can end up somewhere the page cannot describe."
 *
 * The principle was right and the conclusion was wrong. A map of thirteen
 * thousand addresses where the only way to move is a dropdown of twenty-six
 * towns is not a map, it is twenty-six pictures. Every reader who tried to
 * scroll into a neighbourhood found nothing happened, and the one gesture
 * everyone brings to a map — pinch — did nothing at all.
 *
 * So the viewport is free now, and the caption is derived rather than
 * enumerated: THE VIEW ALWAYS NAMES ITSELF. The strip under the map reports
 * the region nearest the centre of whatever you are looking at, and how many
 * of the current type are in frame. Pan somewhere with nothing in it and it
 * says so. Nobody ends up somewhere the page cannot describe, because the
 * description is computed from the viewport instead of being chosen from a
 * list.
 *
 * Wheel and pinch zoom about the pointer, drag pans, the arrow keys move and
 * +/− zoom once the canvas has focus, and 0 resets. The viewport is clamped:
 * never wider than the island, never narrower than 1/40th of it, and its
 * centre stays inside the bounding box, so no gesture can strand a reader in
 * empty sea with nothing to navigate back by.
 */
/** Zoom limits, as a fraction of the island's own latitude span. */
const MAX_ZOOM = 40;
/** Below this many pixels of movement, a pointer-up is a click, not a drag. */
const DRAG_SLOP = 4;
/* Sequential, one hue, running from the palette's data mist to its deep
   teal — so the darkest step on the map is the same colour as the
   interface, and the map reads as part of the site rather than beside it. */
const RAMP = ['#CDE9E9', '#9BD6D9', '#6FC4CA', '#3D9AA1', '#256E73', '#164F52'];
const KIND = [
  { code: 0, key: 'hdb', label: 'HDB', unit: 'blocks', region: 'town' },
  { code: 1, key: 'condo', label: 'Condo', unit: 'projects', region: 'district' },
  { code: 2, key: 'landed', label: 'Landed', unit: 'streets', region: 'district' },
];
// region tuple: [label, href, lat, lon, psf, sales, members, plotted]
const R = { LABEL: 0, HREF: 1, LAT: 2, LON: 3, PSF: 4, SALES: 5, MEMBERS: 6, PLOTTED: 7 };

/**
 * What a region is called.
 *
 * THE MAP CALLED THE SAME PLACE TWO THINGS. An HDB town read "ANG MO KIO" and
 * a district read "D01" — a place name in one tab and a database code in the
 * next, in the same control, on the same map. Worse, the rest of the site had
 * already settled on "District 1": ProjectBrowse and FloorView both write it
 * out. The map was the only surface still printing the raw key.
 *
 * WHAT IS NOT DONE HERE, AND WHY. The obvious next step is to give a district
 * its locality names, so D15 reads "Katong · Joo Chiat" and a reader can see
 * how it relates to the East Coast they know. That needs URA's published
 * district list as a source, transcribed the way data/sources/gls-programme
 * .json is. Writing twenty-eight of them from memory onto a page that carries
 * a CEA registration number is exactly the thing rule 13 refuses for geometry,
 * and the reasoning does not change because these are words.
 *
 * An HDB town and a postal district are also genuinely different shapes that
 * merely overlap — East Coast is a planning area, D15 is a postal district,
 * and naming one after the other would be wrong rather than helpful. The
 * caption under the map says so.
 */
const regionName = label => (/^D\d{1,2}$/.test(String(label))
  ? `District ${Number(String(label).slice(1))}`
  : titleCase(label));

const EASE = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const n = v => (Number.isFinite(v) ? v.toLocaleString('en-SG') : '—');

export default function PriceMap({ map }) {
  const router = useRouter();
  const wrapRef = useRef(null);
  const cvsRef = useRef(null);
  const baseRef = useRef(null);
  const labelsRef = useRef([]);          // hit rects for the drawn labels
  const animRef = useRef(0);

  const [kind, setKind] = useState(0);
  const [sel, setSel] = useState(-1);
  const [showRail, setShowRail] = useState(false);
  const [raise3d, setRaise3d] = useState(false);
  /* On by default. The map used to draw a coastline on blank ground, which is
     recognisable to somebody who already knows the shape of Singapore and to
     nobody else — no expressway, no town name, nothing to place yourself
     against. Off is kept as an option because the plain version reads the
     price bands more cleanly once you know where you are. */
  const [showBase, setShowBase] = useState(true);
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
  /** Cheapest first — see the draw pass. Memoised because panning redraws. */
  const order = useMemo(() => shown.slice().sort((a, b) => a[3] - b[3]), [shown]);
  const regions = useMemo(() => map.regions?.[kind] || [], [map.regions, kind]);
  const rail = map.rail || [];
  const land = map.land || null;
  const breaks = map.breaks[kind] || [];
  const region = sel >= 0 ? regions[sel] : null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Height is MEASURED, not recomputed. The wrapper's height now comes
      // from a CSS aspect-ratio, so deriving it here from the same ratio would
      // be two roundings of one number: at 998px wide the CSS box is 730 and
      // Math.round(998 / 1.36531) is 731, and the canvas would sit one pixel
      // proud of the box that reserved it. Reading the box back can never
      // disagree with the box.
      const w = el.clientWidth;
      setSize({ w, h: el.clientHeight || Math.round(w / aspect) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  /**
   * Keep a viewport legal: locked to the canvas aspect, no wider than the
   * island, no narrower than 1/40th of it, and centred somewhere inside the
   * bounding box. The last clause is what stops a fast trackpad flick from
   * leaving a reader looking at open sea with no landmark to come back by.
   */
  const clampView = useCallback(rect => {
    const fullLat = maxLat - minLat;
    const [a, b, c, d] = rect;
    const latSpan = Math.min(Math.max(c - a, fullLat / MAX_ZOOM), fullLat);
    const lonSpan = latSpan * aspect;
    const cy = Math.min(Math.max((a + c) / 2, minLat), maxLat);
    const cx = Math.min(Math.max((b + d) / 2, minLon), maxLon);
    return [cy - latSpan / 2, cx - lonSpan / 2, cy + latSpan / 2, cx + lonSpan / 2];
  }, [aspect, minLat, minLon, maxLat, maxLon]);

  /** Set the viewport now, with no easing — what every gesture uses. */
  const setViewNow = useCallback(rect => {
    cancelAnimationFrame(animRef.current);
    const next = clampView(rect);
    viewRef.current = next;
    setView(next);
  }, [clampView]);

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

  /**
   * Ease the viewport from wherever it is to a new rect.
   *
   * requestAnimationFrame DOES NOT RUN IN A BACKGROUND TAB. This repo has been
   * bitten by that once already — Motion.jsx stranded a headline figure
   * mid-ease for the same reason — and here it strands the whole map: pick a
   * town, switch tab before the ease finishes, come back, and the viewport is
   * frozen somewhere between where it was and where it was asked to go, with
   * no gesture in flight to finish it.
   *
   * So the destination is held, hidden documents skip the animation entirely,
   * and coming back to a visible tab lands the pending move rather than
   * resuming an ease whose clock ran on without it.
   */
  const targetRef = useRef(null);

  const flyTo = useCallback(target => {
    cancelAnimationFrame(animRef.current);
    targetRef.current = target;
    if (typeof document !== 'undefined' && document.hidden) {
      viewRef.current = target;
      setView(target);
      targetRef.current = null;
      return;
    }
    // Reduced motion lands the move instead of easing it. Selecting a town
    // repaints the whole map, which is about the largest movement on this
    // site — exactly the thing the setting is asking not to happen. The
    // destination is identical either way; only the 380ms of travel goes.
    if (still()) {
      viewRef.current = target;
      setView(target);
      targetRef.current = null;
      return;
    }
    const start = viewRef.current.slice();
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 380), e = EASE(k);
      const next = start.map((v, i) => v + (target[i] - v) * e);
      viewRef.current = next;
      setView(next);
      if (k < 1) animRef.current = requestAnimationFrame(step);
      else targetRef.current = null;
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden || !targetRef.current) return;
      cancelAnimationFrame(animRef.current);
      viewRef.current = targetRef.current;
      setView(targetRef.current);
      targetRef.current = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
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

  /* ── gestures ──────────────────────────────────────────────────────────────
     All of them write the same rect through setViewNow, so wheel, pinch, drag
     and the keyboard cannot disagree about where the viewport is. */

  /** Zoom by a factor about a point given in 0..1 canvas fractions. */
  const zoomAbout = useCallback((factor, fx = 0.5, fy = 0.5) => {
    const [a, b, c, d] = viewRef.current;
    const lon = b + fx * (d - b);
    const lat = c - fy * (c - a);
    const latSpan = (c - a) * factor;
    const lonSpan = latSpan * aspect;
    // Hold (lat, lon) at the same fraction of the canvas it was already at.
    const nb = lon - fx * lonSpan;
    const nc = lat + fy * latSpan;
    setViewNow([nc - latSpan, nb, nc, nb + lonSpan]);
  }, [aspect, setViewNow]);

  /** Pan by a pixel delta. */
  const panBy = useCallback((dx, dy) => {
    if (!size.w) return;
    const [a, b, c, d] = viewRef.current;
    const dLon = -(dx / size.w) * (d - b);
    const dLat = (dy / size.h) * (c - a);
    setViewNow([a + dLat, b + dLon, c + dLat, d + dLon]);
  }, [size.w, size.h, setViewNow]);

  // Wheel has to be bound by hand: React attaches onWheel passively, and a
  // passive listener cannot preventDefault, so zooming the map would scroll
  // the page underneath it at the same time.
  useEffect(() => {
    const cvs = cvsRef.current;
    if (!cvs) return;
    const onWheel = e => {
      e.preventDefault();
      const r = cvs.getBoundingClientRect();
      zoomAbout(Math.exp(e.deltaY * 0.0015),
        (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    cvs.addEventListener('wheel', onWheel, { passive: false });
    return () => cvs.removeEventListener('wheel', onWheel);
  }, [zoomAbout]);

  // Pointer state for drag and pinch. A ref, not state: these change on every
  // pointermove and re-rendering on each one would drop frames for nothing.
  const ptrs = useRef(new Map());
  const dragRef = useRef(null);
  const pinchRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: 0 };
    } else if (ptrs.current.size === 2) {
      dragRef.current = null;                       // a second finger ends the drag
      setDragging(false);
    }
  }

  function onPointerMove(e) {
    const p = ptrs.current.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }

    if (ptrs.current.size === 2) {
      const [p1, p2] = [...ptrs.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const prev = pinchRef.current;
      const r = cvsRef.current.getBoundingClientRect();
      const fx = ((p1.x + p2.x) / 2 - r.left) / r.width;
      const fy = ((p1.y + p2.y) / 2 - r.top) / r.height;
      if (prev && prev > 0 && dist > 0) zoomAbout(prev / dist, fx, fy);
      pinchRef.current = dist;
      return;
    }

    if (dragRef.current && p) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      if (dragRef.current.moved > DRAG_SLOP) {
        if (!dragging) setDragging(true);
        setHover(null); setHoverRegion(-1);        // no tooltip mid-drag
        panBy(dx, dy);
      }
      return;
    }

    // Not dragging: this is a hover.
    const hit = pick(e);
    setHover(hit.point); setHoverRegion(hit.region);
  }

  function onPointerUp(e) {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchRef.current = 0;
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    // A pointer-up that barely moved is a click. Anything further is a pan,
    // and opening a record because someone dragged across it would be the
    // worst possible outcome of adding pan.
    if (d && d.moved <= DRAG_SLOP) {
      if (hover) router.push(hover[4]);
      else if (hoverRegion >= 0) focus(hoverRegion);
    }
  }

  function onKeyDown(e) {
    const step = 0.12;
    const [a, b, c, d] = viewRef.current;
    const dLat = (c - a) * step, dLon = (d - b) * step;
    const go = rect => { e.preventDefault(); setViewNow(rect); };
    switch (e.key) {
      case 'ArrowUp': return go([a + dLat, b, c + dLat, d]);
      case 'ArrowDown': return go([a - dLat, b, c - dLat, d]);
      case 'ArrowLeft': return go([a, b - dLon, c, d - dLon]);
      case 'ArrowRight': return go([a, b + dLon, c, d + dLon]);
      case '+': case '=': e.preventDefault(); return zoomAbout(1 / 1.35);
      case '-': case '_': e.preventDefault(); return zoomAbout(1.35);
      case '0': e.preventDefault(); return setViewNow(base);
      default:
    }
  }

  const project = useMemo(() => {
    const [a, b, c, d] = view;
    return (lat, lon, w, h) => [((lon - b) / (d - b)) * w, ((c - lat) / (c - a)) * h];
  }, [view]);

  const scale = (maxLat - minLat) / (view[2] - view[0]);
  /* Raised only above a zoom threshold. At island scale 9,477 columns overlap
     into a hairbrush that says less than the flat map does, so asking for
     height at full extent turns it on and it takes effect as you come in. */
  const RAISE_AT = 2.6;
  const raised = raise3d && kind === 0 && scale >= RAISE_AT;

  const bandOf = psf => {
    let b = 0;
    while (b < breaks.length && psf > breaks[b]) b++;
    return b;
  };

  /* ── the basemap ───────────────────────────────────────────────────────────
   * Its own canvas, under the data one, because tiles arrive asynchronously
   * and the data layer redraws synchronously on every pan. Sharing a canvas
   * would mean either blocking the data on a network round trip or clearing
   * the data every time a tile landed.
   *
   * Each tile is positioned by projecting its OWN lat/lon corners through the
   * map's projection — not by tile arithmetic in pixel space. That is what
   * guarantees the background cannot drift away from the dots: if the
   * projection changes, both move together.
   *
   * `seq` discards tiles that arrive after the view has moved on. Without it a
   * slow tile from three pans ago paints itself over the current map.
   */
  const tileSeq = useRef(0);
  useEffect(() => {
    const cvs = baseRef.current;
    if (!cvs || !size.w || !showBase) return;
    const mine = ++tileSeq.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = size.w * dpr;
    cvs.height = size.h * dpr;
    const ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    for (const t of tilesFor(view, size.w)) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (mine !== tileSeq.current) return;
        const [x0, y0] = project(t.north, t.west, size.w, size.h);
        const [x1, y1] = project(t.south, t.east, size.w, size.h);
        // +1 closes the hairline seams rounding leaves between tiles.
        ctx.drawImage(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      };
      img.src = BASEMAP.url(t);
    }
  }, [view, size.w, size.h, project, showBase]);

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
    // under the cluster of ordinary blocks around it. Sorted once per property
    // type rather than once per frame: this used to re-sort 9,477 points inside
    // the draw, which was invisible when the viewport only moved on a dropdown
    // change and is a dropped frame per pointermove now that it can be dragged.
    const r = Math.min(6, (shown.length > 6000 ? 2 : 3) * Math.max(1, scale * 0.55));

    if (!raised) {
      for (const pass of sel >= 0 ? [false, true] : [true]) {
        ctx.globalAlpha = pass ? 1 : 0.13;             // dim, never hide
        for (const p of order) {
          if (sel >= 0 && (p[7] === sel) !== pass) continue;
          const [x, y] = project(p[1], p[2], size.w, size.h);
          if (x < -4 || y < -4 || x > size.w + 4 || y > size.h + 4) continue;
          ctx.fillStyle = RAMP[bandOf(p[3])];
          ctx.fillRect(x - r / 2, y - r / 2, r, r);    // square, like everything else here
        }
      }
      ctx.globalAlpha = 1;
    } else {
      /* ── raised: every block stood up to its published height ─────────────
       *
       * WHAT IS AND IS NOT CLAIMED. The height is HDB's own max_floor_lvl for
       * that block and nothing else — no inference, no default, no height
       * derived from which floor happened to sell. A block HDB publishes no
       * count for is drawn flat, and so is every condo and every landed
       * street, because URA publishes no floor count at all. That asymmetry is
       * stated in the legend rather than papered over.
       *
       * These are MARKS, not buildings. A column is a fixed narrow width at a
       * coordinate — the same square the flat view draws, given height. It is
       * not a footprint: the repo holds no building outlines, and drawing a
       * box the size of a block would be inventing one. Rule 13.
       *
       * Painter's algorithm, north first. Screen y increases southward, so
       * sorting by descending latitude draws the far side of the island before
       * the near side and a tower never paints over one in front of it.
       *
       * Only above a zoom threshold. At island scale 9,477 columns is a
       * hairbrush, so the flat view stays until there is room to stand them up.
       */
      /* Pixels of rise per storey. Tied to zoom so a column is always tall
         enough to read against the dot it stands on — at the old 0.85 cap a
         twelve-storey block rose ten pixels on a six-pixel mark, which is a
         smudge rather than a building. Capped so that a fifty-storey block
         cannot run off the top of the frame. */
      const raise = Math.min(2.2, 0.42 * scale);
      const w = Math.max(2, Math.min(7, r * 1.1));
      const draw = order
        .filter(p => sel < 0 || p[7] === sel || true)
        .map(p => ({ p, xy: project(p[1], p[2], size.w, size.h) }))
        .filter(({ xy }) => xy[0] > -20 && xy[1] > -140 && xy[0] < size.w + 20 && xy[1] < size.h + 20)
        .sort((a, b) => b.p[1] - a.p[1]);              // north (higher lat) first

      for (const { p, xy } of draw) {
        const [x, y] = xy;
        const dim = sel >= 0 && p[7] !== sel;
        ctx.globalAlpha = dim ? 0.13 : 1;
        const band = bandOf(p[3]);
        const h = p[8] > 0 ? p[8] * raise : 0;
        if (h < 1.2) {                                  // no published height: flat mark
          ctx.fillStyle = RAMP[band];
          ctx.fillRect(x - r / 2, y - r / 2, r, r);
          continue;
        }
        // The shaft, then a lighter cap, so a tower reads as standing rather
        // than as a stripe. Two tones only — this is a data mark with a top,
        // not an attempt at a lit 3D model.
        ctx.fillStyle = RAMP[band];
        ctx.fillRect(x - w / 2, y - h, w, h);
        ctx.fillStyle = RAMP[Math.max(0, band - 2)];
        ctx.fillRect(x - w / 2, y - h - 1.6, w, 1.9);
      }
      ctx.globalAlpha = 1;
    }

    // ── labels ────────────────────────────────────────────────────────────
    // Biggest region first, and anything that would overlap is dropped. A map
    // that overprints its own names is worse than one that names fewer places.
    const placed = [];
    const hits = [];
    const fits = box => !placed.some(q =>
      box.x < q.x + q.w + 4 && box.x + box.w + 4 > q.x && box.y < q.y + q.h + 3 && box.y + box.h + 3 > q.y);

    const draw = (text, x, y, { weight = 600, size: fs = 11, colour = '#0B0D0F', pad = 0 } = {}) => {
      ctx.font = `${weight} ${fs}px "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace`;
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

    // Where each region's housing is WITHIN THE FRAME.
    // A centroid is the right anchor at island scale and useless once you are
    // zoomed into a corner of a town: the centre of Geylang is off screen, so
    // every name was dropped and a reader who had zoomed in — the thing zoom
    // is for — was looking at an unlabelled field of dots. Falling back to the
    // middle of a region's own visible blocks is the same fallback this map
    // used before boundaries were ingested, and it names a place over its own
    // housing rather than over a boundary nobody can see.
    const [va, vb, vc, vd] = view;
    const inFrame = new Map();
    for (const p of shown) {
      if (p[1] < va || p[1] > vc || p[2] < vb || p[2] > vd) continue;
      let e = inFrame.get(p[7]);
      if (!e) { e = { lat: 0, lon: 0, n: 0 }; inFrame.set(p[7], e); }
      e.lat += p[1]; e.lon += p[2]; e.n++;
    }

    const byWeight = regions.map((rg, i) => [i, rg]).sort((a, b) => b[1][R.PLOTTED] - a[1][R.PLOTTED]);
    for (const [i, rg] of byWeight) {
      const home = byCentroid.get(String(rg[R.LABEL]).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      let [x, y] = project(home?.[0] ?? rg[R.LAT], home?.[1] ?? rg[R.LON], size.w, size.h);
      const off = () => x < 0 || y < 0 || x > size.w || y > size.h;
      if (off()) {
        const e = inFrame.get(i);
        if (!e) continue;                      // nothing of this region is in frame
        [x, y] = project(e.lat / e.n, e.lon / e.n, size.w, size.h);
        if (off()) continue;
      }
      const on = i === sel;
      const opts = {
        weight: on ? 700 : 600,
        size: on ? 12.5 : 11,
        colour: sel >= 0 && !on ? '#9AA3AB' : on ? '#00767E' : '#0B0D0F',
        pad: 3,
      };
      let box = null;
      for (const [dx, dy] of NUDGE) {
        /*
         * THE MAP FACE KEEPS THE SHORT FORM, ON PURPOSE.
         *
         * Everywhere with room to set type — the picker, the tooltip, the
         * caption, the aria-label — now reads "District 15". Here it stays
         * "D15", because "DISTRICT 15" is three times the width and districts
         * 1 to 15 are all stacked into the central south. At 1000px for the
         * whole island those labels collide, and this layout DROPS a label it
         * cannot place rather than overprint it — so spelling it out would
         * silently delete half the districts from the map to gain a word.
         *
         * A map face abbreviating what its legend spells out is ordinary
         * cartography, and D15 is what the market calls it anyway. The
         * inconsistency worth fixing was a code against a PLACE NAME, and that
         * one is fixed.
         */
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
  }, [shown, order, size, hover, project, view, breaks, regions, sel, showRail, rail, scale, land, region, raised]);

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

  /**
   * What you are looking at, computed from the viewport.
   *
   * This is the replacement for the rule that used to forbid free navigation:
   * the view named itself because you had picked its name off a list. Now it
   * names itself from where it actually is — the region whose own centre is
   * nearest the centre of the frame, and a count of what is in frame. If you
   * pan into the strait, the count is zero and it says so rather than naming
   * the nearest town and implying you are over it.
   */
  const where = useMemo(() => {
    const [a, b, c, d] = view;
    const cy = (a + c) / 2, cx = (b + d) / 2;
    let inView = 0;
    for (const p of shown) if (p[1] >= a && p[1] <= c && p[2] >= b && p[2] <= d) inView++;
    let near = null, best = Infinity;
    for (const rg of regions) {
      const dd = (rg[R.LAT] - cy) ** 2 + (rg[R.LON] - cx) ** 2;
      if (dd < best) { best = dd; near = rg; }
    }
    const zoom = (maxLat - minLat) / (c - a);
    return { near, inView, zoom };
  }, [view, shown, regions, maxLat, minLat]);

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
                {regionName(rg[R.LABEL])}{Number.isFinite(rg[R.PSF]) ? ` — $${n(rg[R.PSF])} psf` : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="mapopt" aria-pressed={showRail} onClick={() => setShowRail(v => !v)}>
          {showRail ? '✓ ' : ''}MRT and LRT stations
        </button>
        {/* HDB only, because HDB is the only source that publishes a storey
            count. Offered at any zoom and applied once there is room — asking
            for it at island scale and getting a hairbrush would read as
            broken rather than as "come closer". */}
        <button className="mapopt" aria-pressed={showBase} onClick={() => setShowBase(v => !v)}>
          {showBase ? '✓ ' : ''}Streets and names
        </button>
        {kind === 0 && (
          <button className="mapopt" aria-pressed={raise3d} onClick={() => setRaise3d(v => !v)}>
            {raise3d ? '✓ ' : ''}Stand the blocks up
          </button>
        )}
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

      {/*
        * THE BOX IS RESERVED IN CSS, BEFORE ANY JAVASCRIPT RUNS.
        *
        * This carried `height: size.h`, and size starts at { w: 0, h: 0 }
        * because only a ResizeObserver can fill it in. So the server rendered
        * a zero-height map, hydration measured the width, and everything below
        * the canvas — the legend, the town list, the whole page — was shoved
        * down by ~720px on desktop and ~255px on mobile, after paint.
        *
        * `aspect` comes from map.bbox, which is present at render on the
        * server too, so the aspect ratio is known before the width is. The
        * canvas keeps explicit pixel dimensions because its backing store is
        * sized from the same numbers and a percentage would let the two drift
        * by a subpixel and blur every label.
        */}
      <div className="mapwrap" ref={wrapRef} style={{ aspectRatio: aspect }}>
        {/* Under the data, and dimmed. OneMap's Grey layer still carries
            expressway names, town names and station marks — which is the whole
            point, since a coastline alone is not recognisable to most people —
            but at full strength its POI icons compete with the price bands. */}
        {showBase && <canvas ref={baseRef} className="mapbase"
          style={{ width: size.w, height: size.h }} aria-hidden="true" />}
        <canvas ref={cvsRef}
          style={{
            width: size.w, height: size.h,
            // touch-action:none so a pinch zooms the map rather than the page,
            // and a drag pans rather than scrolling it away underneath you.
            touchAction: 'none',
            cursor: dragging ? 'grabbing' : (hover || hr ? 'pointer' : 'grab'),
          }}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => { if (!dragRef.current) { setHover(null); setHoverRegion(-1); } }}
          onKeyDown={onKeyDown}
          role="img"
          aria-label={`${n(shown.length)} ${k.label} locations plotted by median price per square foot. `
            + (region ? `${regionName(region[R.LABEL])} is highlighted and the rest of Singapore dimmed. ` : '')
            + `Currently showing ${n(where.inView)} of them, near ${where.near ? regionName(where.near[R.LABEL]) : 'no named area'}. `
            + 'Use the arrow keys to move, plus and minus to zoom, and 0 to see all of Singapore.'} />

        {/* Zoom controls, because a gesture nobody can see is a gesture most
            people will not try. Over the canvas, out of the way of the island. */}
        <div className="mapzoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoomAbout(1 / 1.35)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomAbout(1.35)}>−</button>
          <button type="button" aria-label="Show all of Singapore"
            onClick={() => { setViewNow(base); }}>⤢</button>
        </div>
        {hover && (
          <div className="maptip" style={tipAt(hover[1], hover[2])}>
            <b>{titleCase(hover[5])}</b>
            <span className="mono">${n(hover[3])} psf median · {hover[6]} filed</span>
            <span className="go">Click to open →</span>
          </div>
        )}
        {!hover && hr && (
          <div className="maptip" style={tipAt(hr[R.LAT], hr[R.LON])}>
            <b>{regionName(hr[R.LABEL])}</b>
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

      {/* The view names itself. This is what replaced the rule against free
          navigation — not a list you pick from, a description computed from
          wherever you actually are. */}
      <p className="mapwhere">
        <span className="lab">In view</span>
        {/* One span, not several: .mapwhere is a flex row and its gap would
            otherwise put a space in front of the comma. */}
        {where.inView === 0
          ? <span><b>Nothing plotted here.</b> Pan back towards the island, or press 0.</span>
          : (
            <span>
              <b>{n(where.inView)} of {n(shown.length)} {k.unit}</b>
              {/* At full extent the nearest region is just whatever sits closest
                  to the middle of the country, which tells a reader nothing. */}
              {where.zoom >= 1.05 && where.near
                ? <>, nearest {k.region} <b>{regionName(where.near[R.LABEL])}</b>{' · '}
                  <span className="mono">{where.zoom.toFixed(1)}× in</span></>
                : <> · <span className="mono">all of Singapore</span></>}
            </span>
          )}
                <span className="maphint">Drag to move · scroll or pinch to zoom · arrow keys and +/− once focused · 0 resets</span>
        {raise3d && !raised && (
          <span className="maphint">Blocks stand up once you are closer in — keep zooming.</span>
        )}
        {raised && (
          <span className="maphint">Height is HDB’s own published storey count for each block. Nothing is inferred; a block without one stays flat.</span>
        )}
      </p>

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
            ? <>The land is {land.source}, simplified and stored in this repo. Streets and names, when
              switched on, are tiles from <a href={BASEMAP.href} target="_blank" rel="noopener noreferrer">OneMap</a>{' '}
              — {BASEMAP.credit}. Still no map library: a tile is a PNG at a URL computed from three
              integers, and the projection is this map&rsquo;s own, so the background cannot drift
              from the dots.{' '}
              {/*
                * THE THREE VIEWS DO NOT BEHAVE THE SAME AND THIS USED TO CLAIM
                * THEY DID. "A {region} name sits at the centroid of its own
                * area" is true for HDB — a town label slugs to a planning-area
                * name, so it anchors to that area and picking a town shades it
                * — and false for condo and landed, where the label is "D01",
                * matches no planning area, anchors to the median of its own
                * projects, and shades nothing when picked. That difference is
                * the first thing a reader notices switching between them.
                *
                * The fix is not to draw the districts. A postal district is not
                * a planning area, no district boundary is published in any
                * dataset here, and deriving one from the other would be
                * inventing a shape and presenting it as URA's. Rule 13. So the
                * asymmetry is explained instead of hidden.
                */}
              {kind === 0
                ? <>A town name sits at the centroid of its own planning area, and picking one
                  shades that area.</>
                : <>A district name sits at the median coordinate of its own {k.unit}, because no
                  district boundary is published in any dataset here — a postal district is not a
                  planning area, and drawing one from the other would be inventing a shape. So
                  picking a district dims everything outside it instead of outlining it.</>}
            </>
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
