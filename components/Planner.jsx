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
 *
 * NOTHING CONSEQUENTIAL IS FOLDED AWAY ANY MORE. "Financing assumption" used
 * to be a disclosure triangle, on the reasoning that it had one sensible
 * answer for almost everyone — which was fair while it changed no figure on
 * the page, and stopped being fair the moment it decided the cash floor. Who
 * is lending is now asked beside what is being bought, and both answers are
 * priced in the hint so the choice is visible rather than inferred.
 */
const money = n => (Number.isFinite(n) ? f(n) : '—');
const n2 = v => (Number.isFinite(v) ? v.toLocaleString('en-SG') : '—');
/* Rounded before the remainder is tested, or 0.55 * 100 comes out as
   55.000000000000004, takes the decimal branch, and prints "TDSR 55.0%"
   beside "MSR 30%". */
const pc = n => { const v = Math.round(n * 1000) / 10; return `${v.toFixed(v % 1 ? 1 : 0)}%`; };

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
 * Where a median home is inside the ceiling — in the market you said you were
 * buying in.
 *
 * IT USED TO IGNORE THE PROPERTY TYPE ENTIRELY. Whatever you selected, this
 * listed HDB town medians, so a private buyer with a S$5.1m budget was shown
 * towns whose median flat is S$700k–S$960k and told that 26 of 26 qualified.
 * The tiles were correct data answering a question nobody had asked.
 *
 * Twenty-eight tiles between the answer and the arithmetic that produced it is
 * a wall, so five show and the rest are one click away. Sorted nearest the
 * ceiling first by default, because the interesting end of "what can I afford"
 * is the top of it, not the bottom.
 *
 * It says median PRICE. Half of what was filed sold above it — this is
 * somewhere to start looking, not a claim that a home exists at this price.
 */
function MarketWithin({ market, cap }) {
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState('closest');

  const items = market?.items || [];
  const within = useMemo(() => {
    const list = items.filter(t => Number.isFinite(t.medianPrice) && t.medianPrice <= cap);
    const by = {
      closest: (a, b) => b.medianPrice - a.medianPrice,
      cheapest: (a, b) => a.medianPrice - b.medianPrice,
      psf: (a, b) => b.medianPsf - a.medianPsf,
    }[sort];
    return list.slice().sort(by);
  }, [items, cap, sort]);

  if (!Number.isFinite(cap) || !items.length) return null;

  const shown = all ? within : within.slice(0, 5);
  // Two nouns, not one: what the tiles ARE (a town, a district) and what is
  // being priced inside them (a flat, an EC, a home). Using the container for
  // both produced "Where a median town is inside S$731,000".
  const noun = market.label, nouns = market.plural, unit = market.unit;

  return (
    <div className="within">
      <div className="sh">
        <span>Where a median {unit} is inside {money(cap)}</span>
        <span>{within.length} of {items.length} {nouns}</span>
      </div>

      {within.length === 0 ? (
        <p className="hint" style={{ marginTop: 12 }}>
          No {noun} has a median this low. The cheapest is{' '}
          {items.reduce((lo, t) => (t.medianPrice < lo.medianPrice ? t : lo), items[0]).name} at{' '}
          {money(Math.min(...items.map(t => t.medianPrice)))}.
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
              <a key={t.key} className="tile" href={t.href}>
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
            <Link href="/map">See these on the price map →</Link>
          </div>
        </>
      )}

      <p className="prov">
        Median filed price per {noun} · {market.source}
        {market.period ? ` · ${market.period.from} to ${market.period.to}` : ''}.<br />
        {market.note ? <>{market.note}<br /></> : null}
        A median is somewhere to start looking, not a guarantee that a home is available at
        this price — half of what was filed sold above it.
      </p>
    </div>
  );
}

/**
 * What is being bought, in the two questions that actually change the maths.
 *
 * The first row is the kind of home. The second only appears for an EC, and it
 * is the one nobody expects: from the developer an EC is assessed on MSR like
 * an HDB flat, and a resale EC is not assessed on MSR at all. Same building,
 * same buyer, a different borrowing limit — so it is asked rather than assumed,
 * and the consequence is printed underneath rather than left in a footnote.
 */
