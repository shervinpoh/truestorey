'use client';
import { useMemo, useState } from 'react';
import { affordability } from '../lib/calc/affordability.js';
import { bsd, absd, ssd } from '../lib/calc/stampDuty.js';
import { sellTimeline } from '../lib/calc/timeline.js';
import { amortise, extraPaymentSaving } from '../lib/calc/amortise.js';
import { SOURCES, TDSR_LIMIT, MSR_LIMIT, STRESS_TEST_RATE, VARIABLE_INCOME_HAIRCUT } from '../lib/calc/constants.js';
import { f } from './fmt.js';
import { useSearchParams } from 'next/navigation';
import { QUICK } from '../lib/nav.js';
import { toolRun } from './Track.jsx';

/**
 * The three calculators that were built, tested, and reachable from nowhere.
 *
 * `affordability`, `stampDuty` and `timeline` have been in lib/calc since the
 * first week with unit tests against them, and no page ever imported one. The
 * sell timeline in particular is the highest-intent thing on the site — it is
 * the question an owner actually types into Google — and it was sitting in a
 * file nobody could reach.
 *
 * Every figure below renders the rate it used and the date that rate was last
 * reviewed. A calculator that shows an answer without showing its assumptions
 * is worse than no calculator, because it looks authoritative while being
 * silently out of date the moment a cooling measure lands.
 */
const money = n => (Number.isFinite(n) ? f(Math.round(n)) : '—');
const pc = n => `${(n * 100).toFixed(n * 100 % 1 ? 1 : 0)}%`;

export default function Tools({ ratesReviewed }) {
  /* The tab is in the URL so one of these can be LINKED. Before this, every
     route into the quick calculators opened "When can I sell" and left the
     reader to find the one they were sent for — which meant a situation card,
     an article or a support reply could not point at the stamp-duty answer at
     all. Read once for the initial tab; written with replaceState afterwards
     so switching tabs does not push a history entry the back button then has
     to walk through. */
  const params = useSearchParams();
  const asked = params.get('calc');
  const [tab, setTab] = useState(QUICK.some(q => q.id === asked) ? asked : 'sell');

  const choose = id => {
    setTab(id);
    // Four tools behind one route. Counting them as "/tools" would say the
    // page was used and never which of the four, which is the only part worth
    // knowing before deciding whether to merge or drop one.
    toolRun(`quick:${id}`);
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    u.searchParams.set('calc', id);
    window.history.replaceState(null, '', u);
  };

  const shown = QUICK.find(q => q.id === tab);

  return (
    <>
      <div className="seg segwrap" role="group" aria-label="Choose a calculator">
        {QUICK.map(q => (
          <button key={q.id} aria-pressed={tab === q.id} onClick={() => choose(q.id)}>{q.label}</button>
        ))}
      </div>
      {/* What this one gives you, before it gives it. Four tabs that each
          produce a different kind of answer are otherwise four unlabelled
          doors. */}
      {shown && <p className="quickget"><b>You will get:</b> {shown.get}</p>}
      <div style={{ marginTop: 22 }}>
        {tab === 'sell' && <Sell />}
        {tab === 'afford' && <Afford />}
        {tab === 'duty' && <Duty />}
        {tab === 'loan' && <Mortgage />}
      </div>
      <p className="prov" style={{ marginTop: 26 }}>
        Rates last reviewed {ratesReviewed}. TDSR {pc(TDSR_LIMIT)} · MSR {pc(MSR_LIMIT)} ·
        stress rate {pc(STRESS_TEST_RATE)}.<br />
        {SOURCES.bsd.name} (effective {SOURCES.bsd.effective}) · {SOURCES.absd.name} (effective {SOURCES.absd.effective}) ·
        {' '}{SOURCES.ssd.name} (effective {SOURCES.ssd.effective}).<br />
        These are calculations against published rates, not advice, and not a substitute for IRAS or your banker.
      </p>
    </>
  );
}

