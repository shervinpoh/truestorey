'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toolRun } from './Track.jsx';
import { f, num } from './fmt.js';
import { titleCase } from '../lib/name.js';
import { Figure, still } from './Motion.jsx';
import MoneyInput from './MoneyInput.jsx';
import { viewingQuestions } from '../lib/blindspot/viewing.js';
import { BLINDSPOT_SHARE, blindspotShareInput, encodeShare } from '../lib/share.js';
import ResultBridge from './ResultBridge.jsx';
import ShareResult from './ShareResult.jsx';
import EmailReport from './EmailReport.jsx';
import { HDB_FLAT_TYPES, hdbFlatLabel, unitDetailError } from '../lib/blindspot/unit.js';

/**
 * Blindspot — six checks, one score, every point traceable.
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
async function getReport(input, signal) {
  const res = await fetch('/api/ai/blindspot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'That did not work.');
  return result;
}

export default function BlindspotReport({ canEmail = false }) {
  const params = useSearchParams();
  const from = params.get('from') || '';
  const [floor, setFloor] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(null);
  const [prefill, setPrefill] = useState(from ? 'loading' : 'idle');
  const [price, setPrice] = useState('');
  const [area, setArea] = useState('');
  const [flatType, setFlatType] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [state, setState] = useState('idle');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [fromLink, setFromLink] = useState(false);
  const box = useRef(null);
  const requestId = useRef(0);

  // A record page already knows the property. Make the reader supply only the
  // two facts it cannot know: the actual asking price and this unit's area.
  // The record itself is fetched from its public href rather than copied into
  // the query string. The median is deliberately NOT carried across — putting
  // it into a field labelled "what it is being asked for" would turn a filed
  // middle into a seller's claim that nobody made.
  useEffect(() => {
    const shareLike = /^#v=/.test(window.location.hash);
    const shared = shareLike ? blindspotShareInput(window.location.hash) : null;
    if (shareLike && (!shared || shared.error)) {
      setLinkError(shared?.error || 'This shared check uses a version that cannot be read. Start a new check.');
      setPrefill('idle');
      return;
    }
    const href = shared?.values.home || from;
    if (!href) { setPrefill('idle'); return; }
    const ctl = new AbortController();
    setPrefill('loading');
    (async () => {
      try {
        const res = await fetch(`/api/record?href=${encodeURIComponent(href)}`, { signal: ctl.signal });
        if (!res.ok) throw new Error('no record');
        const rec = await res.json();
        if (ctl.signal.aborted) return;
        setPicked({
          href: rec.href,
          label: rec.label,
          kind: rec.kind,
          n: rec.n,
          sub: rec.kind === 'HDB' ? titleCase(rec.town) : `District ${rec.district}`,
        });
        setQ('');
        setPrefill('done');
        if (!shared) return;

        // A link carries inputs, never a score. Re-run against today's filed
        // records so the published rubric and the evidence cannot go stale in
        // a copied URL. This is a new check, not a stored or frozen report.
        const input = shared.values;
        setPrice(String(input.price));
        setArea(String(input.area));
        setFloor(input.floor ? String(input.floor) : '');
        setFlatType(input.flatType || '');
        setBedrooms(input.bedrooms ? String(input.bedrooms) : '');
        if (shared.needsUnit) {
          setLinkError('This older shared check has no unit type. The other inputs were restored; add the unit detail shown in the listing before running it.');
          return;
        }
        const unitError = unitDetailError(rec, input);
        if (unitError) {
          setLinkError(`${unitError} The link's other inputs were restored; confirm the unit detail to continue.`);
          return;
        }
        setFromLink(true);
        setState('loading');
        const id = ++requestId.current;
        toolRun('blindspot');
        try {
          const result = await getReport({
            href: input.home, askPrice: input.price, areaSqft: input.area,
            floor: input.floor || null, flatType: input.flatType || null,
            bedrooms: input.bedrooms || null,
          }, ctl.signal);
          if (ctl.signal.aborted || id !== requestId.current) return;
          setReport(result);
          setState('done');
          requestAnimationFrame(() => box.current?.scrollIntoView({
            behavior: still() ? 'auto' : 'smooth', block: 'start',
          }));
        } catch (err) {
          if (ctl.signal.aborted || id !== requestId.current) return;
          setError(err.message);
          setState('error');
        }
      } catch (err) {
        if (ctl.signal.aborted) return;
        setPrefill('failed');
        if (shared) setLinkError('The property in this shared check could not be found. Search for it again.');
      }
    })();
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

  const unitReady = picked && !unitDetailError(picked, { flatType, bedrooms });
  const ready = unitReady && Number(price) > 0 && Number(area) > 0;
  const psf = Number(price) > 0 && Number(area) > 0
    ? Math.round(Number(price) / Number(area)) : null;
  const canBack = Boolean(from && picked?.href === from);

  function invalidate() {
    // If the reader edits an input while a request is running, its old answer
    // must not arrive later underneath the new figure shown in the form.
    requestId.current += 1;
    setReport(null);
    setState('idle');
    setError('');
    setLinkError('');
    setFromLink(false);
    // After opening a shared check, the address bar still names its original
    // inputs. Once the form changes, leaving that fragment in place would let
    // a copied browser URL answer a different question from the visible form.
    if (blindspotShareInput(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  async function run(e) {
    e.preventDefault();
    if (!ready || state === 'loading') return;
    setState('loading'); setError(''); setReport(null); toolRun('blindspot');
    const id = ++requestId.current;
    try {
      const j = await getReport({
        href: picked.href, askPrice: Number(price), areaSqft: Number(area),
        floor: floor ? Number(floor) : null, flatType: flatType || null,
        bedrooms: bedrooms ? Number(bedrooms) : null,
      });
      if (id !== requestId.current) return;
      setReport(j); setState('done');
      // Jump rather than glide for a reader who has asked for less motion.
      // The report can be a screen and a half, so this is one of the longest
      // travels on the site — and arriving is the point, not the journey.
      requestAnimationFrame(() => box.current?.scrollIntoView({
        behavior: still() ? 'auto' : 'smooth', block: 'start',
      }));
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message); setState('error');
    }
  }

  return (
    <>
      <form onSubmit={run}>
        {linkError && <p className="note" role="alert">{linkError}</p>}
        {fromLink && <p className="note" role="status">
          <b>Opened from a shared check.</b> The inputs were restored and the checks run again
          against the public records held today. The points may differ from when the link was made.
        </p>}
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
              {canBack && <Link href={from}>← Back to the property</Link>}
              <button type="button" className="linkish" style={{ marginLeft: canBack ? 0 : 'auto' }}
                onClick={() => { invalidate(); setPicked(null); setQ(''); setFlatType(''); setBedrooms(''); setPrefill('idle'); setFromLink(false); setLinkError(''); }}>
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
                      <button type="button" className="pickrow" onClick={() => { setPicked(h); setFlatType(''); setBedrooms(''); setHits([]); }}>
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

        {picked && (
          <div className="blindspot-listing">
            <div className="blindspot-stephead">
              <span className="lab">The unit and its asking price</span>
              <p>Enter the unit details shown in the listing. They are sent to run the check; no listing is published.</p>
            </div>
            <div className="planform" style={{ marginTop: 16 }}>
              <label><span>Asking price</span>
                {/* The slider appears once there is a figure to move. Before that
                    there is nothing for a thumb to point at, and a range control
                    sitting at zero next to an empty box reads as a broken field. */}
                <MoneyInput value={price} onChange={v => { setPrice(v); invalidate(); }} emptyIsBlank
                  slider={price !== '' && price != null}
                  min={100000} max={8000000} step={10000}
                  placeholder="e.g. S$1,250,000" ariaLabel="Asking price" /></label>
              <label><span>Floor area, sq ft</span>
                <input type="number" step="10" value={area} onChange={e => { setArea(e.target.value); invalidate(); }} placeholder="e.g. 1,292" /></label>
              {picked.kind === 'HDB' ? (
                <label><span>HDB flat type</span>
                  <select value={flatType} required onChange={e => { setFlatType(e.target.value); invalidate(); }}>
                    <option value="">Choose…</option>
                    {HDB_FLAT_TYPES.map(t => <option key={t} value={t}>{hdbFlatLabel(t)}</option>)}
                  </select></label>
              ) : (
                <label><span>Bedrooms in this unit</span>
                  <input type="number" min="1" max="20" step="1" required value={bedrooms}
                    onChange={e => { setBedrooms(e.target.value); invalidate(); }} placeholder="e.g. 3" /></label>
              )}
              {/* Optional, and it changes the answer more than anything else here:
                  adjusting comparables to the reader's own floor moved Blk 242
                  Bishan from "above every comparable" on the second storey to the
                  80th percentile on the twentieth. Left blank, the comparables are
                  used exactly as filed and the report says so. */}
              <label><span>Floor <small>(optional)</small></span>
                <input type="number" step="1" min="1" max="70" value={floor}
                  onChange={e => { setFloor(e.target.value); invalidate(); }} placeholder="e.g. 12" /></label>
            </div>
            {psf && <p className="hint" aria-live="polite" style={{ margin: '10px 0 0' }}>
              From the asking price and floor area you entered: <b className="mono">{f(psf)} psf</b>.
            </p>}
            <p className="hint" style={{ margin: '10px 0 0' }}>
              {picked.kind === 'HDB'
                ? 'HDB room type is not the bedroom count. Select the flat type in the listing; the price check uses that exact type.'
                : 'Bedroom count is from your listing. URA sales do not include bedrooms, so the price check matches on floor area, property type and tenure—not bedroom count.'}
            </p>

            {/* This was a .ghost — a small grey outline button, visually quieter
                than the three inputs above it. The primary action of the site's
                flagship tool cannot be the least prominent thing in its own form. */}
            <button type="submit" className="cta" disabled={!ready || state === 'loading'}>
              {state === 'loading' ? 'Checking public records…' : 'Check this property'}
            </button>
            <p className="blindspot-status" role="status" aria-live="polite">
              {state === 'loading'
                ? 'Reading filed sales, lease, liquidity, supply, land and planning records.'
                : ready
                  ? 'Ready. Points follow the published rules and the filed records held today.'
                  : 'Add the asking price, floor area and unit detail to continue. Floor is optional.'}
            </p>
          </div>
        )}
        {!picked && prefill !== 'loading' && (
          <p className="hint" style={{ marginTop: 12 }}>
            Only the address is needed for this step. The flat type or bedroom count, asking price and floor area come next.
          </p>
        )}
      </form>

      {state === 'error' && (
        <div className="warn" style={{ marginTop: 18 }}><p style={{ margin: 0 }}>{error}</p></div>
      )}

      {report && <Result report={report} boxRef={box} canEmail={canEmail} />}
    </>
  );
}

