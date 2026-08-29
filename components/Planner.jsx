'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { plan, maxPrice } from '../lib/calc/plan.js';
import { SOURCES, RATES_REVIEWED, LTV_REVIEWED } from '../lib/calc/constants.js';
import { f } from './fmt.js';
import { titleCase } from '../lib/name.js';
import { Figure } from './Motion.jsx';
import MoneyInput from './MoneyInput.jsx';

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
 *
 * ── LAYOUT ─────────────────────────────────────────────────────────────────
 * The answer used to sit below eleven inputs in a 760px column, which meant
 * every change to an input scrolled its own consequence off the screen. On a
 * wide viewport the inputs and the answer now sit side by side and the answer
 * is sticky, so the two figures that matter stay visible while you argue with
 * the assumptions that produce them. Below that width the summary becomes a
 * bar pinned to the bottom of the screen, for the same reason.
 *
 * The inputs are grouped because eleven fields in one grid have no shape:
 * what you are buying, who is buying, what you have, what you already carry.
 * The financing assumption is folded away — it has one sensible answer for
 * almost everyone and it is the field least worth reading past.
 */
const money = n => (Number.isFinite(n) ? f(n) : '—');
const n2 = v => (Number.isFinite(v) ? v.toLocaleString('en-SG') : '—');
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

/**
 * Where the figures came from, when they came from a block page.
 *
 * This was `Prefilled from /hdb/ang-mo-kio/591a-ang-mo-kio-st-51` — the raw
 * path, printed at the reader. It made the handoff look like a URL had leaked
 * rather than like the site had carried their property across, and it gave
 * them nothing to check the prefill against.
 *
 * The record is fetched rather than passed through the query string: the
 * alternative was five more parameters on a link that already carries three,
 * and a URL nobody could read. If the fetch fails the strip falls back to a
 * plain link, because the calculator works perfectly well without it and a
 * dead panel would be worse than a sentence.
 */
function FromProperty({ href }) {
  const [rec, setRec] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!href) return;
    const ctl = new AbortController();
    fetch(`/api/record?href=${encodeURIComponent(href)}`, { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('no record'))))
      .then(setRec)
      .catch(e => { if (e.name !== 'AbortError') setFailed(true); });
    return () => ctl.abort();
  }, [href]);

  if (!href) return null;

  if (!rec) {
    return (
      <p className="hint" style={{ marginTop: 0 }}>
        {failed ? <>Prefilled from <a href={href}>{href}</a>.</> : 'Loading the property…'}
        {' '}Change anything below — nothing is saved and nothing is sent.
      </p>
    );
  }

  return (
    <div className="fromprop">
      <div>
        <span className="lab">Prefilled from</span>
        <b>{titleCase(rec.label)}</b>
        <span className="mono">{[
          rec.kind === 'HDB' ? titleCase(rec.town) : `District ${rec.district}`,
          Number.isFinite(rec.medianPrice) ? `median ${money(rec.medianPrice)}` : null,
          `${n2(rec.n)} filed transaction${rec.n === 1 ? '' : 's'}`,
        ].filter(Boolean).join(' · ')}</span>
      </div>
      <a href={href} className="fromback">← Back to the property</a>
    </div>
  );
}

/**
 * Towns whose median filed resale price sits inside the ceiling.
 *
 * Twenty-two tiles between the answer and the arithmetic that produced it is
 * a wall, so five show and the rest are one click away. Sorted nearest the
 * ceiling first by default, because the interesting end of "what can I afford"
 * is the top of it, not the bottom.
 *
 * It says median PRICE. Half the flats filed in a town sold above its median,
 * which is the qualifier printed below — this is somewhere to start looking,
 * not a claim that a flat exists at this price.
 */