/* ───────────────────────────── when can I sell ─────────────────────────── */
function Sell() {
  const [kind, setKind] = useState('HDB');
  const [date, setDate] = useState('2022-03-15');
  const [price, setPrice] = useState(1800000);

  const res = useMemo(() => {
    const d = new Date(date);
    if (isNaN(d)) return null;
    try {
      return sellTimeline({
        propertyType: kind,
        purchaseDate: d,
        keyCollectionDate: kind === 'HDB' ? d : null,
        price: kind === 'HDB' ? null : Number(price) || null,
      });
    } catch { return null; }
  }, [kind, date, price]);

  return (
    <>
      <div className="seg">
        {['HDB', 'PRIVATE'].map(k => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'HDB' ? 'HDB flat' : 'Private'}
          </button>
        ))}
      </div>
      <div className="fld">
        <span className="lab" style={{ display: 'block', marginBottom: 6 }}>
          {kind === 'HDB' ? 'Date you collected keys' : 'Date you bought it'}
        </span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        {kind === 'HDB' && (
          <p className="hint" style={{ marginTop: 8 }}>
            MOP runs five years from key collection, not from the option date and not from completion.
          </p>
        )}
      </div>

      {kind === 'PRIVATE' && (
        <div className="fld" style={{ marginTop: 14 }}>
          <span className="lab" style={{ display: 'block', marginBottom: 6 }}>What you would sell for</span>
          <input type="number" step="50000" value={price} onChange={e => setPrice(e.target.value)} />
          <p className="hint" style={{ marginTop: 8 }}>
            SSD is charged on the sale price, so the cost of going now depends on it.
          </p>
        </div>
      )}

      {!res ? (
        <p className="hint" style={{ marginTop: 18 }}>Enter a valid date.</p>
      ) : kind === 'PRIVATE' ? <Private res={res} /> : (
        <div style={{ marginTop: 22 }}>
          {res.events.map(e => (
            <div key={e.key} className="figwrap" style={{ marginBottom: 18 }}>
              <div>
                <span className="lab">{e.label}</span>
                <div className="big" style={{ fontSize: 'clamp(1.8rem,6vw,2.9rem)' }}>
                  {new Date(e.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div className="figside">
                <span className="lab">{e.passed ? 'Already passed' : 'Not yet'}</span>
                <div className="r">{e.meaning}</div>
              </div>
            </div>
          ))}
          <div className="note"><b>A date is not a recommendation.</b> Being allowed to sell and it being
            a good moment to sell are different questions — the second depends on how many other flats in
            your block reach the same point at the same time.</div>
        </div>
      )}
    </>
  );
}

/**
 * Private has no waiting period, and the panel has to say so first.
 *
 * The old version asked for a "when" that does not exist and rendered an empty
 * box when it could not find one. The answer for a condo is: today, and here is
 * what today costs. The schedule underneath prices every step down, so waiting
 * becomes a number rather than a vague instruction to hold on.
 */
