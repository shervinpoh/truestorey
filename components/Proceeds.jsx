'use client';
import { useEffect, useRef, useState } from 'react';
import { f } from './fmt.js';
import { saleProceeds } from '../lib/calc/proceeds.js';

/*
 * THE MATHS LIVES IN lib/calc/proceeds.js. IT IS NOT REPEATED HERE.
 *
 * This component used to carry its own copy, with 2.5% and 9% written in as
 * literals and lib/calc/proceeds.js sitting unused beside it — tested, correct,
 * and imported by nothing. Two versions of the sale-proceeds maths, and the one
 * that ran on every record page was the untested one.
 *
 * They agreed on a healthy sale and diverged exactly where it mattered. The
 * inline version floored the result at zero:
 *
 *     thin equity   showed  S$0   the answer was  -S$31,864
 *     underwater    showed  S$0   the answer was -S$197,747
 *
 * So a seller who would have to bring nearly two hundred thousand dollars to
 * completion was told they walk away with nothing. That is not a rounding
 * difference, it is the difference between breaking even and owing a deposit
 * on a flat — published under a CEA registration.
 *
 * Rule 6 says every derived figure renders its source. The source of these is
 * lib/calc/constants.js, and this file no longer gets a vote.
 */

/** The sale-proceeds waterfall. Re-anchors whenever the median it is given moves. */
const STORE = 'truestorey.proceeds.v1';
const DEFAULTS = { loan: 180000, cpf: 150000, yrs: 12, fee: 2 };

/**
 * Someone comparing three flats should type their loan and CPF once, not three
 * times. Kept in this browser only — it never leaves the device and is never
 * sent anywhere. The sale price is deliberately NOT remembered: it is anchored
 * to whichever record is on screen.
 */
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw);
    const num = (x, d) => (Number.isFinite(+x) && +x >= 0 ? +x : d);
    return {
      loan: num(v.loan, DEFAULTS.loan), cpf: num(v.cpf, DEFAULTS.cpf),
      yrs: num(v.yrs, DEFAULTS.yrs), fee: num(v.fee, DEFAULTS.fee),
    };
  } catch { return DEFAULTS; }
}