function TownsWithin({ towns, cap, source, period }) {
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState('closest');

  const within = useMemo(() => {
    const list = towns.filter(t => Number.isFinite(t.medianPrice) && t.medianPrice <= cap);
    const by = {
      closest: (a, b) => b.medianPrice - a.medianPrice,
      cheapest: (a, b) => a.medianPrice - b.medianPrice,
      psf: (a, b) => b.medianPsf - a.medianPsf,
    }[sort];
    return list.slice().sort(by);
  }, [towns, cap, sort]);

  if (!Number.isFinite(cap)) return null;

  const shown = all ? within : within.slice(0, 5);

  return (
    <div className="within">
      <div className="sh">
        <span>Where a median flat is inside {money(cap)}</span>
        <span>{within.length} of {towns.length} towns</span>
      </div>

      {within.length === 0 ? (
        <p className="hint" style={{ marginTop: 12 }}>
          No town has a median resale price this low. The cheapest is{' '}
          {towns.reduce((lo, t) => (t.medianPrice < lo.medianPrice ? t : lo), towns[0]).name} at{' '}
          {money(Math.min(...towns.map(t => t.medianPrice)))}.
        </p>
      ) : (
        <>
          <div className="withinsort">
            <span className="lab">Sort</span>
            <div className="seg">
              <button type="button" aria-pressed={sort === 'closest'}
                onClick={() => setSort('closest')}>Closest to budget</button>
              <button type="button" aria-pressed={sort === 'cheapest'}
                onClick={() => setSort('cheapest')}>Lowest price</button>
              <button type="button" aria-pressed={sort === 'psf'}
                onClick={() => setSort('psf')}>Highest psf</button>
            </div>
          </div>

          <div className="tiles" style={{ marginTop: 12 }}>
            {shown.map(t => (
              <a key={t.slug} className="tile" href={`/hdb/${t.slug}`}>
                <span className="n">{t.name}</span>
                <span className="v mono">{money(t.medianPrice)}</span>
                <span className="b mono">median · ${n2(t.medianPsf)} psf</span>
              </a>
            ))}
          </div>

          <div className="withinmore">
            {within.length > 5 && (
              <button type="button" className="linkish" onClick={() => setAll(v => !v)}>
                {all ? 'Show the closest five' : `View all ${within.length}`}
              </button>
            )}
            <Link href="/map">See these towns on the price map →</Link>
          </div>
        </>
      )}

      {source && (
        <p className="prov">
          Median filed resale price per town · {source}
          {period ? ` · ${period.from} to ${period.to}` : ''}.<br />
          Town medians are somewhere to start looking, not a guarantee that a flat is
          available at this price — half of the flats filed in a town sold above its median.
        </p>
      )}
    </div>
  );
}