function Result({ report, boxRef, canEmail }) {
  const r = report;
  const shareHash = encodeShare(BLINDSPOT_SHARE, {
    home: r.record.href, price: r.input.askPrice,
    area: r.input.areaSqft, floor: r.input.floor,
    flatType: r.input.flatType, bedrooms: r.input.bedrooms,
  });
  /* Checks that contributed at least one point. The weighted total cannot
     be read back into a count, so it is counted here from the checks
     themselves rather than inferred. */
  const flaggedChecks = (r.checks || []).filter(c => c.points > 0).length;


  return (
    <div ref={boxRef} style={{ marginTop: 30, scrollMarginTop: 76 }}>
      <h2 className="sh"><span>{titleCase(r.record.label)}</span></h2>
      <p className="hint" style={{ margin: '7px 0 18px' }}>
        {r.record.kind === 'HDB'
          ? <><b>{hdbFlatLabel(r.input.flatType || r.detail?.price?.flatType || 'HDB flat')}</b> · flat type from {r.input.flatType ? 'the listing you entered' : 'filed sales at this block'}</>
          : <><b>{r.input.bedrooms} bedroom{r.input.bedrooms === 1 ? '' : 's'}</b> · from the listing you entered; URA sale records do not identify bedrooms</>}
        {' · '}{num(r.input.areaSqft)} sq ft · {f(r.input.askPrice)} asking
      </p>

      <div className="scorewrap">
        <div className="scorenum">
          {/* NOT "Things flagged". The figure is a WEIGHTED TOTAL — a price in
              the top decile alone contributes 3 — so "6 of 15 things" describes
              a count nothing here produces. On the result that prompted this,
              six points came from three checks, and a reader who believed the
              label was looking for three findings that did not exist.

              The weighted total stays, because it is what the published rubric
              computes. What changes is that it is called one, and the count of
              checks that actually contributed is said beside it. */}
          <span className="filtn">Risk points</span>
          <span className="bigscore">
            <Figure value={r.points} format={v => String(Math.round(v))} className="scoreval" />
            <em> of {r.max}</em>
          </span>
          <span className="scoreband">{r.band}</span>
          {flaggedChecks > 0 && (
            <span className="hint" style={{ display: 'block', marginTop: 4 }}>
              from {flaggedChecks} of {r.checks.length} checks
            </span>
          )}
        </div>
        <div className="scoresay">
          <p className="hint" style={{ margin: '0 0 10px' }}><b>{r.direction}</b> {r.meaning}</p>
          <div className="scorebar" role="img"
            aria-label={`${r.points} of a possible ${r.max} — ${r.band}`}>
            {Array.from({ length: r.max }, (_, i) => (
              <i key={i} className={i < r.points ? 'on' : ''} />
            ))}
          </div>
          {(r.skipped.length > 0 || r.notApplicable?.length > 0) && (
            <p className="hint" style={{ margin: '12px 0 0' }}>
              {r.max} possible points across <b>{r.checks.length} applicable checks that ran</b>.
              {r.skipped.length > 0 && ` ${r.skipped.length} could not run and added no points.`}
              {r.notApplicable?.length > 0 && ` ${r.notApplicable.length} does not apply to this property and is excluded.`}
            </p>
          )}
        </div>
      </div>

      <div className="blindspot-keep">
        <h3>Keep this check or send it to someone</h3>
        <ShareResult tool="blindspot" title={`Blindspot check: ${titleCase(r.record.label)}`}
          url={() => `${window.location.origin}/blindspot#${shareHash}`}
          note={<p className="hint">
            Anyone with the link can see this property and the listing figures. They sit after
            the <span className="mono">#</span>, outside the initial page request. To restore the
            property and rerun the checks, the browser sends those inputs to Truestorey. The
            result uses the records held at that time; it is not a frozen report.
          </p>} />
      </div>

      {r.notApplicable?.length > 0 && (
        <div className="note" style={{ marginTop: 16 }}>
          {r.notApplicable.map(c => <p key={c.key} style={{ margin: 0 }}><b>{c.title} is not scored.</b>{' '}{c.reason}</p>)}
        </div>
      )}

      {r.summary && (
        <div className="note" style={{ marginTop: 20 }}>
          {r.summary.split(/\n\n+/).map((p, i) => <p key={i} style={{ margin: i ? '10px 0 0' : 0 }}>{p}</p>)}
        </div>
      )}

      <ViewingBrief report={r} />

      <h2 className="sh" style={{ marginTop: 26 }}><span>What each check found</span></h2>
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
          <h2 className="sh" style={{ marginTop: 26 }}><span>What could not be checked</span></h2>
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

      {r.detail?.price && <PriceEvidence price={r.detail.price} kind={r.record.kind} />}
      {r.detail?.trend && <SizeTrend t={r.detail.trend} />}

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
        transactions, not by a model. {r.summary ? 'The paragraph above is assembled from those same figures and adds none of its own.' : ''}<br />
        {r.disclaimer}
      </p>

      {canEmail && <EmailReport tool="blindspot" hash={shareHash} title="my Blindspot check"
        description="Get the checks, their limits, the filed comparables and viewing questions in one email you can keep or forward. The copy is recomputed from the same public records and rubric; it leaves out the summary paragraph."
        privacyNote="The property and listing inputs were sent to run this check and will be sent again to make the email. They are not kept." />}

      <ResultBridge tool="Blindspot report"
        nextHref={`/plan?price=${r.input.askPrice || ''}&from=${encodeURIComponent(r.record.href)}`}
        nextLabel="Price the purchase"
        body="The report can read filed transactions and nearby supply. It cannot see this unit’s condition, facing, noise or seller’s position. Tell me what you saw; I’ll tell you which question I would press first." />
    </div>
  );
}

