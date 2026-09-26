'use client';
import { useEffect, useRef, useState } from 'react';
import { f } from './fmt.js';
import { saleProceeds, proceedsStatement } from '../lib/calc/proceeds.js';
import Statement from './Statement.jsx';
import MoneyInput from './MoneyInput.jsx';

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
const DEFAULTS = { loan: 180000, cpf: 150000, cpfInterest: '', yrs: 12, fee: 2 };

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
      cpfInterest: v.cpfInterest === '' ? '' : num(v.cpfInterest, ''),
      yrs: num(v.yrs, DEFAULTS.yrs), fee: num(v.fee, DEFAULTS.fee),
    };
  } catch { return DEFAULTS; }
}

export default function Proceeds({ median, onEngage }) {
  const [sp, setSp]   = useState(Math.round((median||0)/1000)*1000);
  const [loan, setLoan] = useState(DEFAULTS.loan);
  const [cpf, setCpf]   = useState(DEFAULTS.cpf);
  const [cpfInterest, setCpfInterest] = useState(DEFAULTS.cpfInterest);
  const [yrs, setYrs]   = useState(DEFAULTS.yrs);
  const [fee, setFee]   = useState(DEFAULTS.fee);
  const [restored, setRestored] = useState(false);
  const engaged = useRef(false);
  const touch = () => { if (!engaged.current) { engaged.current = true; onEngage?.(); } };

  // Read after mount so the server and client render the same markup first.
  useEffect(() => {
    const v = loadSaved();
    setLoan(v.loan); setCpf(v.cpf); setCpfInterest(v.cpfInterest); setYrs(v.yrs); setFee(v.fee);
    const changed = Object.keys(DEFAULTS).some(k => v[k] !== DEFAULTS[k]);
    setRestored(changed);
  }, []);

  // Persist on change. Wrapped because storage throws in some private modes.
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ loan, cpf, cpfInterest, yrs, fee })); } catch {}
  }, [loan, cpf, cpfInterest, yrs, fee]);

  function reset() {
    setLoan(DEFAULTS.loan); setCpf(DEFAULTS.cpf); setCpfInterest(DEFAULTS.cpfInterest);
    setYrs(DEFAULTS.yrs); setFee(DEFAULTS.fee);
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
    cpfAccruedInterestOverride: cpfInterest,
    agentFeePct: fee,
    propertyType: 'HDB',
  });
  const accrued = r.cpfAccruedInterest;
  const st = proceedsStatement(r);
  const agent   = r.agentFee + r.legalFees;
  const cash    = r.cashProceedsAtMarketValue;
  const short   = r.nonCpfCompletionShortfall > 0;
  // Every segment is money the sale can actually distribute. A required CPF
  // refund larger than the remaining proceeds is described below the bar; it
  // must not be drawn as though the seller paid it from cash.
  const seg = short ? [] : [[cash,'w5'],[loan,'w1'],[r.cpfRefundFromProceeds,'w2'],[agent,'w4']];
  const barBase = sp;

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
        <div><b style={{background:'var(--w2)'}} />CPF refund from proceeds</div>
        <div><b style={{background:'var(--w4)'}} />Fees</div>
      </div>

      <span className="lab">Sale price · <span className="mono">{f(sp)}</span></span>
      <input type="range" aria-label="Sale price"
             min={Math.round((median||sp)*0.8)} max={Math.round((median||sp)*1.2)} step={1000}
             value={sp} onChange={e=>{touch();setSp(+e.target.value)}} />

      {/* Sliders on these two as well as on the sale price. They are the
          figures a seller does not know precisely and wants to feel the shape
          of — "roughly this much loan left, roughly this much CPF in it" —
          which is exactly what a slider is for and a text box is not. Years
          held and the agent fee stay typed: those are facts, not ranges. */}
      <div className="f2 proceedsdetail">
        <div><span className="lab">Outstanding loan</span>
          <MoneyInput value={loan} ariaLabel="Outstanding loan" slider
            min={0} max={Math.max(Math.round(sp * 1.1), 100000)} step={5000}
            onChange={v=>{touch();setLoan(v)}} /></div>
        <div><span className="lab">CPF principal used</span>
          <MoneyInput value={cpf} ariaLabel="CPF principal used" slider
            min={0} max={Math.max(Math.round(sp * 1.1), 100000)} step={5000}
            onChange={v=>{touch();setCpf(v)}} /></div>
      </div>
      <div className="f2 proceedsdetail">
        <div><span className="lab">CPF accrued interest, if known</span>
          <MoneyInput value={cpfInterest} ariaLabel="CPF accrued interest, if known" min={0}
            emptyIsBlank
            max={Math.max(Math.round(sp * 1.1), 100000)} step={1000}
            onChange={v=>{touch();setCpfInterest(v)}} />
          <p className="hint">Use the “What happens if” figure in your CPF Home ownership dashboard. Leave blank to estimate it.</p></div>
        <div><span className="lab">Years since CPF was first used</span><input type="number" min="0" step="0.5"
          disabled={cpfInterest !== ''} value={yrs} onChange={e=>setYrs(Math.max(0, +e.target.value||0))} />
          <p className="hint">Used only for the estimate when accrued interest is blank.</p></div>
      </div>
      <div className="f2 proceedsdetail">
        <div><span className="lab">Agent fee %</span><input type="number" min="0" max="10" step="0.25"
          value={fee} onChange={e=>setFee(Math.min(10, Math.max(0, +e.target.value||0)))} /></div>
      </div>

      {restored && (
        <p className="hint" style={{margin:'10px 0 0',fontSize:12}}>
          Using the figures you entered last time, kept in this browser only.{' '}
          <button type="button" className="linkish" onClick={reset}>Reset to defaults</button>
        </p>
      )}

      {/* Set as a statement (components/Statement.jsx), and it now adds up:
          it used to list the CPF refund required AND the refund paid from the
          proceeds as two deductions. Only what the sale pays out comes off;
          what CPF requires is stated under it. Deductions are ink with a minus
          sign — red is reserved for a price that moved. */}
      <Statement id="proceeds-statement" title={`A sale at ${f(sp)}`}
        basis={r.cpfAccruedInterestEstimated ? 'Your figures · CPF interest estimated' : 'Your figures'}>
        <div className="tablewrap">
          <table className="stmt-rows">
            <tbody>
              <tr><td>Sale price</td><td className="r">{f(st.price)}</td></tr>
              {st.lines.map(l => (
                <tr key={l.key}><td>{{
                  loan: 'Redeems the loan',
                  fees: `Agent fee (${fee}% + GST) and legal`,
                  ssd: 'Seller’s Stamp Duty',
                  other: 'Other costs',
                  cpf: <>Refund to your CPF<span className="q">{r.cpfRefundGap > 0
                    ? `of ${f(cpf + accrued)} required — all the proceeds can pay`
                    : `principal plus ${r.cpfAccruedInterestEstimated ? 'estimated' : 'your'} accrued interest`}</span></>,
                }[l.key]}</td><td className="r">{l.amount ? <>&minus;{f(l.amount)}</> : f(0)}</td></tr>
              ))}
              <tr className="stmt-total"><td>{st.left < 0 ? 'Cash to bring to completion' : 'Cash to you'}</td>
                <td className="r">{st.left < 0 ? <>&minus;{f(-st.left)}</> : f(st.left)}</td></tr>
            </tbody>
          </table>
        </div>
      </Statement>

      <div className={r.cpfRefundGap > 0 ? 'warn' : 'note'}>
        {r.cpfRefundGap > 0 ? <>
          <b>These proceeds are {f(r.cpfRefundGap)} below the required CPF refund.</b>{' '}
          If the home is sold at market value, CPF Board says you generally refund only what remains after
          the housing loan; that CPF gap is not automatically cash you bring. If it is sold below market value,
          CPF may require a cash top-up. Option monies also form part of the proceeds.</> : <>
          <b>{f(cpf + accrued)} returns to your CPF</b>, not your pocket — still yours, and it can fund the
          next purchase. The accrued interest alone is {f(accrued)}.</>}
        {' '}<a href="https://www.cpf.gov.sg/service/article/how-much-do-i-need-to-refund-to-my-cpf-account-if-i-am-selling-my-whole-property">
          CPF Board’s market-value rule</a> · CPF OA interest 2.5% p.a.
      </div>
    </>
  );
}
