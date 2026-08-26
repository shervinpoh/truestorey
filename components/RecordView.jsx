'use client';
import { useState } from 'react';
import { f, fk, mLabel } from './fmt.js';
import { titleCase } from '../lib/name.js';

/**
 * One block or one project. Rendered identically by the homepage flow and by
 * the static page at its own URL — one renderer, so the two can never drift.
 *
 * Compliance, do not strip:
 *  · the headline is an observed psf range, never a point valuation (rule 2)
 *  · every derived figure carries its source and period (rule 6)
 *  · YoY and the trend chart are computed across all types, so both hide when
 *    a single type is selected — otherwise the figure beside them is a lie
 */
export default function RecordView({ rec, attribution = [], onType }) {
  const [rtype, setRtype] = useState(null);

  const types = rec.flatTypes || rec.propertyTypes || [];
  const rv = (rtype && rec.byType?.[rtype]) ? { ...rec, ...rec.byType[rtype] } : rec;
  const recent = rtype
    ? (rec.recent || []).filter(t => (t.flatType || t.propertyType) === rtype)
    : (rec.recent || []);

  const pick = t => { setRtype(t); onType?.(t, t && rec.byType?.[t] ? { ...rec, ...rec.byType[t] } : rec); };

  return (
    <>
      {/* The median leads and the range sits beside it. Someone arriving from
          a search wants one number; the range is what stops that number being
          mistaken for a valuation, so the two must stay together. */}
      <div className="figwrap">
        <div>
          <span className="lab">Median, per square foot</span>
          <div className="big">{Number(rv.medianPsf).toLocaleString('en-SG')}<small> psf</small></div>
        </div>
        <div className="figside">
          <span className="lab">Observed range</span>
          <div className="r">
            ${Number(rv.minPsf).toLocaleString('en-SG')} — ${Number(rv.maxPsf).toLocaleString('en-SG')} psf<br />
            {fk(rv.medianPrice)} median price
          </div>
        </div>
      </div>
      <p className="meta">{[
        rec.kind === 'HDB' ? titleCase(rec.town) : `District ${rec.district} · ${rec.segment}`,
        rec.kind === 'HDB'
          ? `lease to ${rec.leaseCommence + 99} · ${rec.remainingLease} left`
          : (Array.isArray(rec.tenure) ? 'mixed tenure' : rec.tenure),
        `${rv.n} filed transaction${rv.n === 1 ? '' : 's'}`,
      ].filter(Boolean).join(' · ')}</p>

      {types.length > 1 && (
        <div className="seg" style={{marginTop:12}}>
          <button aria-pressed={!rtype} onClick={()=>pick(null)}>All</button>
          {types.map(x => (
            <button key={x} aria-pressed={rtype===x} onClick={()=>pick(x)}>
              {x.replace(' ROOM','-rm').replace('EXECUTIVE','Exec').replace('Executive Condominium','EC')}
            </button>
          ))}
        </div>
      )}

      {/* YoY is computed across all types — never show it beside a filtered figure. */}
      {!rtype && rec.yoy != null && (
        <span className={'pill ' + (rec.yoy>=0?'u':'d')}>
          {rec.yoy>=0?'▲':'▼'} {Math.abs(rec.yoy).toFixed(1)}% vs 12 months ago
        </span>
      )}

      <div className="kpi3">
        <div><div className="v">{fk(rv.medianPrice)}</div><span className="lab">Median price</span></div>
        <div><div className="v">{rv.n}</div><span className="lab">Filed transactions</span></div>
        <div><div className="v">{Math.round(((rv.maxPsf - rv.minPsf) / rv.medianPsf) * 100)}%</div>
          <span className="lab">Spread, low to high</span></div>
      </div>

      {rec.source && (
        <p className="prov">{rec.source} · {rec.period?.from} to {rec.period?.to} · accessed {rec.accessedAt}</p>
      )}

      {!rtype && rec.series?.length > 1 && (() => {
        const srs = rec.series.slice(-24);
        const vals = srs.map(s => s.median);
        const mn = Math.min(...vals)*0.985, mx = Math.max(...vals)*1.005;
        return (<>
          <div className="sh"><span>Median price by month</span>
            <span>{srs.length} months with a sale</span></div>
          <div className="bars">{srs.map((s,i)=>(
            <i key={s.month} className={i===srs.length-1?'last':''}
               style={{height:(8+(s.median-mn)/(mx-mn)*88)+'%'}}
               title={`${s.month} · ${f(s.median)} · ${s.n} sale${s.n>1?'s':''}`} />
          ))}</div>
          <div className="axis">
            <span className="lab">{mLabel(srs[0].month)}</span>
            <span className="lab">{mLabel(srs.at(-1).month)}</span>
          </div>
        </>);
      })()}

      {recent.length > 0 && (<>
        <div className="sh"><span>The transactions behind those figures</span>
          <span>{recent.length} of {rv.n}</span></div>
        <p className="hint" style={{marginTop:10}}>Nothing modelled — these are the filed sales.</p>
        {recent.map((t,i)=>(
          <div className="txn" key={i}>
            <div>
              <b>{[
                t.areaSqm && `${t.areaSqm} sqm`,
                t.storey ? `storey ${t.storey.replace(' TO ','–')}` : (t.floor && t.floor !== '-' ? `floor ${t.floor}` : null),
              ].filter(Boolean).join('  ·  ') || '—'}</b>
              <span className="lab">{[
                !rtype && (t.flatType || t.propertyType), t.model, t.saleType, t.month,
              ].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="r"><b>{f(t.price)}</b><br /><span className="lab">${Math.round(t.psf)} psf</span></div>
          </div>
        ))}
      </>)}

      <div className="note"><b>Why a range, not one number.</b> Valuation tools routinely disagree by
        S$15,000–S$80,000 on the same home, because none can see your floor, facing, renovation or lease.
        The spread above is the real one — the cheapest and dearest psf actually filed here over the period.
        Where your unit sits inside it depends on the things the data cannot see.</div>

      {attribution.length > 0 && (
        <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid var(--line2)'}}>
          {attribution.map((a,i)=><span className="lab" key={i} style={{display:'block'}}>{a}</span>)}
        </div>
      )}
    </>
  );
}