function ViewingBrief({ report }) {
  const questions = viewingQuestions(report);
  const state = status => status === 'flagged'
    ? 'Flagged above'
    : status === 'skipped'
      ? 'Not measured'
      : status === 'context'
        ? 'Worth confirming'
        : 'Only in person';

  return (
    <section className="viewingbrief" aria-labelledby="viewing-brief-title">
      <div className="viewingbrief-head">
        <div>
          <span className="lab">What I would ask next</span>
          <h2 id="viewing-brief-title">Take these into the viewing.</h2>
        </div>
        <p>The points come from public records. These are the gaps to resolve in person;
          they do not add or remove points.</p>
      </div>
      <ol>
        {questions.map((q, i) => (
          <li key={q.key}>
            <span className="viewingbrief-num" aria-hidden="true">0{i + 1}</span>
            <div>
              <div className="viewingbrief-label">
                <span className="lab">{q.label}</span>
                <span className={`viewingbrief-state ${q.status}`}>{state(q.status)}</span>
              </div>
              <p>{q.question}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PriceEvidence({ price, kind }) {
  const observed = price.observed;
  const scored = price.scored;
  /* When nothing could be scored, the sales the widest search DID find are
     shown instead of only the word "unavailable" — labelled as too few to
     score and never ranked against the asking price. */
  const thin = !scored ? price.thin : null;
  const comps = scored?.comparisons || thin?.comparisons || [];
  const lastMonth = comps.map(c => c.month).filter(Boolean).sort().at(-1);
  // S$, as everywhere else on the site. This read "$719 psf" beside pages that
  // say S$ — a currency a Singapore reader should never have to infer.
  const psf = v => `S$${num(Math.round(v))} psf`;
  const above = v => v == null ? null
    : `${v >= 100 ? Math.round(v) : v.toFixed(1)}% above the highest comparable`;
  const position = cohort => {
    if (cohort.aboveHighPct != null) return above(cohort.aboveHighPct);
    if (cohort.asking < cohort.low) return 'below the lowest observed comparable';
    return 'inside that observed range';
  };

  return (
    <>
      <h2 className="sh" style={{ marginTop: 26 }}><span>The evidence behind the price check</span></h2>

      {observed && (
        <div className="priceevidence">
          <span className="lab">This block or project</span>
          <p>
            <b>{num(observed.sample)} filed sale{observed.sample === 1 ? '' : 's'} held at this address{kind === 'HDB' && ' (all flat types)'}</b>, from{' '}
            {psf(observed.low)} to {psf(observed.high)} between {observed.from} and {observed.to}.
            {' '}The asking price is {psf(observed.asking)}
            {observed.aboveHighPct != null
              ? ` — ${observed.aboveHighPct >= 100 ? Math.round(observed.aboveHighPct) : observed.aboveHighPct.toFixed(1)}% above the highest filed sale at this address.`
              : '.'}
          </p>
          <span className="prov">{price.source} · {price.period?.from} to {price.period?.to} · observed range, not a valuation</span>
        </div>
      )}

      {scored ? (
        <div className="priceevidence scored">
          <span className="lab">The cohort that was scored</span>
          {scored.basis === 'nearby' ? (
            <p>
              <b>{num(scored.sample)} comparable sales across {num(scored.blocks)}{' '}
              {scored.leaseFrom ? (scored.blocks === 1 ? 'HDB block' : 'HDB blocks')
                : (scored.blocks === 1 ? 'nearby project' : 'nearby projects')} within{' '}
              {num(Math.round(scored.radiusKm * 1000))}m.</b> Same {kind === 'HDB' ? hdbFlatLabel(price.flatType) : titleCase(price.flatType)}, floor area{' '}
              {num(scored.areaFromSqm)}–{num(scored.areaToSqm)} sqm
              {/* HDB blocks are matched on when the lease started; private on
                  tenure, because a freehold and a 99-year unit of the same size
                  in the same street are not the same product. */}
              {scored.leaseFrom
                ? <> and lease commencement {scored.leaseFrom}–{scored.leaseTo}</>
                : scored.tenure === 'freehold'
                  ? <>, freehold only</>
                  : <>, leasehold with a similar number of years left</>}
              . The {scored.restated ? 'restated' : 'filed'} range was {psf(scored.low)} to{' '}
              {psf(scored.high)}, median {psf(scored.median)}. The asking price is{' '}
              <b>{position(scored)}</b>.
              {scored.restated && (
                <> Nothing close enough sold here in the last twelve months, so the search went
                  back {scored.months} months and restated each older sale to{' '}
                  {scored.restated.to} prices using the {scored.restated.index} — an older sale as
                  filed would put the market&rsquo;s movement into the comparison as though it
                  were about this home. The table keeps the filed figure beside each one.</>
              )}
            </p>
          ) : (
            <p>
              <b>{num(scored.sample)} {kind === 'HDB' ? hdbFlatLabel(price.flatType) + ' ' : ''}sales at this address in the last {scored.months} months.</b>{' '}
              The filed range was {psf(scored.low)} to {psf(scored.high)}, median {psf(scored.median)}.
              The asking price is <b>{position(scored)}</b>.
              {scored.months > 12 && (
                <> The last twelve months held too few to score, so the window was widened
                  before looking anywhere else — a sale in this building is a closer comparable
                  than a recent one next door.</>
              )}
            </p>
          )}
          {scored.adjusted ? (
            <p className="hint">
              Every comparable is restated as though it had been on floor {scored.adjusted.to},
              using the floor curve for {scored.adjusted.where} — {num(scored.adjusted.moved)} of{' '}
              {num(scored.adjusted.of)} moved
              {scored.adjusted.capped > 0 && <>, and {num(scored.adjusted.capped)} were left as filed
                because the adjustment would have exceeded a third</>}
              . The table shows both figures.
              {scored.basis === 'nearby' && ' Distance is straight-line from the searched address.'}
            </p>
          ) : (
            <p className="hint">
              {price.floor
                ? 'The floor curve for this town or district does not rise with height — too thin a sample to adjust with — so the comparables are used exactly as filed.'
                : 'Comparables are used as filed and not adjusted for storey. Give a floor above and they will be restated on it.'}
              {scored.basis === 'nearby' && <> Treated as {kind === 'HDB' ? hdbFlatLabel(price.flatType) : titleCase(price.flatType)} from{' '}
                {price.flatTypeBasis}. Distance is straight-line from the searched address.</>}
            </p>
          )}
          <span className="prov">
            {scored.cutoff} to {lastMonth || 'latest held month'} · {scored.sample} filed transactions ·{' '}
            {price.source || 'HDB via data.gov.sg · URA Data Service'}
            {scored.restated && <> · restated to {scored.restated.to} by the {scored.restated.index}{scored.restated.source ? ` (${scored.restated.source})` : ''}</>}
          </span>
        </div>
      ) : (
        <div className="priceevidence off">
          <span className="lab">Not scored</span>
          <p>{price.unavailable}</p>
          {thin && (
            <p>
              <b>What the search did find:</b> {num(thin.sample)} similar sale{thin.sample === 1 ? '' : 's'}{' '}
              within {num(Math.round((thin.radiusKm || 0) * 1000))}m over {thin.months} months,{' '}
              {thin.sample === 1 ? `at ${psf(thin.low)}` : `from ${psf(thin.low)} to ${psf(thin.high)}`}
              {thin.restated && <>, restated to {thin.restated.to} prices by the {thin.restated.index}</>}.
              {' '}Too few to score the asking price against, so they add no points — shown so you
              have something real to go on, and listed below.
            </p>
          )}
        </div>
      )}

      {comps.length > 0 && (
        <details className="compdetails">
          <summary>{thin ? `Show the ${num(comps.length)} sale${comps.length === 1 ? '' : 's'} found — too few to score` : `Show all ${num(comps.length)} comparable sales`}</summary>
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
                    <td>{kind === 'HDB' && c.flatType ? `${hdbFlatLabel(c.flatType)} · ` : ''}{c.areaSqm ? `${c.areaSqm} sqm` : '—'}{c.storey ? ` · ${c.storey}` : ''}</td>
                    {/* Both figures when the comparable was restated — by floor,
                        by index, or both. An adjusted number that hides what it
                        started from is not evidence. */}
                    <td className="mono">S${num(c.psf)}{c.psfFiled != null && c.psfFiled !== c.psf && (
                      <span className="hint" style={{ display: 'block' }}>filed S${num(c.psfFiled)}</span>)}</td>
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

/**
 * What homes of this size have done here, beside what the whole address did.
 *
 * The two lines exist to be compared. A project's year-on-year figure is a
 * median over whatever happened to sell, so it moves when the MIX moves — and
 * anyone reading it as a fact about their own flat is reading a fact about the
 * sales calendar. Where the two disagree, the disagreement is the point, and
 * the page says so in a sentence rather than leaving it to be spotted.
 *
 * Not scored. A price that moved is a fact worth showing and not a risk this
 * rubric knows how to weigh: which direction is bad depends entirely on
 * whether the reader is buying or selling, and the rubric does not ask.
 */
function SizeTrend({ t }) {
  const pc = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
  return (
    <>
      <h2 className="sh" style={{ marginTop: 26 }}><span>What this size has done here</span></h2>
      {t.diverges && (
        <p className="lede" style={{ maxWidth: '70ch', marginTop: 0 }}>
          Homes of about this size moved <b>{pc(t.sizedChange)}</b> between {t.from} and {t.to},
          while the address as a whole moved <b>{pc(t.allChange)}</b>. A headline figure is a median
          over whatever happened to sell that year, so it moves when the mix of sizes moves — which
          is why the two can disagree, and why the one on the left is the one about your home.
        </p>
      )}
      <div className="tablewrap">
        <table className="landtable trendtable">
          <caption className="prov">
            Median rate per square foot by year. {t.band} band against every size at this address.
            A year with fewer than {t.min} sales is kept and marked, not dropped.
          </caption>
          <thead><tr>
            <th scope="col">Year</th>
            <th scope="col" className="num">{t.band}</th>
            <th scope="col" className="num">Every size here</th>
          </tr></thead>
          <tbody>
            {t.rows.map(r => (
              <tr key={r.year} className={r.thin ? 'thinyear' : undefined}>
                <td className="mono">{r.year}</td>
                <td className="mono num">${num(r.sizedPsf)} <i>({num(r.sizedN)})</i></td>
                <td className="mono num">{r.allPsf ? <>${num(r.allPsf)} <i>({num(r.allN)})</i></> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="prov">
        {t.source} · {t.from} to {t.to} · counts in brackets · medians of filed transactions,
        not a projection and not a valuation
      </p>
    </>
  );
}
