'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { f, num } from './fmt.js';
import { titleCase } from '../lib/name.js';
import { Figure, still } from './Motion.jsx';
import MoneyInput from './MoneyInput.jsx';

/**
 * Blindspot — four checks, one score, every point traceable.
 *
 * The design job here is entirely about stopping a number being read as a
 * verdict. Three things do that work:
 *
 *   · The score is rendered as "4 of 6", never as a bare figure, and the
 *     denominator is what actually ran.
 *   · Every check shows the figure and the source that produced its points, so
 *     the arithmetic is checkable rather than trusted.
 *   · Checks that could not run are listed as loudly as the ones that did. A
 *     tool that hides what it could not measure is telling the reader the place
 *     is safer than it has any way of knowing.
 *
 * The paragraph at the top is written by a model. The number never is.
 */
export default function BlindspotReport() {
  const params = useSearchParams();
  const from = params.get('from') || '';
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(null);
  const [prefill, setPrefill] = useState(from ? 'loading' : 'idle');
  const [price, setPrice] = useState('');
  const [area, setArea] = useState('');
  const [state, setState] = useState('idle');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const box = useRef(null);

  // A record page already knows the property. Make the reader supply only the
  // two facts it cannot know: the actual asking price and this unit's area.
  // The record itself is fetched from its public href rather than copied into
  // the query string. The median is deliberately NOT carried across — putting
  // it into a field labelled "what it is being asked for" would turn a filed
  // middle into a seller's claim that nobody made.
  useEffect(() => {
    if (!from) { setPrefill('idle'); return; }
    const ctl = new AbortController();
    setPrefill('loading');
    fetch(`/api/record?href=${encodeURIComponent(from)}`, { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('no record'))))
      .then(rec => {
        setPicked({
          href: rec.href,
          label: rec.label,
          n: rec.n,
          sub: rec.kind === 'HDB' ? titleCase(rec.town) : `District ${rec.district}`,
        });
        setQ('');
        setPrefill('done');
      })
      .catch(e => { if (e.name !== 'AbortError') setPrefill('failed'); });
    return () => ctl.abort();
  }, [from]);

  const term = q.trim();
  useEffect(() => {
    if (term.length < 2 || picked) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=6`);
        const j = await r.json();
        setHits(j.results || []);
      } catch { setHits([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [term, picked]);

  const ready = picked && Number(price) > 0 && Number(area) > 0;
  const psf = ready ? Math.round(Number(price) / Number(area)) : null;

  async function run(e) {
    e.preventDefault();
    if (!ready || state === 'loading') return;
    setState('loading'); setError(''); setReport(null);
    try {
      const res = await fetch('/api/ai/blindspot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ href: picked.href, askPrice: Number(price), areaSqft: Number(area) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'That did not work.');
      setReport(j); setState('done');
      // Jump rather than glide for a reader who has asked for less motion.
      // The report can be a screen and a half, so this is one of the longest
      // travels on the site — and arriving is the point, not the journey.
      requestAnimationFrame(() => box.current?.scrollIntoView({
        behavior: still() ? 'auto' : 'smooth', block: 'start',
      }));
    } catch (err) {
      setError(err.message); setState('error');
    }
  }

  return (
    <>
      <form onSubmit={run}>
        <div className="fld">
          <label className="lab" htmlFor="bs-q" style={{ display: 'block', marginBottom: 6 }}>
            The block or project
          </label>
          {prefill === 'loading' ? (
            <div className="mapfocus" style={{ marginTop: 0 }}>
              <b>Loading the property…</b>
              <span>Carrying the record into these checks</span>
            </div>
          ) : picked ? (
            <div className="mapfocus" style={{ marginTop: 0 }}>
              <b>{titleCase(picked.label)}</b>
              <span className="mono">{picked.sub} · {num(picked.n)} filed</span>
              {from && <Link href={from}>← Back to the property</Link>}
              <button type="button" className="linkish" style={{ marginLeft: from ? 0 : 'auto' }}
                onClick={() => { setPicked(null); setQ(''); setReport(null); setState('idle'); setPrefill('idle'); }}>
                Change
              </button>
            </div>
          ) : (
            <>
              <input id="bs-q" value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
                placeholder="Blk 275A Bishan St 24, or a project name" />
              {prefill === 'failed' && (
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  The property could not be carried across. Search for it here instead.
                </p>
              )}
              {hits.length > 0 && (
                <ul className="idx" style={{ marginTop: 8 }}>
                  {hits.map(h => (
                    <li key={h.href}>
                      <button type="button" className="pickrow" onClick={() => { setPicked(h); setHits([]); }}>
                        <span className="n">{titleCase(h.label)}</span>
                        <span className="s mono">{h.sub} · {num(h.n)} filed</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="planform" style={{ marginTop: 16 }}>
          <label><span>What it is being asked for</span>
            {/* The slider appears once there is a figure to move. Before that
                there is nothing for a thumb to point at, and a range control
                sitting at zero next to an empty box reads as a broken field. */}
            <MoneyInput value={price} onChange={setPrice} emptyIsBlank
              slider={price !== '' && price != null}
              min={100000} max={8000000} step={10000}
              placeholder="S$1,250,000" ariaLabel="What it is being asked for" /></label>
          <label><span>Floor area, sq ft</span>
            <input type="number" step="10" value={area} onChange={e => setArea(e.target.value)} placeholder="1292" /></label>
          <label><span>Which is</span>
            <input readOnly value={psf ? `$${f(psf).replace('S$', '')} psf` : '—'} tabIndex={-1}
              style={{ background: 'var(--sunk)', color: 'var(--mute)' }} /></label>
        </div>

        {/* This was a .ghost — a small grey outline button, visually quieter
            than the three inputs above it. The primary action of the site's
            flagship tool cannot be the least prominent thing in its own form. */}
        <button type="submit" className="cta" disabled={!ready || state === 'loading'}>
          {state === 'loading' ? 'Checking…' : 'Run the checks'}
        </button>
        {!picked && prefill !== 'loading' && (
          <p className="hint" style={{ marginTop: 12 }}>
            Start by naming a block or project above — the checks are all measured
            against what has actually been filed at that address.
          </p>
        )}
      </form>

      {state === 'error' && (
        <div className="warn" style={{ marginTop: 18 }}><p style={{ margin: 0 }}>{error}</p></div>
      )}

      {report && <Result report={report} boxRef={box} />}
    </>
  );
}

function Result({ report, boxRef }) {
  const r = report;
  const pctOfMax = r.max ? r.points / r.max : 0;

  return (
    <div ref={boxRef} style={{ marginTop: 30, scrollMarginTop: 76 }}>
      <div className="sh"><span>{titleCase(r.record.label)}</span></div>

      <div className="scorewrap">
        <div className="scorenum">
          <span className="filtn">Things flagged</span>
          <span className="bigscore">
            <Figure value={r.points} format={v => String(Math.round(v))} className="scoreval" />
            <em> of {r.max}</em>
          </span>
          <span className="scoreband">{r.band}</span>
        </div>
        <div className="scoresay">
          <p className="hint" style={{ margin: '0 0 10px' }}><b>{r.direction}</b> {r.meaning}</p>
          <div className="scorebar" role="img"
            aria-label={`${r.points} of a possible ${r.max} — ${r.band}`}>
            {Array.from({ length: r.max }, (_, i) => (
              <i key={i} className={i < r.points ? 'on' : ''} />
            ))}
          </div>
          {r.skipped.length > 0 && (
            <p className="hint" style={{ margin: '12px 0 0' }}>
              Out of {r.points + (r.max - r.points)} possible points across{' '}
              <b>{r.checks.length} of 4 checks</b>. {r.skipped.length} could not run — listed below,
              and not counted either way.
            </p>
          )}
        </div>
      </div>

      {r.summary && (
        <div className="note" style={{ marginTop: 20 }}>
          {r.summary.split(/\n\n+/).map((p, i) => <p key={i} style={{ margin: i ? '10px 0 0' : 0 }}>{p}</p>)}
        </div>
      )}

      <div className="sh" style={{ marginTop: 26 }}><span>What each check found</span></div>
      {r.checks.map(c => (
        <div key={c.key} className="checkrow">
          <div className="ch">
            <b>{c.title}</b>
            <span className="mono pts">{c.points} / {c.max}</span>
          </div>
          <p>{c.finding}</p>
          {/* What the check could not read, next to what it did. A figure that
              covers a minority of the radius reads as a ceiling without this. */}
          {c.caveat && <p className="hint" style={{ margin: '0 0 6px' }}>{c.caveat}</p>}
          <span className="prov" style={{ display: 'block', margin: 0 }}>{c.source}</span>
        </div>
      ))}

      {r.skipped.length > 0 && (
        <>
          <div className="sh" style={{ marginTop: 26 }}><span>What could not be checked</span></div>
          {r.skipped.map(s => (
            <div key={s.key} className="checkrow off">
              <div className="ch"><b>{s.title}</b><span className="mono pts">not run</span></div>
              <p>{s.needs}</p>
            </div>
          ))}
          <p className="hint">
            These are not scored as zero. A check that did not run tells you nothing about the
            risk it measures, and the score above counts only what was actually measured.
          </p>
        </>
      )}

      {r.detail?.price && <PriceEvidence price={r.detail.price} />}

      {r.detail?.supply?.basis === 'town' && (
        <p className="hint">
          <b>Supply is measured across {titleCase(r.detail.supply.town)}, not a 2km radius.</b>{' '}
          Blocks reaching MOP for the first time have never sold, so most of them have no coordinate
          yet — a radius search would find almost none of them and report a reassuring number it
          could not see. The town register is complete, so that is what is used until the geocoder
          has caught up.
        </p>
      )}

      <p className="prov" style={{ marginTop: 22 }}>
        Rubric {r.version} · every point above is produced by a published rule over filed
        transactions, not by a model. {r.summary ? 'The paragraph is written by a model from those figures and adds none of its own.' : ''}<br />
        {r.disclaimer}
      </p>

      <div className="mapfocus" style={{ marginTop: 22 }}>
        <b>Want this run properly?</b>
        <span>Four checks is what can be done from public data alone. Your lease, your CPF, your
          timeline and the actual condition of the unit are not in any of it.</span>
        <Link href={`/plan?price=${r.input.askPrice || ''}&from=${encodeURIComponent(r.record.href)}`}>
          Price the purchase →
        </Link>
      </div>
    </div>
  );
}

function PriceEvidence({ price }) {
  const observed = price.observed;
  const scored = price.scored;
  const comps = scored?.comparisons || [];
  const lastMonth = comps.map(c => c.month).filter(Boolean).sort().at(-1);
  const psf = v => `$${num(Math.round(v))} psf`;
  const above = v => v == null ? null
    : `${v >= 100 ? Math.round(v) : v.toFixed(1)}% above the highest comparable`;
  const position = cohort => {
    if (cohort.aboveHighPct != null) return above(cohort.aboveHighPct);
    if (cohort.asking < cohort.low) return 'below the lowest observed comparable';
    return 'inside that observed range';
  };

  return (
    <>
      <div className="sh" style={{ marginTop: 26 }}><span>The evidence behind the price check</span></div>

      {observed && (
        <div className="priceevidence">
          <span className="lab">This block or project</span>
          <p>
            <b>{num(observed.sample)} filed sale{observed.sample === 1 ? '' : 's'} held</b>, from{' '}
            {psf(observed.low)} to {psf(observed.high)} between {observed.from} and {observed.to}.
            {' '}The asking price is {psf(observed.asking)}
            {observed.aboveHighPct != null ? ` — ${above(observed.aboveHighPct)}.` : '.'}
          </p>
          <span className="prov">{price.source} · {price.period?.from} to {price.period?.to} · observed range, not a valuation</span>
        </div>
      )}

      {scored ? (
        <div className="priceevidence scored">
          <span className="lab">The cohort that was scored</span>
          {scored.basis === 'nearby' ? (
            <p>
              <b>{num(scored.sample)} comparable sales across {num(scored.blocks)} HDB blocks within{' '}
              {num(Math.round(scored.radiusKm * 1000))}m.</b> Same {titleCase(price.flatType)}, floor area{' '}
              {num(scored.areaFromSqm)}–{num(scored.areaToSqm)} sqm and lease commencement{' '}
              {scored.leaseFrom}–{scored.leaseTo}. The filed range was {psf(scored.low)} to{' '}
              {psf(scored.high)}, median {psf(scored.median)}. The asking price is{' '}
              <b>{position(scored)}</b>.
            </p>
          ) : (
            <p>
              <b>{num(scored.sample)} sales at this address in the last {scored.months} months.</b>{' '}
              The filed range was {psf(scored.low)} to {psf(scored.high)}, median {psf(scored.median)}.
              The asking price is <b>{position(scored)}</b>.
            </p>
          )}
          {scored.basis === 'nearby' && (
            <p className="hint">
              Treated as {titleCase(price.flatType)} from {price.flatTypeBasis}. Not adjusted for
              storey. Distance is straight-line from the searched block.
            </p>
          )}
          <span className="prov">
            {scored.cutoff} to {lastMonth || 'latest held month'} · {scored.sample} filed transactions ·
            HDB Resale Flat Prices via data.gov.sg
          </span>
        </div>
      ) : (
        <div className="priceevidence off">
          <span className="lab">Not scored</span>
          <p>{price.unavailable}</p>
        </div>
      )}

      {comps.length > 0 && (
        <details className="compdetails">
          <summary>Show all {num(comps.length)} comparable sales</summary>
          <div className="tablewrap">
            <table className="bandtable pricecomps">
              <thead>
                <tr>
                  <th scope="col">Block</th><th scope="col">Filed</th>
                  <th scope="col">Unit</th><th scope="col">PSF</th><th scope="col">Straight-line</th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c, i) => (
                  <tr key={`${c.href}-${c.month}-${c.price}-${i}`}>
                    <th scope="row"><Link href={c.href}>{titleCase(c.label)}</Link></th>
                    <td className="mono">{c.month}</td>
                    <td>{c.areaSqm ? `${c.areaSqm} sqm` : '—'}{c.storey ? ` · ${c.storey}` : ''}</td>
                    <td className="mono">${num(c.psf)}</td>
                    <td className="mono">{c.distanceM ? `${num(c.distanceM)}m` : 'this block'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