function BuyingWhat({ type, setType, hdbLoan, setHdbLoan, price }) {
  const family = type === 'HDB' ? 'HDB' : type.startsWith('EC') ? 'EC' : 'PRIVATE';
  const bankCash = Math.ceil((Number(price) || 0) * 0.05);
  return (
    <>
      <div className="seg" role="group" aria-label="What you are buying">
        <button aria-pressed={family === 'HDB'} onClick={() => setType('HDB')}>HDB resale</button>
        <button aria-pressed={family === 'EC'} onClick={() => setType('EC_DEVELOPER')}>Executive condo</button>
        <button aria-pressed={family === 'PRIVATE'} onClick={() => setType('PRIVATE')}>Private</button>
      </div>

      {/*
        * WHO IS LENDING, ASKED IN THE OPEN.
        *
        * This lived inside a collapsed "Financing assumption" fold, described
        * as the field least worth reading past. That was true while it changed
        * nothing — it had quietly stopped affecting any figure after HDB's LTV
        * levelled with the banks in Aug 2024. Now that it decides the cash
        * floor it is the second most consequential control on the page, and a
        * question worth S$32,500 on a S$650,000 flat does not belong behind a
        * disclosure triangle. Both answers are priced here, so the choice is
        * visible rather than inferred from a number that moved.
        */}
      {family === 'HDB' && (
        <>
          <div className="seg subseg" role="group" aria-label="Who the loan is from" style={{ marginTop: 8 }}>
            <button aria-pressed={hdbLoan} onClick={() => setHdbLoan(true)}>HDB concessionary loan</button>
            <button aria-pressed={!hdbLoan} onClick={() => setHdbLoan(false)}>A bank loan</button>
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            {hdbLoan
              ? <><b>No cash floor.</b> The whole 25% downpayment can come from CPF OA. A bank loan on the same flat would need {money(bankCash)} of it in cash that CPF cannot cover.</>
              : <><b>{money(bankCash)} must be cash.</b> Five per cent of the price, which CPF cannot cover however large the OA balance is. An HDB loan has no cash floor.</>}
            {' '}Both are assessed on MSR and TDSR, and both cap at 75%.
          </p>
        </>
      )}

      {family === 'EC' && (
        <>
          <div className="seg subseg" role="group" aria-label="Which kind of EC purchase" style={{ marginTop: 8 }}>
            <button aria-pressed={type === 'EC_DEVELOPER'}
              onClick={() => setType('EC_DEVELOPER')}>From the developer</button>
            <button aria-pressed={type === 'EC_RESALE'}
              onClick={() => setType('EC_RESALE')}>Resale, past MOP</button>
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            {type === 'EC_DEVELOPER'
              ? <><b>MSR applies.</b> A new EC is assessed on the 30% servicing ratio as well as TDSR, the way an HDB flat is — and repaid over 30 years, the way private property is. Bank financing only; there is no HDB loan on an EC.</>
              : <><b>MSR does not apply.</b> Past its MOP an EC is private property for financing, so only TDSR binds. Bank financing only.</>}
          </p>
        </>
      )}
    </>
  );
}

const VALID_TYPES = ['HDB', 'EC_DEVELOPER', 'EC_RESALE', 'PRIVATE'];

