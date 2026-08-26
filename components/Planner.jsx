'use client';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { plan, maxPrice } from '../lib/calc/plan.js';
import { SOURCES, RATES_REVIEWED, LTV_REVIEWED } from '../lib/calc/constants.js';
import { f } from './fmt.js';
import { Figure } from './Motion.jsx';

/**
 * TDSR, BSD and ABSD as one answer.
 *
 * The three calculators underneath have been tested since the first week and
 * answered three separate questions. Nobody buys a flat in three separate
 * questions — they ask "can I do this, and what do I need on the day", and
 * that is a chain.
 *
 * The chain is rendered, not just its total. Every row below is a step someone
 * can disagree with, and a buyer who cannot see which assumption produced the
 * number has been given a verdict rather than a tool.
 *
 * `?price=` prefills, so a block page can hand a reader their own figures.
 */
const money = n => (Number.isFinite(n) ? f(n) : '—');
const pc = n => `${(n * 100).toFixed(n * 100 % 1 ? 1 : 0)}%`;

function Row({ label, value, note, strong }) {
  return (
    <div className={`planrow${strong ? ' strong' : ''}`}>
      <span className="l">{label}</span>
      <span className="v mono">{value}</span>
      {note && <span className="n">{note}</span>}
    </div>
  );
}

