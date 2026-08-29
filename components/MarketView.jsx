'use client';
import { useMemo, useState } from 'react';
import Chart from './Chart.jsx';

/** The arrow already carries direction, so the number never repeats the sign.
 *  Movement under 0.05% rounds to "0.0%", which reads as a fall that did not
 *  happen — call that flat instead. */
const FLAT = 0.05;
const pct = n => Math.abs(n).toFixed(1) + '%';
const qLabel = q => q.replace('-Q', ' Q');

/**
 * The "how's the market" answer. Two series, both government-sourced, both
 * carrying the date they were taken — no figure appears without its provenance.
 */
export default function MarketView({ idx, rates, mop }) {
  const [span, setSpan] = useState(20);   // quarters shown

  // A rate is only "live" if it was actually fetched recently. MAS goes down for
  // maintenance, so the file on disk can be days old — say so rather than let a
  // stale figure pass as current.
  const ageDays = iso => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);
  const rateAge = ageDays(rates?.accessedAt);
  const rateStale = rateAge != null && rateAge > 7;

  return (
    <>
      {idx && <IndexPanel idx={idx} />}

      {rates && (() => {
        const pts = rates.points.slice(-180);
        const dn = (rates.yoyPts ?? 0) <= 0;
        return (
          <div style={{marginTop:30,paddingTop:22,borderTop:'1px solid var(--line)'}}>
            <span className="lab">SORA · the rate your mortgage is priced off</span>
            <div className="big">{rates.latest.sora.toFixed(2)}<span style={{fontSize:'.4em',letterSpacing:0}}>%</span></div>
            <p className="meta">{rates.latest.date}</p>
            {rates.yoyPts != null && (
              Math.abs(rates.yoyPts) < 0.01
                ? <span className="pill">Flat vs a year ago</span>
                : <span className={'pill ' + (dn?'u':'d')}>
                    {dn?'▼':'▲'} {Math.abs(rates.yoyPts).toFixed(2)} pts vs a year ago
                  </span>
            )}

            {(rates.latest.m1 || rates.latest.m3 || rates.latest.m6) && (
              <div className="kpi3" style={{marginTop:16}}>
                <div><div className="v">{fmtPct(rates.latest.m1)}</div><span className="lab">1M compounded</span></div>
                <div><div className="v">{fmtPct(rates.latest.m3)}</div><span className="lab">3M compounded</span></div>
                <div><div className="v">{fmtPct(rates.latest.m6)}</div><span className="lab">6M compounded</span></div>
              </div>
            )}

            <Chart
              points={pts.map(p => ({ label: p.date, value: p.sora }))}
              format={v => v.toFixed(2)} unit="%"
              ariaLabel={`SORA, ${pts.length} readings from ${pts[0].date} to ${pts.at(-1).date}.`} />
            <p className="prov">{rates.source} · rate as at {rates.latest.date} · fetched {rates.accessedAt.slice(0,10)}{rateAge > 0 ? ` (${rateAge} day${rateAge>1?'s':''} ago)` : ''}</p>
            {rateStale && (
              <div className="warn" style={{marginTop:10}}>
                <p style={{margin:0}}><b>This rate has not refreshed in {rateAge} days.</b> Treat it as
                  indicative, not current — check with your banker before relying on it.</p>
              </div>
            )}

            <div className="note">
              <b>Why this matters more than the index.</b> Most floating packages are quoted as a spread over
              compounded SORA, so this number is what actually moves your monthly payment. An HDB concessionary
              loan is different — that has sat at 2.6% p.a. and does not track SORA at all.
            </div>
          </div>
        );
      })()}

      {mop && (
        <div style={{marginTop:30,paddingTop:22,borderTop:'1px solid var(--line)'}}>
          <span className="lab">Supply reaching its fifth year</span>
          <div className="big">{mop.totals.upcomingUnits.toLocaleString('en-SG')}</div>
          <p className="meta">units across {mop.totals.upcomingBlocks.toLocaleString('en-SG')} blocks · {mop.generatedForYear}–{mop.generatedForYear + 4}</p>
          <p className="hint" style={{marginTop:10}}>
            <a href="/mop">See which towns and which years →</a>
          </p>
        </div>
      )}
    </>
  );
}

const fmtPct = v => (Number.isFinite(v) ? v.toFixed(2) + '%' : '—');