export default function Planner({ towns = [], townSource = null, townPeriod = null }) {
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

      <FromProperty href={from} />

      <div className="planlayout">
        <div className="planinputs">
          <fieldset className="plangroup">
            <legend className="lab">What you are buying</legend>
            <div className="seg" role="group" aria-label="What you are buying">
              <button aria-pressed={type === 'HDB'} onClick={() => setType('HDB')}>HDB resale</button>
              <button aria-pressed={type === 'PRIVATE'} onClick={() => setType('PRIVATE')}>Private</button>
            </div>
            <div className="planform">
              <label className="wide2"><span>Price</span>
                <MoneyInput value={price} onChange={setPrice} slider
                  min={100000} max={5000000} step={10000} /></label>
            </div>
          </fieldset>

          <fieldset className="plangroup">
            <legend className="lab">Household</legend>
            <div className="planform">
              <label><span>Monthly income, you</span>
                <MoneyInput value={a1} onChange={setA1} /></label>
              <label><span>Your age</span>
                <input type="number" value={g1} onChange={e => setG1(e.target.value)} /></label>
              <label><span>Monthly income, co-applicant</span>
                <MoneyInput value={a2} onChange={setA2} /></label>
              <label><span>Their age</span>
                <input type="number" value={g2} onChange={e => setG2(e.target.value)} /></label>
              <label><span>Buyer profile</span>
                <select value={profile} onChange={e => setProfile(e.target.value)}>
                  <option value="SC">Singapore Citizen</option>
                  <option value="SPR">Permanent Resident</option>
                  <option value="FOREIGNER">Foreigner</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="plangroup">
            <legend className="lab">Available cash and CPF</legend>
            <div className="planform">
              {/* Sliders: after price these are the two figures people move to
                  see what changes, and they are the two that decide the cash
                  floor. Incomes and ages are stated once, so they stay typed. */}
              <label><span>Cash available</span>
                <MoneyInput value={cash} onChange={setCash} slider
                  min={0} max={800000} step={5000} /></label>
              <label><span>CPF OA available</span>
                <MoneyInput value={cpf} onChange={setCpf} slider
                  min={0} max={800000} step={5000} /></label>
            </div>
          </fieldset>

          <fieldset className="plangroup">
            <legend className="lab">What you already carry</legend>
            <div className="planform">
              <label><span>Other monthly repayments</span>
                <MoneyInput value={debts} onChange={setDebts} /></label>
              <label><span>Housing loans already running</span>
                <select value={loans} onChange={e => setLoans(Number(e.target.value))}>
                  <option value={0}>None</option>
                  <option value={1}>One or more</option>
                </select>
              </label>
              <label><span>Properties owned after this one</span>
                <select value={owned} onChange={e => setOwned(Number(e.target.value))}>
                  <option value={1}>This is my only one</option>
                  <option value={2}>My second</option>
                  <option value={3}>My third or more</option>
                </select>
              </label>
            </div>
          </fieldset>

          {type === 'HDB' && (
            <details className="plangroup planfold">
              <summary><span className="lab">Financing assumption</span></summary>
              <div className="planform">
                <label><span>Loan from</span>
                  <select value={hdbLoan ? 'hdb' : 'bank'}
                    onChange={e => setHdbLoan(e.target.value === 'hdb')}>
                    <option value="hdb">HDB concessionary</option>
                    <option value="bank">A bank</option>
                  </select>
                </label>
              </div>
              <p className="hint" style={{ margin: '10px 0 0' }}>
                An HDB loan is assessed on MSR as well as TDSR, and carries a different
                loan-to-value ceiling. Change this only if you know which you are taking.
              </p>
            </details>
          )}
        </div>

        {/* The answer, kept in view while the inputs above it move. */}
        <aside className="plansummary" aria-label="Your result">
          <div className="plansumin">
            <div className="plansumfig">
              <span className="lab">Cash you need on the day</span>
              <Figure value={r.cashNeeded} format={money} />
              <p className="hint">
                {r.shortfall > 0
                  ? <>That is <b>{money(r.shortfall)} more than the {money(r.cashAvailable)} you have.</b> CPF cannot close it — the shortfall is in the part that must be cash.</>
                  : <>Within the {money(r.cashAvailable)} you have, with {money(r.cashAvailable - r.cashNeeded)} left over.</>}
              </p>
            </div>
            <div className="plansumfig">
              <span className="lab">The most this supports</span>
              <Figure value={cap} format={money} />
              <p className="hint">
                The highest price your income, cash and CPF still clear — stamp duty included.
              </p>
            </div>
            <div className="plansumrows">
              <div><span>The loan</span><b className="mono">{money(r.loan)}</b></div>
              <div><span>Limited by</span><b>{r.limitedBy}</b></div>
              <div><span>Downpayment</span><b className="mono">{money(r.downpayment)}</b></div>
            </div>
          </div>
        </aside>
      </div>

      {/* Below the two-column breakpoint the same two figures pin to the foot
          of the screen, so the consequence of a change is never off-screen. */}
      <div className="planbar" aria-hidden="true">
        <span><i className="lab">Budget</i> <b className="mono">{money(cap)}</b></span>
        <span><i className="lab">Cash needed</i> <b className="mono">{money(r.cashNeeded)}</b></span>
      </div>

      <TownsWithin towns={towns} cap={cap} source={townSource} period={townPeriod} />

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
