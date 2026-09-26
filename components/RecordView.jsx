'use client';
import { Fragment, useState } from 'react';
import { f, fk, mLabel } from './fmt.js';
import { titleCase } from '../lib/name.js';
import { Grow, withTransition } from './Motion.jsx';
import { hdbFlatLabel } from '../lib/blindspot/unit.js';
import Statement from './Statement.jsx';

/**
 * One block or one project.
 *
 * `afterSummary` is rendered between the figures and the monthly chart. It
 * exists because the fork — the two questions this page answers — has to sit
 * directly under the numbers to do its job, and this component is one long
 * run: figures, chart, every filed transaction, then the range note. Appending
 * the fork after all of that put it nine hundred pixels down the page, which
 * is the same burial it was written to fix.
 *
 * Compliance, do not strip:
 *  · the headline is an observed psf range, never a point valuation (rule 2)
 *  · every derived figure carries its source and period (rule 6)
 *  · YoY and the trend chart are computed across all types, so both hide when
 *    a single type is selected — otherwise the figure beside them is a lie
 */
export default function RecordView({ rec, attribution = [], onType, afterSummary = null }) {
  const [rtype, setRtype] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const types = rec.flatTypes || rec.propertyTypes || [];
  const rv = (rtype && rec.byType?.[rtype]) ? { ...rec, ...rec.byType[rtype] } : rec;
  const spread = rv.n === 1
    ? null
    : Math.round(((rv.maxPsf - rv.minPsf) / rv.medianPsf) * 100);
  const recent = rtype
    ? (rec.recent || []).filter(t => (t.flatType || t.propertyType) === rtype)
    : (rec.recent || []);

  /* ── sales that arrive identical, and are listed once ─────────────────────
     Kew Drive showed the same terrace three times — 212.6 sqm, S$3,000,000,
     2025-06 — then the same pair again twice more, nine rows for three
     distinct sets of particulars. It reads as a bug in the page, and it is
     not: URA's Data Service returns those three inside a single project
     entry. Measured, not assumed — the raw batches were fetched and checked,
     and cross-batch overlap accounts for 22 rows in the whole country while
     8,341 arrive repeated within one entry.

     So nothing is removed, because the two families behave differently and
     one edit cannot be right for both. NON-LANDED repeats look real: 8.6% of
     rows sit in a repeated group and the multiplicity has the long tail a
     launch produces — x4:176, x5:50, x8:11 — concentrated in Parc Clematis,
     Parktown Residence and Grand Dunman. Identical units in one launch really
     do sell at one price in one month, and dropping them would understate
     volume and drag every median.

     LANDED does not look real: 33.1% of rows are in a repeated group and the
     multiplicity stops dead at three — 944 pairs, 761 triples, then x4:1 and
     x5:2. Real clustering has a tail; a cliff at three is a systems artifact.
     Kew Drive is twenty rows, seven distinct, every one of them a multiple,
     including a 1,335.6 sqm detached at S$16,300,000 three times in one
     month.

     That is strong evidence and not proof, and deleting a filed sale on a
     hunch is worse than showing it. So the display groups and the data is
     left alone: the particulars appear once, the count appears beside them,
     the page says it cannot tell the two cases apart, and every figure
     elsewhere still counts all of them.

     HDB's feed does not need this — 62 rows in 79,032 — but it costs nothing
     there and the same page renders both. */
  const filed = (() => {
    const by = new Map();
    for (const t of recent) {
      const k = [t.areaSqm, t.storey, t.floor, t.price, t.month, t.saleType,
                 t.flatType, t.propertyType, t.model].join('|');
      if (by.has(k)) by.get(k).n += 1;
      else by.set(k, { ...t, n: 1 });
    }
    return [...by.values()];
  })();

  /* Wrapped, because changing flat type rewrites the median, the range, the
     spread, the chart and every transaction row in the same frame. Unwrapped
     that reads as a flicker; inside a transition it reads as the figures
     changing, which is what actually happened. */
  const pick = t => withTransition(() => {
    setRtype(t);
    onType?.(t, t && rec.byType?.[t] ? { ...rec, ...rec.byType[t] } : rec);
  });

  return (
    <>
      {/* The median leads and the range sits beside it. Someone arriving from
          a search wants one number; the range is what stops that number being
          mistaken for a valuation, so the two must stay together. */}
      <div className="figwrap record-figure">
        <div>
          <span className="lab">Median, per square foot</span>
          <div className="big">{Number(rv.medianPsf).toLocaleString('en-SG')}<small> psf</small></div>
        </div>
        {/* ── one sale is not a range ───────────────────────────────────────
            985 records carry exactly one filed transaction and 3,056 carry
            fewer than four. A single sale rendered as "$527 — $527 psf",
            "0% Spread, low to high" and "median price" — three statistics
            that need a distribution, printed over a distribution of one, with
            a note underneath calling it "the real one".

            Nothing is hidden: the figure is the same figure. It is described
            as what it is, which is the same rule the rest of the site follows
            when a check cannot run. */}
        <div className="figside">
          <span className="lab">{rv.n === 1 ? 'The one filed sale' : 'Observed range'}</span>
          <div className="r record-range">
            {rv.n === 1
              ? <><b>S${Number(rv.medianPsf).toLocaleString('en-SG')} psf</b>
                  <span>{fk(rv.medianPrice)} · one filed transaction</span></>
              : <><b>S${Number(rv.minPsf).toLocaleString('en-SG')} — S${Number(rv.maxPsf).toLocaleString('en-SG')} psf</b>
                  <span>{rv.n} filed transactions · {spread}% low to high</span>
                  <span>{fk(rv.medianPrice)} median filed price</span></>}
          </div>
        </div>
      </div>

      {types.length > 1 && (
        <p className="hint" style={{ margin: '10px 0 0' }}>
          {rec.kind === 'HDB' ? 'Flat types filed at this block; choose the one relevant to your unit.' : 'Property types filed at this project.'}
        </p>
      )}
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
      {rec.kind === 'HDB' && types.length === 1 && (
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Flat type filed here: <b>{hdbFlatLabel(types[0])}</b>.
          Confirm the specific unit&rsquo;s type from its listing before running Blindspot.
        </p>
      )}

      {/* YoY is computed across all types — never show it beside a filtered figure. */}
      {!rtype && rec.yoy != null && (
        <span className={'pill ' + (rec.yoy>=0?'u':'d')}>
          {rec.yoy>=0?'▲':'▼'} {Math.abs(rec.yoy).toFixed(1)}% vs 12 months ago
        </span>
      )}

      {rec.source && (
        <p className="prov">{rec.source} · {rec.period?.from} to {rec.period?.to} · accessed {rec.accessedAt}</p>
      )}

      {afterSummary}

      {!rtype && rec.series?.length > 1 && (() => {
        const srs = rec.series.slice(-24);
        const vals = srs.map(s => s.median);
        const mn = Math.min(...vals)*0.985, mx = Math.max(...vals)*1.005;
        return (<>
          <h2 className="sh" id="history"><span>Median price by month</span>
            <span>{srs.length} months with a sale</span></h2>
          <Grow>
            <div className="bars">{srs.map((s,i)=>(
              <i key={s.month} className={i===srs.length-1?'last':''}
                 style={{height:(8+(s.median-mn)/(mx-mn)*88)+'%','--i':i}}
                 title={`${s.month} · ${f(s.median)} · ${s.n} sale${s.n>1?'s':''}`} />
            ))}</div>
          </Grow>
          {/* The axis used to carry two dates and nothing else, so the one
              element on a page built around filed figures was the one you
              could not read a figure off. The ends now carry their own value.
              A reader who wants the rest hovers a bar, and a reader who wants
              all of them has the filed sales listed directly below. */}
          <div className="axis">
            <span className="lab">{mLabel(srs[0].month)} · {fk(srs[0].median)}</span>
            <span className="lab">{mLabel(srs.at(-1).month)} · {fk(srs.at(-1).median)}</span>
          </div>
        </>);
      })()}

      {/* The evidence behind the headline, set as the page's statement
          (components/Statement.jsx): these rows are the reason the range
          above can be trusted, and at 14px under a grey label they read as
          a footnote to it. The note on why it is a range closes it. */}
      {recent.length > 0 ? (
        <Statement id="transactions" title="The transactions behind those figures"
          basis={`${recent.length} of ${rv.n} · filed, nothing modelled`}
          lede={rec.kind !== 'HDB' ? 'URA does not include the number of bedrooms in a sale record.' : null}>
          {/* Eight, then the rest on request. A block with forty filed sales put
              forty rows between the chart and everything below it, and nobody
              reads the twenty-ninth. They are all still here, and still in the
              page for anyone who wants them — one click, not a fetch. */}
          {filed.slice(0, showAll ? filed.length : 8).map((t,i)=>(
            <div className="txn" key={i}>
              <div>
                <b>{[
                  t.areaSqm && `${t.areaSqm} sqm`,
                  t.storey ? `storey ${t.storey.replace(' TO ','–')}` : (t.floor && t.floor !== '-' ? `floor ${t.floor}` : null),
                ].filter(Boolean).join('  ·  ') || '—'}</b>
                {/* Each part unbroken: at 390px the line wrapped inside the
                    month and printed "2026-" over "08". */}
                <span className="lab">{[
                  !rtype && (t.flatType || t.propertyType), t.model, t.saleType, t.month,
                ].filter(Boolean).map((part, k) => (
                  <Fragment key={k}>{k > 0 && ' · '}<span className="nobr">{part}</span></Fragment>
                ))}</span>
              </div>
              <div className="r">
                {/* Inside the <b>, because `.txn b` is display:block and a
                    sibling span would drop to its own line — the count belongs
                    beside the price it counts. */}
                <b>{f(t.price)}{t.n > 1 && <span className="txnrep" title={
                  `${t.n} sales filed with these particulars. Listed once; counted ${t.n} times in every figure on this page.`
                }>&times;{t.n}</span>}</b>
                <span className="lab">${Math.round(t.psf)} psf</span></div>
            </div>
          ))}
          {filed.length > 8 && (
            <button type="button" className="ghost" style={{ marginTop: 12 }} onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show the most recent eight' : `Show all ${filed.length} rows`}
            </button>
          )}
          {filed.length < recent.length && (
            <p className="stmt-foot">
              {recent.length - filed.length === 1 ? 'One row arrives' : `${recent.length - filed.length} rows arrive`}{' '}
              with particulars identical to another and {recent.length - filed.length === 1 ? 'is' : 'are'} listed
              once with a count. Nothing is removed: every figure above counts them all.
            </p>
          )}
          <p className="stmt-foot">
            {rv.n === 1 ? (<>
              <b>One filed sale is not a range.</b> It is what was filed here once, not a level this
              address trades at — the nearby sales below are the wider evidence.
            </>) : (<>
              <b>Why a range, not one number.</b> No record shows your floor, facing, renovation or
              lease, and where your unit sits inside this spread depends on them.
            </>)}
          </p>
        </Statement>
      ) : (
        <div className="note">
          {rv.n === 1 ? (<>
            <b>One filed sale is not a range.</b> It is what was filed here once, not a level this
            address trades at — the nearby sales below are the wider evidence.
          </>) : (<>
            <b>Why a range, not one number.</b> No record shows your floor, facing, renovation or
            lease, and where your unit sits inside this spread depends on them.
          </>)}
        </div>
      )}

      {attribution.length > 0 && (
        <details className="licence-details">
          <summary>Dataset licences and attribution</summary>
          <div>
            {attribution.map((a,i)=><span className="lab" key={i}>{a}</span>)}
          </div>
        </details>
      )}
    </>
  );
}