/** One movement pill. Flat is stated as flat, not as a rounded-away fall. */
function Move({ v, label }) {
  if (v == null) return null;
  if (Math.abs(v) < FLAT) return <span className="pill">Flat {label}</span>;
  const up = v > 0;
  return <span className={'pill ' + (up ? 'u' : 'd')}>{up ? '▲' : '▼'} {pct(v)} {label}</span>;
}

/**
 * The index, with a comparison you choose.
 *
 * A single line running from 1990 answers "is it up", which everyone already
 * knows. The question people actually arrive with is "up by how much SINCE",
 * and the since is different for everyone — since I bought, since the cooling
 * measures, since covid, since last year. So the two ends are pickable, the
 * chart shades the span between them, and the figures underneath are computed
 * from the two quarters chosen rather than from a fixed window.
 *
 * The annualised figure is the one worth having and the one most places leave
 * out: 88% over nineteen years and 88% over four are not the same market, and
 * only the compound rate says so.
 *
 * Still an index, never a price — the note below the chart stays.
 */
function IndexPanel({ idx }) {
  const pts = idx.points;
  const [from, setFrom] = useState(Math.max(0, pts.length - 21));
  const [to, setTo] = useState(pts.length - 1);

  const lo = Math.min(from, to), hi = Math.max(from, to);
  const a = pts[lo], b = pts[hi];

  const cmp = useMemo(() => {
    if (!a || !b || a.index <= 0) return null;
    const quarters = hi - lo;
    const change = ((b.index - a.index) / a.index) * 100;
    const years = quarters / 4;
    // Compound annual growth, not the change divided by the years — the second
    // one flatters long spans and is the reason "up 88%" gets quoted without
    // anyone saying over what.
    const annual = years > 0 ? ((b.index / a.index) ** (1 / years) - 1) * 100 : null;
    return { quarters, years, change, annual };
  }, [a, b, lo, hi]);

  const opt = (p, i) => <option key={p.quarter} value={i}>{qLabel(p.quarter)} — {p.index.toFixed(1)}</option>;

  return (
    <>
      <span className="lab">HDB resale price index · {idx.base}</span>
      <div className="big">{idx.latest.index.toFixed(1)}</div>
      <p className="meta">{qLabel(idx.latest.quarter)} · index, not a price</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0 0'}}>
        <Move v={idx.yoy} label="vs a year ago" />
        <Move v={idx.qoq} label="on the quarter" />
      </div>

      <div className="cmpbar">
        <label><span className="filtn">Compare from</span>
          <select value={lo} onChange={e => setFrom(Number(e.target.value))}>
            {pts.map(opt)}
          </select>
        </label>
        <label><span className="filtn">To</span>
          <select value={hi} onChange={e => setTo(Number(e.target.value))}>
            {pts.map(opt)}
          </select>
        </label>
      </div>

      {cmp && (
        <div className="kpi3 cmpout">
          <div>
            <div className="v">{cmp.change >= 0 ? '+' : '−'}{Math.abs(cmp.change).toFixed(1)}%</div>
            <span className="lab">{qLabel(a.quarter)} to {qLabel(b.quarter)}</span>
          </div>
          <div>
            <div className="v">{cmp.annual == null ? '—' : `${cmp.annual >= 0 ? '+' : '−'}${Math.abs(cmp.annual).toFixed(1)}%`}</div>
            <span className="lab">a year, compounded</span>
          </div>
          <div>
            <div className="v">{a.index.toFixed(1)} → {b.index.toFixed(1)}</div>
            <span className="lab">{cmp.quarters} quarters</span>
          </div>
        </div>
      )}

      <Chart
        points={pts.map(p => ({ label: qLabel(p.quarter), value: p.index }))}
        format={v => v.toFixed(1)}
        markFrom={lo} markTo={hi}
        ariaLabel={`HDB resale price index, ${pts.length} quarters from ${qLabel(pts[0].quarter)} to ${qLabel(idx.latest.quarter)}. Comparing ${qLabel(a.quarter)} with ${qLabel(b.quarter)}.`} />

      <p className="prov">{idx.source} · {idx.points[0].quarter} to {idx.latest.quarter} · accessed {idx.accessedAt.slice(0,10)}</p>

      <div className="note" style={{marginTop:4}}>
        <b>An index is not a price.</b> It tracks the whole country&apos;s resale market against 1Q2009.
        It tells you the direction of travel — it cannot tell you what your flat is worth, because it
        knows nothing about your block, your floor or your lease.
      </div>
    </>
  );
}