export default function Planner({ markets = {} }) {
  const q = useSearchParams();
  const [price, setPrice] = useState(Number(q.get('price')) || 650000);
  // Record pages hand over HDB or PRIVATE; the EC branches are chosen here.
  const [type, setType] = useState(VALID_TYPES.includes(q.get('type')) ? q.get('type') : 'HDB');
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

  const market = type === 'HDB' ? markets.HDB : type.startsWith('EC') ? markets.EC : markets.PRIVATE;
  const priceMax = type === 'HDB' ? 1_500_000 : type.startsWith('EC') ? 3_000_000 : 10_000_000;

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

      {/* This one names a single figure rather than the whole rate table,
          because it lowers the cash needed and that is the direction where
          being wrong leaves a buyer short on completion day. */}
      {r.cashFloorUnverified && (
        <div className="warn" style={{ marginBottom: 18 }}>
          <p style={{ margin: 0 }}>
            <b>The cash floor for an HDB concessionary loan has not been re-checked.</b>{' '}
            This plans on the whole downpayment coming from CPF OA, which is what HDB
            publishes — but it has not been confirmed here, and it is the figure that
            decides whether you can complete. Confirm it with HDB before relying on it,
            or switch “Loan from” to a bank for the more conservative number.
          </p>
        </div>
      )}

      <FromProperty href={from} />

      <div className="planlayout">
        <div className="planinputs">
          <fieldset className="plangroup">
            <legend className="lab">What you are buying</legend>
            <BuyingWhat type={type} setType={setType} hdbLoan={hdbLoan} setHdbLoan={setHdbLoan} price={price} />
            <div className="planform">
              {/* The slider's range follows the market. A single 100k–5m track
                  spends four fifths of its travel on prices no HDB flat has
                  ever filed at, and runs out before a private buyer's. */}
              <label className="wide2"><span>Price</span>
                <MoneyInput value={price} onChange={setPrice} slider
                  min={100000} max={priceMax} step={priceMax > 3000000 ? 50000 : 10000} /></label>
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

      <MarketWithin market={market} cap={cap} />

      <div className="plansteps">
        <Row label="A bank would assess you for" value={money(r.afford.maxLoan)}
          note={`${r.afford.bindingConstraint} over ${r.afford.tenureYears} years, tested at ${pc(r.afford.assessedAtRate)}`} />
        <Row label={`The ${pc(r.ltv.rate)} ceiling on this price allows`} value={money(r.ltv.cap)} note={r.ltv.why} />
        <Row label="So the loan is" value={money(r.loan)} note={`limited by ${r.limitedBy}`} strong />
        <Row label="Downpayment" value={money(r.downpayment)} note="price less the loan" />
        <Row label="— of which must be cash" value={money(r.cashFloor)}
          note={r.ltv.cashMin === 0
            ? 'none — an HDB loan takes the downpayment from CPF OA'
            : `${pc(r.ltv.cashMin)} of price, CPF not allowed`} />
        <Row label="— covered by CPF" value={money(r.cpfTowardsDown)} note="as far as your OA goes" />
        <Row label="Buyer's Stamp Duty" value={money(r.duties.bsd)} note="progressive, on the price" />
        <Row label="Additional Buyer's Stamp Duty" value={money(r.duties.absd)}
          note={r.duties.absd === 0 ? 'none — first residential property' : `${pc(r.duties.absdRate)} at this profile and count`} />
        <Row label="Mortgage stamp duty" value={money(r.duties.mortgage)}
          note="0.4% of the loan, capped at $500 — the line most calculators leave out" />
        <Row label="Cash needed on the day" value={money(r.cashNeeded)} note="downpayment cash plus all three duties" strong />
      </div>

      <p className="prov" style={{ marginTop: 22 }}>
        TDSR {pc(r.assumptions.tdsrLimit)}
        {r.assumptions.msrLimit ? ` · MSR ${pc(r.assumptions.msrLimit)}` : ' · MSR does not apply to this purchase'} ·
        tenure to {r.assumptions.tenureCap} years · stress rate {pc(r.assumptions.stressRate)} ·
        LTV {pc(r.assumptions.ltvRate)} · cash floor {pc(r.assumptions.cashMin)}<br />
        {SOURCES.bsd.name} · {SOURCES.absd.name} · rates last reviewed {RATES_REVIEWED}
        {LTV_REVIEWED ? ` · LTV reviewed ${LTV_REVIEWED}` : ' · LTV not yet reviewed'}<br />
        This plans a purchase from figures you typed. It does not value any property, and it is not
        financial advice. Nothing here is sent anywhere.
      </p>
    </>
  );
}