export default function Planner() {
  const q = useSearchParams();
  const [price, setPrice] = useState(Number(q.get('price')) || 650000);
  const [type, setType] = useState(q.get('type') === 'PRIVATE' ? 'PRIVATE' : 'HDB');
  const [hdbLoan, setHdbLoan] = useState(true);
  const [a1, setA1] = useState(6000); const [g1, setG1] = useState(34);
  const [a2, setA2] = useState(5000); const [g2, setG2] = useState(32);
  const [debts, setDebts] = useState(800);
  const [cash, setCash] = useState(80000);
  const [cpf, setCpf] = useState(120000);
  const [profile, setProfile] = useState('SC');
  const [owned, setOwned] = useState(1);
  const [loans, setLoans] = useState(0);
  const from = q.get('from');

  const input = useMemo(() => ({
    applicants: [
      { fixedIncome: Number(a1) || 0, age: Number(g1) || 35 },
      ...(Number(a2) > 0 ? [{ fixedIncome: Number(a2), age: Number(g2) || 35 }] : []),
    ],
    monthlyDebts: Number(debts) || 0,
    propertyType: type,
    hdbLoan: type === 'HDB' && hdbLoan,
    existingLoans: Number(loans) || 0,
    profile,
    propertyCount: Number(owned) || 1,
    cashAvailable: Number(cash) || 0,
    cpfAvailable: Number(cpf) || 0,
  }), [a1, g1, a2, g2, debts, type, hdbLoan, loans, profile, owned, cash, cpf]);

  const r = useMemo(() => plan({ ...input, price: Number(price) || 0 }), [input, price]);
  const cap = useMemo(() => maxPrice(input), [input]);

  return (
    <>
      {r.ratesUnverified && (
        <div className="warn" style={{ marginBottom: 18 }}>
          <p style={{ margin: 0 }}>
            <b>The loan-to-value ceilings have not been re-checked since they were last reviewed.</b>{' '}
            Treat the loan ceiling and the cash floor below as provisional until they are.
          </p>
        </div>
      )}

      {from && (
        <p className="hint" style={{ marginTop: 0 }}>
          Prefilled from <a href={from}>{from}</a>. Change anything below — nothing is saved and
          nothing is sent.
        </p>
      )}

      <div className="seg" role="group" aria-label="What you are buying">
        <button aria-pressed={type === 'HDB'} onClick={() => setType('HDB')}>HDB resale</button>
        <button aria-pressed={type === 'PRIVATE'} onClick={() => setType('PRIVATE')}>Private</button>
      </div>

      <div className="planform">
        <label><span>Price</span><input type="number" step="10000" value={price} onChange={e => setPrice(e.target.value)} /></label>
        <label><span>Monthly income, you</span><input type="number" step="500" value={a1} onChange={e => setA1(e.target.value)} /></label>
        <label><span>Your age</span><input type="number" value={g1} onChange={e => setG1(e.target.value)} /></label>
        <label><span>Monthly income, co-applicant</span><input type="number" step="500" value={a2} onChange={e => setA2(e.target.value)} /></label>
        <label><span>Their age</span><input type="number" value={g2} onChange={e => setG2(e.target.value)} /></label>
        <label><span>Other monthly repayments</span><input type="number" step="100" value={debts} onChange={e => setDebts(e.target.value)} /></label>
        <label><span>Cash available</span><input type="number" step="10000" value={cash} onChange={e => setCash(e.target.value)} /></label>
        <label><span>CPF OA available</span><input type="number" step="10000" value={cpf} onChange={e => setCpf(e.target.value)} /></label>
        <label><span>Buyer profile</span>
          <select value={profile} onChange={e => setProfile(e.target.value)}>
            <option value="SC">Singapore Citizen</option>
            <option value="SPR">Permanent Resident</option>
            <option value="FOREIGNER">Foreigner</option>
          </select>
        </label>
        <label><span>Properties owned after this one</span>
          <select value={owned} onChange={e => setOwned(Number(e.target.value))}>
            <option value={1}>This is my only one</option>
            <option value={2}>My second</option>
            <option value={3}>My third or more</option>
          </select>
        </label>
        <label><span>Housing loans already running</span>
          <select value={loans} onChange={e => setLoans(Number(e.target.value))}>
            <option value={0}>None</option>
            <option value={1}>One or more</option>
          </select>
        </label>
        {type === 'HDB' && (
          <label><span>Loan from</span>
            <select value={hdbLoan ? 'hdb' : 'bank'} onChange={e => setHdbLoan(e.target.value === 'hdb')}>
              <option value="hdb">HDB concessionary</option>
              <option value="bank">A bank</option>
            </select>
          </label>
        )}
      </div>

      <div className="storeygrid" style={{ marginTop: 22 }}>
        <div className="storeycard">
          <span className="filtn">Cash you need on the day</span>
          <Figure value={r.cashNeeded} format={money} />
          <p className="hint">
            {r.shortfall > 0
              ? <>That is <b>{money(r.shortfall)} more than the {money(r.cashAvailable)} you have.</b> CPF cannot close it — the shortfall is in the part that must be cash.</>
              : <>Within the {money(r.cashAvailable)} you have, with {money(r.cashAvailable - r.cashNeeded)} left over.</>}
          </p>
        </div>
        <div className="storeycard">
          <span className="filtn">The most this supports</span>
          <Figure value={cap} format={money} />
          <p className="hint">
            The highest price your income, cash and CPF still clear — stamp duty included, which is
            what makes this lower than a loan calculator would suggest.
          </p>
        </div>
      </div>

      <div className="plansteps">
        <Row label="A bank would assess you for" value={money(r.afford.maxLoan)}
          note={`${r.afford.bindingConstraint} over ${r.afford.tenureYears} years, tested at ${pc(r.afford.assessedAtRate)}`} />
        <Row label={`The ${pc(r.ltv.rate)} ceiling on this price allows`} value={money(r.ltv.cap)} note={r.ltv.why} />
        <Row label="So the loan is" value={money(r.loan)} note={`limited by ${r.limitedBy}`} strong />
        <Row label="Downpayment" value={money(r.downpayment)} note="price less the loan" />
        <Row label="— of which must be cash" value={money(r.cashFloor)} note={`${pc(r.ltv.cashMin)} of price, CPF not allowed`} />
        <Row label="— covered by CPF" value={money(r.cpfTowardsDown)} note="as far as your OA goes" />
        <Row label="Buyer's Stamp Duty" value={money(r.duties.bsd)} note="progressive, on the price" />
        <Row label="Additional Buyer's Stamp Duty" value={money(r.duties.absd)}
          note={r.duties.absd === 0 ? 'none — first residential property' : `${pc(r.duties.absdRate)} at this profile and count`} />
        <Row label="Mortgage stamp duty" value={money(r.duties.mortgage)}
          note="0.4% of the loan, capped at $500 — the line most calculators leave out" />
        <Row label="Cash needed on the day" value={money(r.cashNeeded)} note="downpayment cash plus all three duties" strong />
      </div>

      <p className="prov" style={{ marginTop: 22 }}>
        TDSR {pc(r.assumptions.tdsrLimit)}{r.assumptions.msrLimit ? ` · MSR ${pc(r.assumptions.msrLimit)}` : ''} ·
        stress rate {pc(r.assumptions.stressRate)} · LTV {pc(r.assumptions.ltvRate)} ·
        cash floor {pc(r.assumptions.cashMin)}<br />
        {SOURCES.bsd.name} · {SOURCES.absd.name} · rates last reviewed {RATES_REVIEWED}
        {LTV_REVIEWED ? ` · LTV reviewed ${LTV_REVIEWED}` : ' · LTV not yet reviewed'}<br />
        This plans a purchase from figures you typed. It does not value any property, and it is not
        financial advice. Nothing here is sent anywhere.
      </p>
    </>
  );
}
