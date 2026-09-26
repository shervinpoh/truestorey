'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Statement from './Statement.jsx';
import HowWorked from './HowWorked.jsx';
import { FACINGS, HOURS, STEP_MIN, sgt, sunAt, litAt, windowOn, sunOnWindow, groundShadow, offBy } from '../lib/sunlight.js';

/**
 * Sunward — the sun on one window, with the buildings around it.
 *
 * The answer is the month-by-hour grid: minutes of direct sun on a window at
 * the floor and facing chosen, with every building of published height
 * between it and the sun taken into account. The 3D view and the day curve
 * are how a reader sees WHY a cell is empty — a tower in the way, the sun
 * behind the building, or the sun too high to reach the facade.
 *
 * Drawn on a canvas with no library (CLAUDE.md, three dependencies). Buildings
 * whose height nobody publishes are drawn as flat outlines and never block
 * the sun; the page counts them. The canvas is aria-hidden: the status line
 * and the grid carry everything it shows.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FACING_NAME = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
const RAD = Math.PI / 180;
const hm = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const dur = min => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);
const clock = min => { const h = Math.floor(min / 60), m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`;
const CELL = m => (m === 0 ? 'transparent' : m <= 15 ? 'var(--dot-1)' : m <= 30 ? 'var(--dot-2)' : m <= 45 ? 'var(--dot-4)' : 'var(--dot-6)');

export default function SunStudy({ massing, lat, lon, label }) {
  const { buildings, floor } = massing;
  const tall = useMemo(() => buildings.map((b, i) => ({ ...b, i })).filter(b => b.m !== null && b.dist <= 150)
    .sort((a, b) => a.dist - b.dist).slice(0, 8), [buildings]);
  const [ownIdx, setOwnIdx] = useState(massing.own >= 0 ? massing.own : (tall[0]?.i ?? -1));
  const own = buildings[ownIdx] || null;
  const floorH = own?.src === 1 ? floor.hdb : own?.src === 4 ? (floor.uraLevel || floor.osmLevel) : floor.osmLevel;
  const anyMinimum = buildings.some(b => b.src === 4);
  const maxStorey = own?.storeys || (own?.m ? Math.max(1, Math.round(own.m / floorH)) : 30);
  const year = new Date().getFullYear();

  const [facing, setFacing] = useState('W');
  const [storey, setStorey] = useState(Math.max(1, Math.round(maxStorey / 2)));
  const [month, setMonth] = useState(new Date().getMonth());
  const [minute, setMinute] = useState(16 * 60 + 30);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState(null);

  useEffect(() => { setStorey(s => Math.min(s, maxStorey)); }, [maxStorey]);
  const deg = FACINGS.find(f => f.key === facing).deg;
  const camera = view ?? deg;
  const z = (storey - 1) * floorH + 1.5;
  const win = own ? windowOn(own.ring, deg, z) : null;

  const result = useMemo(() => (win ? sunOnWindow({ lat, lon, win, facing: deg, buildings, ownIndex: ownIdx, year }) : null),
    [lat, lon, win?.x, win?.y, z, deg, buildings, ownIdx, year]);

  const day = useMemo(() => {
    const out = [];
    for (let t = HOURS[0] * 60; t <= HOURS[1] * 60; t += 10) {
      const s = sunAt(lat, lon, sgt(year, month, 15, 0, t));
      out.push({ t, alt: s.altitude, lit: win ? litAt(win, deg, s, buildings, ownIdx).lit : false });
    }
    return out;
  }, [lat, lon, year, month, win?.x, win?.y, z, deg, buildings, ownIdx]);

  const sun = sunAt(lat, lon, sgt(year, month, 15, 0, minute));
  const now = win ? litAt(win, deg, sun, buildings, ownIdx) : { lit: false, why: 'none' };

  /* Play steps the clock through the day. Started only by the reader. */
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setMinute(m => (m >= HOURS[1] * 60 ? HOURS[0] * 60 : m + 10)), 120);
    return () => clearInterval(id);
  }, [playing]);

  const status = sun.altitude <= 0 ? 'The sun is below the horizon.'
    : now.lit ? `Direct sun on the window — the sun is ${Math.round(sun.altitude)}° up, from ${Math.round(sun.azimuth)}°.`
      : now.why === 'behind' ? `The sun is behind this facade (${Math.round(sun.azimuth)}°), so the window is in the building's own shade.`
        : now.why === 'blocked' ? `Shaded by ${now.by === ownIdx ? 'its own building' : (buildings[now.by]?.label || 'a building')} — the sun is ${Math.round(sun.altitude)}° up.`
          : '';
  const period = sun.altitude <= 0 ? 'Below the horizon' : sun.altitude > 70 ? 'Sun nearly overhead'
    : sun.azimuth < 180 ? 'Morning sun, from the east' : sun.altitude < 20 ? 'Low sun, from the west' : 'Afternoon sun, from the west';

  if (!own) return null;
  /* Its own building counts: a wing of an L or a U shades its own windows,
     and a grid of empty months with nothing named beside it reads as a bug. */
  const blockers = (result?.blockers || []).slice(0, 3)
    .map(b => `${b.index === ownIdx ? 'its own building' : (buildings[b.index]?.label || 'an unnamed building')} (about ${(Math.round(b.minutes * 30.4 / 60 / 10) * 10).toLocaleString('en-SG')} hours a year)`);

  return (
    <section className="pane" id="sunward">
      <h2 className="sh"><span>Sun on a window</span><span className="mono">{period}</span></h2>
      <p className="hint" style={{ marginTop: 10 }}>Pick the floor and the way the window faces. The buildings around it
        are drawn from HDB&rsquo;s storey counts and OpenStreetMap.</p>

      <div className="sunctl">
        {tall.length > 1 && massing.own < 0 && (
          <label className="fld"><span className="lab">Which building</span>
            <select value={ownIdx} onChange={e => setOwnIdx(Number(e.target.value))}>
              {tall.map(b => <option key={b.i} value={b.i}>{b.label || `Building ${b.dist} m away`}</option>)}
            </select></label>
        )}
        <label className="fld"><span className="lab">Floor · {ordinal(storey)} of {own.src === 4 ? `at least ${maxStorey}` : maxStorey}</span>
          <input type="range" min={1} max={maxStorey} value={storey} onChange={e => setStorey(Number(e.target.value))} /></label>
        <div className="fld"><span className="lab">The window faces</span>
          <div className="seg sunfacing" role="group" aria-label="Facing">
            {FACINGS.map(f => <button key={f.key} aria-pressed={facing === f.key} onClick={() => { setFacing(f.key); setView(null); }}>{f.key}</button>)}
          </div></div>
      </div>

      <div className="sunview">
        <Scene buildings={buildings} ownIdx={ownIdx} win={win} lit={now.lit} sun={sun} camera={camera} />
        <div className="sunviewbar">
          <button type="button" className="ghost" onClick={() => setView(((camera - 45) % 360 + 360) % 360)} aria-label="Turn the view left">⟲</button>
          <button type="button" className="ghost" onClick={() => setView((camera + 45) % 360)} aria-label="Turn the view right">⟳</button>
        </div>
      </div>

      <DayCurve day={day} minute={minute} setMinute={setMinute} />
      <CurveAxis />
      <p className="hint" style={{ margin: '4px 0 0' }}>The line is the sun&rsquo;s height through the day; the shaded span is when this window is in direct sun.</p>
      <div className="sunclock">
        <label className="fld"><span className="lab">Month · 15th</span>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select></label>
        <label className="fld sunslider"><span className="lab">Time · {clock(minute)}</span>
          <input type="range" min={HOURS[0] * 60} max={HOURS[1] * 60} step={5} value={minute}
            onChange={e => { setPlaying(false); setMinute(Number(e.target.value)); }} /></label>
        <button type="button" className="ghost" onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play the day'}</button>
      </div>
      <p className="sunstatus" role="status">{status}</p>

      {result && (
        <Statement id="sun-window" title={`Direct sun on a ${ordinal(storey)}-floor, ${FACING_NAME[facing]}-facing window`}
          basis={`15th of each month · every ${STEP_MIN} minutes`}
          lede={<>{result.afternoonMinutesPerYear > 0
            ? <>About <b className="mono">{dur(Math.round(result.afternoonMinutesPerYear / 12))}</b> of direct sun after 3 pm on an average day.</>
            : <>No direct sun after 3 pm on any month&rsquo;s 15th.</>}</>}>
          <div className="tablewrap">
            <table className="sungrid">
              <thead><tr><th scope="col"><span className="vh">Month</span></th>
                {Array.from({ length: HOURS[1] - HOURS[0] }, (_, i) => HOURS[0] + i).map(h =>
                  <th key={h} scope="col">{((h + 11) % 12) + 1}{h < 12 ? 'a' : 'p'}</th>)}
                <th scope="col" className="r">A day</th></tr></thead>
              <tbody>
                {result.grid.map((row, mo) => (
                  <tr key={mo} className={mo === month ? 'on' : undefined}>
                    <th scope="row">{MONTHS[mo]}</th>
                    {row.map((m, i) => <td key={i} style={{ background: CELL(m) }} title={`${m} min`}><span className="vh">{m} minutes</span></td>)}
                    <td className="r mono">{hm(result.totals[mo])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="sunkey" aria-label="Minutes of direct sun in the hour">
            {[['1–15', 15], ['16–30', 30], ['31–45', 45], ['46–60', 60]].map(([t, m]) => <li key={t}><i style={{ background: CELL(m) }} />{t} min</li>)}
          </ul>
          <p className="stmt-foot">
            {blockers.length ? <>Shaded most by {blockers.join(', ')}. </> : null}
            {result.unknownMinutes > 0 && <>For about {Math.round(result.unknownMinutes * 30 / 60)} hours a year the sun&rsquo;s path crosses a building with no published height, counted here as not blocking it. </>}
            {massing.small > 0 && <>{massing.small} smaller buildings nearby (under {massing.minArea} m²) are not in the model.</>}
          </p>
        </Statement>
      )}

      <p className="prov">
        Sun: astronomy for {lat.toFixed(4)}°, {lon.toFixed(4)}° · Heights: HDB&rsquo;s storey count × {floor.hdb} m for HDB
        blocks; OpenStreetMap heights, or levels × {floor.osmLevel} m{anyMinimum ? <>; for condominium towers with neither, the
        lowest floor of URA&rsquo;s highest band sold × {floor.uraLevel || floor.osmLevel} m — a minimum, so a taller tower can shade more than shown</> : null}
        {' '}· {massing.licence} · read {massing.accessedAt}
      </p>
      <HowWorked title="What this shows, and what it leaves out">
        <p>For each month&rsquo;s 15th, every {STEP_MIN} minutes from 7 am to 7 pm, the window is in direct sun when the
          sun is above the horizon, in front of the facade, and no building of published height stands in the line
          between them. A building&rsquo;s height is HDB&rsquo;s own storey count for its blocks, or an OpenStreetMap height
          where one is tagged; anything else is drawn flat and never blocks the sun here.</p>
        <p>Trees, balconies, ledges, awnings and the window&rsquo;s own reveal are in no dataset and are not modelled. Near the
          equator the sun is high for most of the day, so a facade sees it mainly in the first and last hours — which is
          why a west-facing window&rsquo;s sun is late afternoon, and why the floor matters so much.</p>
        <p>The window sits on the side of {label} that faces the direction chosen, {storey > 1 ? `${((storey - 1) * floorH).toFixed(1)} m` : 'at ground level'} up;
          a unit in a different stack faces a different street.</p>
      </HowWorked>
    </section>
  );
}

/* The sun's height through the chosen day, with the minutes the window is
   lit drawn over it. Click or drag to move the clock. */
function DayCurve({ day, minute, setMinute }) {
  const W = 720, H = 90, pad = 4;
  const t0 = HOURS[0] * 60, t1 = HOURS[1] * 60;
  const x = t => pad + ((t - t0) / (t1 - t0)) * (W - pad * 2);
  const y = a => H - pad - (Math.max(a, 0) / 90) * (H - pad * 2);
  const line = day.map(d => `${x(d.t).toFixed(1)},${y(d.alt).toFixed(1)}`).join(' ');
  const svg = useRef(null);
  const pick = e => {
    const r = svg.current.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    setMinute(Math.round(Math.min(t1, Math.max(t0, t)) / 5) * 5);
  };
  return (
    <svg ref={svg} className="suncurve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"
      onClick={pick} onMouseMove={e => { if (e.buttons === 1) pick(e); }}>
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className="suncurve-ground" />
      {day.map((d, i) => d.lit && day[i + 1] ? (
        <rect key={i} x={x(d.t)} width={x(day[i + 1].t) - x(d.t)} y={pad} height={H - pad * 2} className="suncurve-lit" />
      ) : null)}
      <polyline points={line} className="suncurve-line" vectorEffect="non-scaling-stroke" />
      <line x1={x(minute)} x2={x(minute)} y1={pad} y2={H - pad} className="suncurve-now" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CurveAxis() {
  return (
    <div className="suncurve-axis" aria-hidden="true">
      <span>7 am</span><span>10 am</span><span>1 pm</span><span>4 pm</span><span>7 pm</span>
    </div>
  );
}

/* The neighbourhood in a tilted view from the chosen side, with the ground
   shadows at the chosen moment. Painter's order: far buildings first. */
function Scene({ buildings, ownIdx, win, lit, sun, camera }) {
  const wrap = useRef(null), cv = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const h = Math.round(w * 0.56);

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

    const th = camera * RAD, tilt = 38 * RAD;
    const cs = [Math.sin(th), Math.cos(th)];                  // towards the camera
    const radius = 210;             // the scale; the model reaches further and is clipped at the edge
    const s = Math.min(w / (radius * 2.1), h / (radius * 2 * Math.sin(tilt) + 140 * Math.cos(tilt)));
    const P = (x, y, zz = 0) => {
      const toward = x * cs[0] + y * cs[1];
      const lateral = x * cs[1] - y * cs[0];
      return [w / 2 + lateral * s, h * 0.62 + toward * s * Math.sin(tilt) - zz * s * Math.cos(tilt)];
    };
    const poly = (pts, fill, stroke) => {
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.stroke(); }
    };

    // Ground shadows first, under everything.
    g.globalAlpha = 0.16;
    for (const b of buildings) {
      const sh = groundShadow(b.ring, b.m, sun);
      if (sh) poly(sh.map(([x, y]) => P(x, y)), v('--ink'));
    }
    g.globalAlpha = 1;

    const order = buildings.map((b, i) => ({ b, i, c: b.ring.reduce((a, p) => a + p[0] * cs[0] + p[1] * cs[1], 0) / b.ring.length }))
      .sort((a, b) => a.c - b.c);
    const sunDir = [sun.dx, sun.dy];
    for (const { b, i } of order) {
      const mine = i === ownIdx;
      if (b.m === null) {
        g.setLineDash([3, 3]); g.lineWidth = 1;
        poly(b.ring.map(([x, y]) => P(x, y)), null, v('--mute'));
        g.setLineDash([]);
        continue;
      }
      // Walls facing the camera, then the roof.
      let area = 0;
      for (let k = 0, j = b.ring.length - 1; k < b.ring.length; j = k++) area += b.ring[j][0] * b.ring[k][1] - b.ring[k][0] * b.ring[j][1];
      const ccw = area > 0;
      for (let k = 0, j = b.ring.length - 1; k < b.ring.length; j = k++) {
        const [x1, y1] = b.ring[j], [x2, y2] = b.ring[k];
        const n = ccw ? [y2 - y1, -(x2 - x1)] : [-(y2 - y1), x2 - x1];
        if (n[0] * cs[0] + n[1] * cs[1] <= 0) continue;
        const litWall = sun.altitude > 0 && n[0] * sunDir[0] + n[1] * sunDir[1] > 0;
        const fill = mine ? (litWall ? v('--acc-soft') : v('--acc')) : (litWall ? v('--card') : v('--w5'));
        g.lineWidth = 0.6;
        poly([P(x1, y1), P(x2, y2), P(x2, y2, b.m), P(x1, y1, b.m)], fill, v('--line'));
      }
      poly(b.ring.map(([x, y]) => P(x, y, b.m)), mine ? v('--acc') : v('--paper'), v('--edge'));
    }

    if (win) {
      const [wx, wy] = P(win.x, win.y, win.z);
      g.fillStyle = lit ? v('--acc-lit') : v('--ink');
      g.strokeStyle = v('--card'); g.lineWidth = 2;
      g.beginPath(); g.rect(wx - 5, wy - 5, 10, 10); g.fill(); g.stroke();
    }

    // North, and where the sun is, relative to this view.
    const arrow = (bearing, len, colour, text) => {
      const b = (bearing - camera) * RAD;
      const cx = w - 40, cy = 40;
      const ex = cx + Math.sin(b) * len, ey = cy - Math.cos(b) * len * -1;
      g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
      g.font = '11.5px "IBM Plex Mono", monospace'; g.fillText(text, ex + 4, ey + 4);
    };
    arrow(0, 22, v('--ink2'), 'N');
    if (sun.altitude > 0) arrow(sun.azimuth, 26, v('--acc-lit'), 'sun');
  }, [w, h, buildings, ownIdx, win?.x, win?.y, win?.z, lit, sun.azimuth, sun.altitude, camera]);

  return <div className="sunscene" ref={wrap} style={{ aspectRatio: '1 / 0.56' }}><canvas ref={cv} aria-hidden="true" style={{ width: '100%', height: h || undefined }} /></div>;
}
