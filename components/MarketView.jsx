'use client';
import { useState } from 'react';
import { mLabel } from './fmt.js';

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
      {idx && (() => {
        const pts = idx.points.slice(-span);
        const vals = pts.map(p => p.index);
        const mn = Math.min(...vals) * 0.985, mx = Math.max(...vals) * 1.005;
        const up = (idx.yoy ?? 0) >= 0;
        return (
          <>
            <span className="lab">HDB resale price index · {idx.base}</span>
            <div className="big">{idx.latest.index.toFixed(1)}</div>
            <p className="meta">{qLabel(idx.latest.quarter)} · index, not a price</p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0 0'}}>
              <Move v={idx.yoy} label="vs a year ago" />
              <Move v={idx.qoq} label="on the quarter" />
            </div>

            <div className="seg" style={{marginTop:14}}>
              {[[8,'2 yrs'],[20,'5 yrs'],[40,'10 yrs'],[idx.points.length,'All']].map(([n,l]) => (
                <button key={l} aria-pressed={span===n} onClick={()=>setSpan(n)}>{l}</button>
              ))}
            </div>

            <div className="bars" style={{marginTop:12}}>
              {pts.map((p,k)=>(
                <i key={p.quarter} className={k===pts.length-1?'last':''}
                   style={{height:(8+(p.index-mn)/(mx-mn)*88)+'%'}}
                   title={`${qLabel(p.quarter)} · ${p.index.toFixed(1)}`} />
              ))}
            </div>
            <div className="axis">
              <span className="lab">{qLabel(pts[0].quarter)}</span>
              <span className="lab">{qLabel(pts.at(-1).quarter)}</span>
            </div>
            <p className="prov">{idx.source} · {idx.points[0].quarter} to {idx.latest.quarter} · accessed {idx.accessedAt.slice(0,10)}</p>

            <div className="note" style={{marginTop:4}}>
              <b>An index is not a price.</b> It tracks the whole country&apos;s resale market against 1Q2009.
              It tells you the direction of travel — it cannot tell you what your flat is worth, because it
              knows nothing about your block, your floor or your lease.
            </div>
          </>
        );
      })()}

      {rates && (() => {
        const pts = rates.points.slice(-180);
        const vals = pts.map(p => p.sora);
        const mn = Math.min(...vals) * 0.97, mx = Math.max(...vals) * 1.02;
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

            <div className="bars" style={{marginTop:12}}>
              {pts.map((p,k)=>(
                <i key={p.date} className={k===pts.length-1?'last':''}
                   style={{height:(8+(p.sora-mn)/(mx-mn)*88)+'%'}}
                   title={`${p.date} · ${p.sora.toFixed(2)}%`} />
              ))}
            </div>
            <div className="axis">
              <span className="lab">{pts[0].date}</span><span className="lab">{pts.at(-1).date}</span>
            </div>
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