export default function Proceeds({ median, onEngage }) {
  const [sp, setSp]   = useState(Math.round((median||0)/1000)*1000);
  const [loan, setLoan] = useState(DEFAULTS.loan);
  const [cpf, setCpf]   = useState(DEFAULTS.cpf);
  const [yrs, setYrs]   = useState(DEFAULTS.yrs);
  const [fee, setFee]   = useState(DEFAULTS.fee);
  const [restored, setRestored] = useState(false);
  const engaged = useRef(false);
  const touch = () => { if (!engaged.current) { engaged.current = true; onEngage?.(); } };

  // Read after mount so the server and client render the same markup first.
  useEffect(() => {
    const v = loadSaved();
    setLoan(v.loan); setCpf(v.cpf); setYrs(v.yrs); setFee(v.fee);
    const changed = Object.keys(DEFAULTS).some(k => v[k] !== DEFAULTS[k]);
    setRestored(changed);
  }, []);

  // Persist on change. Wrapped because storage throws in some private modes.
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ loan, cpf, yrs, fee })); } catch {}
  }, [loan, cpf, yrs, fee]);

  function reset() {
    setLoan(DEFAULTS.loan); setCpf(DEFAULTS.cpf); setYrs(DEFAULTS.yrs); setFee(DEFAULTS.fee);
    setRestored(false);
    try { localStorage.removeItem(STORE); } catch {}
  }

  useEffect(() => { if (median) setSp(Math.round(median/1000)*1000); }, [median]);

  // The one tested implementation. This component used to carry its own copy
  // of the maths with 2.5% and 9% written in as literals — see the note at the
  // top of the file for why that is gone.
  const r = saleProceeds({
    salePrice: sp,
    outstandingLoan: loan,
    cpfPrincipal: cpf,
    yearsHeld: yrs,
    agentFeePct: fee,
    propertyType: 'HDB',
  });
  const accrued = r.cpfAccruedInterest;
  const agent   = r.agentFee + r.legalFees;
  const cash    = r.cashInHand;
  // A shortfall is not a zero-width segment, it is the whole point. The bar
  // shows where the money went, so when there is none left it shows only the
  // things that consumed it and the total below carries the negative.
  const short   = cash < 0;
  const seg = (short ? [] : [[cash,'w5']])
    .concat([[loan,'w1'],[cpf,'w2'],[accrued,'w3'],[agent,'w4']]);
  const barBase = short ? (loan + cpf + accrued + agent) : sp;

  return (
    <>
      <h2>Where the money actually goes</h2>
      <p className="hint">Drag the sale price. Everything moves.</p>

      <div className="wf">{seg.map(([v,c],i)=>(
        <span key={i} style={{width:(barBase?v/barBase*100:0)+'%',background:`var(--${c})`}} />
      ))}</div>
      <div className="wfkey">
        <div><b style={{background:'var(--w5)'}} />Cash</div>
        <div><b style={{background:'var(--w1)'}} />Loan</div>
        <div><b style={{background:'var(--w2)'}} />CPF principal</div>
        <div><b style={{background:'var(--w3)'}} />CPF interest</div>
        <div><b style={{background:'var(--w4)'}} />Fees</div>
      </div>

      <span className="lab">Sale price · <span className="mono">{f(sp)}</span></span>
      <input type="range" aria-label="Sale price"
             min={Math.round((median||sp)*0.8)} max={Math.round((median||sp)*1.2)} step={1000}
             value={sp} onChange={e=>{touch();setSp(+e.target.value)}} />

      <div className="f2">
        <div><span className="lab">Outstanding loan</span><input type="number" value={loan} onChange={e=>{touch();setLoan(+e.target.value||0)}} /></div>
        <div><span className="lab">CPF principal used</span><input type="number" value={cpf} onChange={e=>{touch();setCpf(+e.target.value||0)}} /></div>
      </div>
      <div className="f2">
        <div><span className="lab">Years held</span><input type="number" value={yrs} onChange={e=>setYrs(+e.target.value||0)} /></div>
        <div><span className="lab">Agent fee %</span><input type="number" step="0.25" value={fee} onChange={e=>setFee(+e.target.value||0)} /></div>
      </div>

      {restored && (
        <p className="hint" style={{margin:'10px 0 0',fontSize:12}}>
          Using the figures you entered last time, kept in this browser only.{' '}
          <button type="button" className="linkish" onClick={reset}>Reset to defaults</button>
        </p>
      )}

      <div style={{marginTop:18}}>
        <Row label="Sale price" v={sp} />
        <Row label="Outstanding loan" v={-loan} />
        <Row label="CPF principal refund" v={-cpf} sub="Back into your CPF, not lost" />
        <Row label="CPF accrued interest" v={-accrued} sub={`CPF OA rate, compounded over ${yrs} years`} />
        <Row label={`Agent fee (${fee}% + GST) and legal`} v={-agent} />
        <div className={`row tot${short ? ' neg' : ''}`}>
          <span>{short ? 'Shortfall to bring on completion' : 'Cash in hand'}</span>
          <span>{f(Math.abs(cash))}</span>
        </div>
      </div>

      <div className="note">
        <b>{f(cpf + accrued)} returns to your CPF</b>, not your pocket — still yours, and it can fund the
        next purchase. The accrued interest alone is {f(accrued)}, and it grows every year you hold.
        HDB concessionary loan interest is 2.6% p.a.; CPF Ordinary Account accrues at 2.5%.
      </div>
    </>
  );
}

function Row({ label, v, sub }) {
  return (
    <div className={'row' + (v<0?' neg':'')}>
      <span>{label}{sub && <small>{sub}</small>}</span>
      <span>{v<0?'−':''}{f(Math.abs(v))}</span>
    </div>
  );
}