function Private({ res }) {
  const d = x => new Date(x).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div style={{ marginTop: 22 }}>
      <div className="figwrap" style={{ marginBottom: 18 }}>
        <div>
          <span className="lab">When you can sell</span>
          <div className="big" style={{ fontSize: 'clamp(1.8rem,6vw,2.9rem)' }}>Today</div>
        </div>
        <div className="figside">
          <span className="lab">{res.free ? 'And it costs nothing' : 'But it costs'}</span>
          <div className="r">
            {res.free
              ? 'There is no minimum holding period on private property, and you are past the SSD window. Nothing is owed on a sale.'
              : <>There is no minimum holding period on private property — you could sell a condo the
                afternoon you got the keys. What you would pay for going now is{' '}
                <b>{money(res.currentCost)}</b> in SSD, at {pc(res.currentRate)} of the sale price.
                That drops to nothing on <b>{d(res.freeFrom)}</b>.</>}
          </div>
        </div>
      </div>

      {res.schedule.length > 0 && (
        <>
          <p className="hint">
            <b>What waiting is worth.</b> The rate steps down on the anniversary of your purchase, so
            each row is a date and a bill rather than a rule.
          </p>
          <table className="bandtable">
            <thead>
              <tr>
                <th scope="col">Sell before</th><th scope="col">SSD rate</th><th scope="col">On this price</th>
              </tr>
            </thead>
            <tbody>
              {res.schedule.map(row => (
                <tr key={row.holdingYear} style={row.passed ? { opacity: 0.45 } : undefined}>
                  <th scope="row" className="mono">
                    {d(row.until)}{row.current ? ' — you are here' : row.passed ? ' — passed' : ''}
                  </th>
                  <td className="mono">{pc(row.rate)}</td>
                  <td className="mono">{money(row.cost)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="mono">{d(res.freeFrom)} onwards</th>
                <td className="mono">0%</td>
                <td className="mono">{money(0)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div className="note" style={{ marginTop: 18 }}>
        <b>Which schedule applies is decided by when you BOUGHT, not when you sell.</b> The rates
        changed on 4 July 2025 with no transition period, and this is on the{' '}
        {res.regime === '2025' ? 'post-4-July-2025 schedule — four years, starting at 16%' : 'pre-4-July-2025 schedule — three years, starting at 12%'}.
        Most calculators get this the wrong way round.
      </div>
      <div className="note">
        <b>A date is not a recommendation.</b> Waiting out an SSD band only pays if the price holds
        while you wait. That is a separate question and this tool does not answer it.
      </div>
    </div>
  );
}

function Afford() {
  const [kind, setKind] = useState('HDB');
  const [income, setIncome] = useState(9000);
  const [variable, setVariable] = useState(0);
  const [age, setAge] = useState(35);
  const [debts, setDebts] = useState(500);

  const res = useMemo(() => affordability({
    applicants: [{ fixedIncome: Number(income) || 0, variableIncome: Number(variable) || 0, age: Number(age) || 35 }],
    monthlyDebts: Number(debts) || 0,
    propertyType: kind,
  }), [kind, income, variable, age, debts]);

  return (
    <>
      {/*
        * THIS BUTTON USED TO READ "HDB or EC" AND SEND propertyType: 'HDB'.
        * It got MSR right and the tenure wrong. An EC is private property and
        * runs to 30 years, not 25, so an EC buyer was assessed over the shorter
        * term and told they could borrow about S$54,000 less than they can — on
        * a S$9,000 household, S$511,522 against S$565,545. A resale EC has the
        * opposite problem in the other direction: MSR does not apply to it at
        * all, and lumping it in with HDB applied one.
        *
        * Four buttons rather than two, because there are four answers.
        */}
      <div className="seg">
        {[['HDB', 'HDB flat'], ['EC_DEVELOPER', 'New EC'], ['EC_RESALE', 'Resale EC'], ['PRIVATE', 'Private']]
          .map(([k, label]) => (
            <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
          ))}
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        {kind === 'HDB' ? 'MSR and TDSR both apply, over 25 years.'
          : kind === 'EC_DEVELOPER' ? 'Bought from the developer, an EC is assessed on MSR as well as TDSR — over 30 years, because it is private property.'
          : kind === 'EC_RESALE' ? 'Past its MOP an EC is private for financing: TDSR only, over 30 years.'
          : 'TDSR only, over 30 years. MSR does not apply to private property.'}
      </p>
      <div className="f2">
        <div><span className="lab">Fixed monthly income</span><input type="number" value={income}
          onChange={e => setIncome(e.target.value)} min="0" step="500" /></div>
        <div><span className="lab">Variable income</span><input type="number" value={variable}
          onChange={e => setVariable(e.target.value)} min="0" step="500" /></div>
        <div><span className="lab">Age</span><input type="number" value={age}
          onChange={e => setAge(e.target.value)} min="21" max="70" /></div>
        <div><span className="lab">Other monthly commitments</span><input type="number" value={debts}
          onChange={e => setDebts(e.target.value)} min="0" step="100" /></div>
      </div>

      <div className="figwrap" style={{ marginTop: 26 }}>
        <div>
          <span className="lab">Maximum loan, assessed</span>
          <div className="big">{money(res.maxLoan)}</div>
        </div>
        <div className="figside">
          <span className="lab">Binding limit</span>
          <div className="r">
            {res.bindingConstraint} · {money(res.maxMonthlyRepayment)}/month<br />
            over {res.tenureYears} years
          </div>
        </div>
      </div>

      <div className="kpi3">
        <div><div className="v">{money(res.tdsrCapacity)}</div><span className="lab">TDSR headroom</span></div>
        <div><div className="v">{res.msrCapacity == null ? '—' : money(res.msrCapacity)}</div>
          <span className="lab">MSR headroom</span></div>
        <div><div className="v">{pc(res.assessedAtRate)}</div><span className="lab">Stress rate used</span></div>
      </div>

      <div className="note"><b>{res.note}</b> Variable income is counted at
        {' '}{pc(1 - VARIABLE_INCOME_HAIRCUT)} of its value, which is how a bank treats it. This is one
        applicant only — add a co-applicant and both the income and the age calculation change.</div>
    </>
  );
}

/* ─────────────────────────────── stamp duty ────────────────────────────── */
const PROFILES = [
  ['SC', 'Singapore Citizen'], ['SPR', 'PR'], ['FOREIGNER', 'Foreigner'], ['ENTITY', 'Entity'],
];

function Duty() {
  const [price, setPrice] = useState(1200000);
  const [profile, setProfile] = useState('SC');
  const [count, setCount] = useState(1);
  const [bought, setBought] = useState('2024-06-01');

  const amount = Number(price) || 0;
  const b = useMemo(() => bsd(amount), [amount]);
  const a = useMemo(() => { try { return absd(amount, profile, Number(count) || 1); } catch { return null; } },
    [amount, profile, count]);
  const s = useMemo(() => { const d = new Date(bought); return isNaN(d) ? null : ssd(amount, d); }, [amount, bought]);

  return (
    <>
      <div className="fld">
        <span className="lab">Price, or market value if higher</span>
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} min="0" step="10000" />
      </div>

      <div className="sh" style={{ marginTop: 24 }}><span>Buying</span><span>BSD + ABSD</span></div>
      <div className="seg" style={{ marginTop: 12 }}>
        {PROFILES.map(([k, label]) => (
          <button key={k} aria-pressed={profile === k} onClick={() => setProfile(k)}>{label}</button>
        ))}
      </div>
      {(profile === 'SC' || profile === 'SPR') && (
        <div className="fld">
          <span className="lab">Properties owned, including this one</span>
          <div className="seg" style={{ marginTop: 6 }}>
            {[1, 2, 3].map(n => (
              <button key={n} aria-pressed={Number(count) === n} onClick={() => setCount(n)}>
                {n}{n === 3 ? '+' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="figwrap" style={{ marginTop: 22 }}>
        <div>
          <span className="lab">Total stamp duty on purchase</span>
          <div className="big">{money(b.total + (a?.duty ?? 0))}</div>
        </div>
        <div className="figside">
          <span className="lab">Made up of</span>
          <div className="r">
            BSD {money(b.total)}<br />
            ABSD {a ? `${money(a.duty)} at ${pc(a.rate)}` : '—'}
          </div>
        </div>
      </div>
      {(profile === 'FOREIGNER') && (
        <div className="note"><b>Free trade agreements are not modelled here.</b> Nationals of certain
          countries are treated as citizens for ABSD. If that might be you, check with IRAS rather than
          trusting this figure.</div>
      )}

      <div className="sh" style={{ marginTop: 30 }}><span>Selling</span><span>SSD</span></div>
      <div className="fld">
        <span className="lab">Date you bought it</span>
        <input type="date" value={bought} onChange={e => setBought(e.target.value)} />
      </div>
      {s && (
        <>
          <div className="figwrap" style={{ marginTop: 20 }}>
            <div>
              <span className="lab">Seller&apos;s stamp duty if you sell today</span>
              <div className="big">{money(s.duty ?? 0)}</div>
            </div>
            <div className="figside">
              <span className="lab">Rate</span>
              <div className="r">
                {pc(s.rate)}{s.regime ? ` · ${s.regime} regime` : ''}<br />
                {s.freeAfter ? `Zero from ${new Date(s.freeAfter).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No SSD applies'}
              </div>
            </div>
          </div>
          <div className="note"><b>SSD changed on 4 July 2025.</b> Which regime applies depends on when
            you bought, not on when you sell — this uses the one in force on your purchase date.</div>
        </>
      )}
    </>
  );
}

/**
 * The repayment schedule.
 *
 * The instalment is the question people ask; the answer worth showing is what
 * it costs over the whole term and how little of the first years touches the
 * principal. Both are arithmetic nobody does in their head and everybody
 * should see once before signing for thirty years of it.
 *
 * The rate here is the OFFERED rate. TDSR is assessed at the MAS floor because
 * a bank has to know you could still pay if rates rose — that is a different
 * number for a different purpose, and the panel says so rather than letting
 * the two blur.
 */
function Mortgage() {
  const [amount, setAmount] = useState(487500);
  const [rate, setRate] = useState(2.6);
  const [years, setYears] = useState(25);
  const [extra, setExtra] = useState(0);

  const a = useMemo(
    () => amortise({ principal: Number(amount), annualRate: Number(rate) / 100, years: Number(years), extraMonthly: Number(extra) }),
    [amount, rate, years, extra]);
  const saving = useMemo(
    () => (Number(extra) > 0
      ? extraPaymentSaving({ principal: Number(amount), annualRate: Number(rate) / 100, years: Number(years), extraMonthly: Number(extra) })
      : null),
    [amount, rate, years, extra]);

  return (
    <>
      <div className="planform">
        <label><span>Loan amount</span>
          <input type="number" step="10000" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label><span>Interest rate, % a year</span>
          <input type="number" step="0.05" value={rate} onChange={e => setRate(e.target.value)} /></label>
        <label><span>Over how many years</span>
          <input type="number" step="1" value={years} onChange={e => setYears(e.target.value)} /></label>
        <label><span>Paying extra each month</span>
          <input type="number" step="100" value={extra} onChange={e => setExtra(e.target.value)} /></label>
      </div>

      {!a ? <p className="hint" style={{ marginTop: 18 }}>Enter a loan amount and a term.</p>
        : a.impossible ? (
        <div className="warn" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }}>
            At that rate the interest alone is {money(a.interestOnly)} a month, so those payments
            never reduce the balance. The loan does not amortise.
          </p>
        </div>
      ) : (
        <>
          <div className="storeygrid" style={{ marginTop: 22 }}>
            <div className="storeycard">
              <span className="filtn">Every month</span>
              <b className="statnum">{money(a.instalment)}</b>
              <p className="hint">
                {Number(extra) > 0 ? <>Plus {money(Number(extra))} extra, so {money(a.paying)} in all. </> : null}
                {Math.round(a.firstMonthInterestShare * 100)}% of the first instalment is interest.
              </p>
            </div>
            <div className="storeycard">
              <span className="filtn">Interest over the whole loan</span>
              <b className="statnum">{money(a.totalInterest)}</b>
              <p className="hint">
                {money(a.totalPaid)} paid in total against {money(Number(amount))} borrowed — you
                repay {(a.totalPaid / Number(amount)).toFixed(2)}× what you took.
              </p>
            </div>
          </div>

          {saving && saving.interestSaved > 0 && (
            <div className="note" style={{ marginTop: 18 }}>
              <b>{money(Number(extra))} more each month saves {money(saving.interestSaved)} in
              interest</b> and clears the loan {Math.round(saving.monthsSaved / 12 * 10) / 10} years
              early — {a.years} years instead of {saving.plain.years}.
            </div>
          )}

          <div className="sh" style={{ marginTop: 24 }}><span>Year by year</span></div>
          <table className="bandtable">
            <thead>
              <tr>
                <th scope="col">Year</th><th scope="col">To interest</th>
                <th scope="col">To the loan</th><th scope="col">Still owing</th>
              </tr>
            </thead>
            <tbody>
              {a.byYear.map(y => (
                <tr key={y.year}>
                  <th scope="row" className="mono">{y.year}</th>
                  <td className="mono">{money(y.interest)}</td>
                  <td className="mono">{money(y.principal)}</td>
                  <td className="mono">{money(y.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="note" style={{ marginTop: 18 }}>
            <b>This is the rate you are offered, not the rate you are assessed at.</b> A bank tests
            whether you could still service the loan at the MAS medium-term floor, which is higher —
            that is what decides how much you can borrow. What you pay each month is the figure
            above.
          </div>
        </>
      )}
    </>
  );
}
