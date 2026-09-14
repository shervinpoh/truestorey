'use client';
import { useEffect, useRef, useState } from 'react';
import { CONSTRUCTION, constructionStage } from '../lib/construction.js';
import { BUC_SOURCE, NOTICE_DAYS } from '../lib/calc/buc.js';
import { f } from './fmt.js';

function StageImage({ index, alt }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="construction-missing"><p>The illustration could not load.</p><p>The stage explanation and payment figures are still available.</p></div> : (
    <picture>
      <source srcSet={`/construction/stage-${index}.avif`} type="image/avif" />
      <img src={`/construction/stage-${index}.webp`} width="1200" height="1100" alt={alt}
        loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </picture>
  );
}

export default function ConstructionStudy({ rows, price, rate, tenure, bookingFee, onStudyPassed }) {
  // Framework gives the first view a readable building. Every milestone is
  // directly selectable; starting here does not imply a project's progress.
  const [index, setIndex] = useState(2);
  const study = useRef(null);
  useEffect(() => {
    if (!study.current || typeof IntersectionObserver === 'undefined') return;
    // The existing fixed strip describes the whole purchase. Showing it over
    // a selected milestone gives a second, unrelated answer on a small screen.
    const observer = new IntersectionObserver(([entry]) => {
      onStudyPassed(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(study.current);
    return () => observer.disconnect();
  }, [onStudyPassed]);
  const stage = constructionStage(rows, index);
  const change = stage.monthlyChange;
  return (
    <section ref={study} className="construction" aria-labelledby="construction-heading">
      <div className="construction-intro">
        <div><p className="lab">From agreement to completion</p>
          <h2 id="construction-heading">Watch the building.<br />Understand the payments.</h2></div>
        <p>Select a milestone to see what it means for the building, your own funds and your loan. The stages follow notices, not a fixed calendar.</p>
      </div>
      <div className="construction-assumptions">
        <p>Illustrating your <strong>{f(price)}</strong> purchase · <strong>{rate}%</strong> loan rate · <strong>{tenure} years</strong></p>
        <a href="#purchase-assumptions">Change purchase details <span aria-hidden="true">↗</span></a>
      </div>
      <ol className="construction-stages" aria-label="Choose a payment milestone">
        {CONSTRUCTION.map((item,i) => <li key={item.label}>
          <button type="button" aria-pressed={index===i} aria-controls="construction-detail" onClick={()=>setIndex(i)}>
            <span className="construction-step">{String(i+1).padStart(2,'0')}</span>
            <span className="construction-stage-label">{item.label}<small>{rows[i].pct}%</small></span>
          </button>
        </li>)}
      </ol>
      <div className="construction-mobile-result" aria-hidden="true">
        <div><span>{stage.pct}% at this stage</span><strong>{f(stage.due)}</strong></div>
        <div><span>Instalment after this stage</span><strong>{f(stage.monthly)}<small> / mo</small></strong></div>
      </div>
      <div className="construction-study" id="construction-detail">
        <figure className="construction-figure">
          <div className="construction-art">
            <StageImage key={index} index={index} alt={stage.alt} />
            <div className="construction-art-label" aria-hidden="true"><span>Construction study</span><b>{String(index+1).padStart(2,'0')} / 09</b></div>
          </div>
          <figcaption><span className="construction-key" aria-hidden="true" />{index===0 ? 'Signing does not prescribe construction progress.' : index===8 ? 'Same building as handover. A separate contractual milestone.' : 'Teal identifies representative work at this milestone.'}<br />Conceptual cutaway. Not a real project, construction forecast or site inspection.</figcaption>
        </figure>
        <div className="construction-panel">
          <div className="construction-stage-heading" aria-live="polite" aria-atomic="true">
            <p className="lab">Stage {index+1} of {rows.length} · {stage.label}</p>
            <h3>{stage.title}</h3>
          </div>
          <p className="construction-description">{stage.body}</p>
          <div className="construction-due">
            <span className="lab">{stage.pct}% of the price at this stage</span>
            <strong>{f(stage.due)}</strong>
            {index===0 && <p>Includes the {f(bookingFee)} booking fee already paid.</p>}
          </div>
          <dl className="construction-funds">
            <div><dt>Your cash / CPF share</dt><dd>{f(stage.own)}</dd></div>
            <div><dt>Bank draw at this stage</dt><dd>{f(stage.loan)}</dd></div>
            <div><dt>Total loan drawn so far</dt><dd>{f(stage.drawnAfter)}</dd></div>
          </dl>
          <div className="construction-mortgage">
            <span className="lab">Modelled monthly instalment after this stage</span>
            <p><strong>{f(stage.monthly)}</strong><span> / month</span></p>
            <small>{stage.monthly===0 ? 'No loan drawn yet under these assumptions.' : `${f(stage.previousMonthly)} at the previous stage${change>0 ? ` · up ${f(change)}` : ' · unchanged'}.`}</small>
          </div>
          <div className="construction-progress">
            <div><span>Purchase price accounted for</span><strong>{stage.cumulativePct}%</strong></div>
            <div className="construction-meter" role="img" aria-label={`${stage.cumulativePct}% of the price through this stage`}><span style={{width:`${stage.cumulativePct}%`}} /></div>
            <small>This is payment progress, not percentage of building work completed.</small>
          </div>
        </div>
      </div>
      <div className="construction-notice">
        <div><p className="lab">What to look for</p><p>{stage.detail}</p></div>
        <details key={index}>
          <summary>Read the payment trigger</summary>
          <blockquote>{stage.wording}</blockquote>
          {index!==0 && index!==8 && <p>Payment is due within {NOTICE_DAYS} days of receiving the relevant notice. There is no fixed interval between construction notices.</p>}
          <a href={BUC_SOURCE.url} target="_blank" rel="noopener noreferrer">Housing Developers Rules, clause 5.1 ↗</a>
        </details>
      </div>
      <div className="construction-bottom">
        <p>Payment stages: <a href={BUC_SOURCE.url} target="_blank" rel="noopener noreferrer">Housing Developers Rules, clause 5.1</a> · reviewed {BUC_SOURCE.versionAsAt}. Amounts use your purchase inputs. Instalments assume an amortising loan on the amount drawn; your bank’s package may differ. Stamp duty is additional and shown below.</p>
        <div className="construction-navigation" aria-label="Move between payment stages">
          <button type="button" disabled={index===0} onClick={()=>setIndex(i=>i-1)} aria-label="Previous payment stage">← Previous</button>
          <button type="button" disabled={index===rows.length-1} onClick={()=>setIndex(i=>i+1)} aria-label="Next payment stage">Next stage →</button>
        </div>
      </div>
    </section>
  );
}
