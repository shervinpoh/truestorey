'use client';
import { useMemo, useState } from 'react';
import { affordability } from '../lib/calc/affordability.js';
import { bsd, absd, ssd, bsdBandsAsPrinted } from '../lib/calc/stampDuty.js';
import { sellTimeline } from '../lib/calc/timeline.js';
import { amortise, extraPaymentSaving } from '../lib/calc/amortise.js';
import { SOURCES, TDSR_LIMIT, MSR_LIMIT, STRESS_TEST_RATE, VARIABLE_INCOME_HAIRCUT } from '../lib/calc/constants.js';
import { f } from './fmt.js';
import { QUICK } from '../lib/nav.js';
import { toolRun } from './Track.jsx';
import Statement from './Statement.jsx';

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

export default function Tools({ ratesReviewed, asked = null }) {
  /* The tab is in the URL so one of these can be LINKED. Before this, every
     route into the quick calculators opened "When can I sell" and left the
     reader to find the one they were sent for — which meant a situation card,
     an article or a support reply could not point at the stamp-duty answer at
     all. Read once for the initial tab; written with replaceState afterwards
     so switching tabs does not push a history entry the back button then has
     to walk through. */
  /* ── THE TAB COMES FROM THE SERVER ─────────────────────────────────────
     It was read here with useSearchParams, which on a static route forces a
     Suspense boundary and makes the FALLBACK the server HTML. /tools?calc=duty
     and /tools?calc=sell were byte-identical to /tools before hydration, so
     the promise a few lines above — "send someone straight to the stamp duty
     answer rather than to this page" — was not kept for anyone whose
     JavaScript had not run, nor for a crawler that does not run it at all. */
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
        {tab === 'loan' ? <>Source: your loan amount, rate, term and extra payment. Monthly amortisation,
          with the same rate throughout the term. Figures rounded to the nearest dollar.</>
          : <RatesSources ratesReviewed={ratesReviewed} />}
      </p>
    </>
  );
}

/** The rates and sources line, shared with the pages that carry one of these
 *  calculators on its own — one wording, so the two cannot drift. */
export function RatesSources({ ratesReviewed }) {
  return (<>
    Rates last reviewed {ratesReviewed}. TDSR {pc(TDSR_LIMIT)} · MSR {pc(MSR_LIMIT)} ·
    stress rate {pc(STRESS_TEST_RATE)}.<br />
    {SOURCES.bsd.name} (effective {SOURCES.bsd.effective}) · {SOURCES.absd.name} (effective {SOURCES.absd.effective}) ·
    {' '}{SOURCES.ssd.name} (effective {SOURCES.ssd.effective}).<br />
    These are calculations against published rates, not advice, and not a substitute for IRAS or your banker.
  </>);
}

/* ───────────────────────────── when can I sell ─────────────────────────── */
/* Exported for /when-can-i-sell, which gives this its own page. */
export function Sell() {
  const [kind, setKind] = useState('HDB');
  const [mopYears, setMopYears] = useState(5);
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
        mopYears,
      });
    } catch { return null; }
  }, [kind, date, price, mopYears]);

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
        {/* A <label>, not a sibling <span>. The text was visible and read
             like a label, but nothing associated it with the field, so a
             screen reader announced a bare date picker. Wrapping is enough —
             no id needed — and clicking the words now focuses the input. */}
        <label>
          <span className="lab" style={{ display: 'block', marginBottom: 6 }}>
            {kind === 'HDB' ? 'Legal completion date' : 'Acquisition date — usually OTP acceptance'}
          </span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        {kind === 'HDB' && (
          <p className="hint" style={{ marginTop: 8 }}>
            Use the completion date recorded by HDB, rather than the booking or application date.
          </p>
        )}
      </div>

      {kind === 'HDB' && <div className="fld" style={{ marginTop: 14 }}>
        <span className="lab">Which HDB classification or scheme?</span>
        <div className="seg" style={{ marginTop: 6 }}>
          {[[5, 'Unclassified / Standard'], [10, 'Plus / Prime'], [20, 'Fresh Start']].map(([years, label]) =>
            <button key={years} aria-pressed={mopYears === years} onClick={() => setMopYears(years)}>{label}</button>)}
        </div>
      </div>}

      {kind === 'PRIVATE' && (
        <div className="fld" style={{ marginTop: 14 }}>
          <label>
            <span className="lab" style={{ display: 'block', marginBottom: 6 }}>What you would sell for</span>
            <input type="number" step="50000" value={price} onChange={e => setPrice(e.target.value)} />
          </label>
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
          <dl className="resultguide" aria-label="Understand the HDB selling date">
            <div><dt>What changed it</dt><dd>The selected <b>{res.mopYears}-year MOP</b> is counted from the legal
              completion date you entered.</dd></div>
            <div><dt>What this cannot know</dt><dd>HDB excludes periods when you did not physically occupy the flat.
              SERS and ownership changes can follow different rules, so HDB’s recorded date is definitive.</dd></div>
            <div className="resultnext"><dt>Next useful step</dt><dd>
              <a href="https://www.hdb.gov.sg/managing-my-home/selling-a-flat/eligibility">Check HDB’s recorded MOP in My Flat →</a>
            </dd></div>
          </dl>
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
          <span className="lab">{res.free ? 'No seller’s stamp duty' : 'Seller’s stamp duty today'}</span>
          <div className="r">
            {res.free
              ? 'You are past the SSD window, so this calculation shows no seller’s stamp duty. Loan repayment, CPF refunds and selling fees still need to be accounted for.'
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
      <dl className="resultguide" aria-label="Understand the private-property selling date">
        <div><dt>What changed it</dt><dd>The acquisition date selects the three- or four-year SSD schedule.
          The price you entered turns today’s rate into a dollar amount.</dd></div>
        <div><dt>What this cannot know</dt><dd>IRAS generally uses the accepted OTP or sale agreement date,
          and the higher of sale price or market value. Exemptions, remissions and part-shares need separate checking.</dd></div>
        <div className="resultnext"><dt>Next useful step</dt><dd>
          <a href="/cost">See what the sale must clear beyond SSD →</a>
        </dd></div>
      </dl>
    </div>
  );
}

function Afford() {
  const [kind, setKind] = useState('HDB');
  const [income, setIncome] = useState(9000);
  const [variable, setVariable] = useState(0);
  const [age, setAge] = useState(35);
  const [debts, setDebts] = useState(500);
  const valid = [income, variable, age, debts].every(v => String(v).trim() !== '' && Number.isFinite(Number(v)))
    && Number(income) >= 0 && Number(variable) >= 0 && Number(debts) >= 0
    && Number(age) >= 21 && Number(age) <= 70;

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
        {kind === 'HDB' || kind === 'EC_DEVELOPER'
          ? 'Both the housing repayment limit (MSR) and total debt limit (TDSR) apply.'
          : 'The total debt limit (TDSR) applies; the housing repayment limit (MSR) does not.'}
        {' '}The assessed term depends on your age and property type.
      </p>
      <div className="f2">
        <label><span className="lab">Fixed monthly income</span><input type="number" value={income}
          onChange={e => setIncome(e.target.value)} min="0" step="500" /></label>
        <label><span className="lab">Average variable income per month</span><input type="number" value={variable}
          onChange={e => setVariable(e.target.value)} min="0" step="500" /></label>
        <label><span className="lab">Age</span><input type="number" value={age}
          onChange={e => setAge(e.target.value)} min="21" max="70" /></label>
        <label><span className="lab">Other monthly commitments</span><input type="number" value={debts}
          onChange={e => setDebts(e.target.value)} min="0" step="100" /></label>
      </div>

      {!valid ? <p className="hint" role="status">Fill every field with a non-negative amount and an age from 21 to 70.
        Enter 0 if you have no variable income or other commitments.</p> : <>
      <div className="figwrap" style={{ marginTop: 26 }}>
        <div>
          <span className="lab">Loan ceiling from income alone</span>
          <div className="big">{money(res.maxLoan)}</div>
        </div>
        <div className="figside">
          <span className="lab">What limits the loan</span>
          <div className="r">
            {res.bindingConstraint === 'MSR' ? 'Housing repayment limit (MSR)' : 'Total debt limit (TDSR)'}<br />
            {money(Math.max(0, res.maxMonthlyRepayment))}/month available for this loan<br />
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

      <dl className="resultguide" aria-label="Understand your borrowing estimate">
        <div><dt>What went into the answer</dt><dd>The assessment counts <b>{money(res.totalIncomeCounted)} a month</b>:
          fixed income plus {pc(1 - VARIABLE_INCOME_HAIRCUT)} of variable income. It tests repayments at{' '}
          {pc(res.assessedAtRate)} over {res.tenureYears} years.
          {res.tdsrCapacity < 0 && <> Your other commitments already exceed the modelled total-debt allowance
            by {money(-res.tdsrCapacity)} a month.</>}</dd></div>
        <div><dt>What still needs checking</dt><dd>This is for one applicant. The purchase price, loan-to-value limit,
          existing housing loans, available cash and CPF, and lender assessment can reduce what you can borrow.</dd></div>
        <div className="resultnext"><dt>Next useful step</dt><dd><a href="/plan">Work out the purchase budget and upfront funds →</a></dd></div>
      </dl>
      </>}
    </>
  );
}

/* ─────────────────────────────── stamp duty ────────────────────────────── */
const PROFILES = [
  ['SC', 'Singapore Citizen'], ['SPR', 'PR'], ['FOREIGNER', 'Foreigner'], ['ENTITY', 'Entity'],
];

/* Exported for /stamp-duty, which gives this its own page. */
export function Duty() {
  const [price, setPrice] = useState(1200000);
  const [profile, setProfile] = useState('SC');
  const [count, setCount] = useState(1);
  const [bought, setBought] = useState('2024-06-01');
  const validPrice = String(price).trim() !== '' && Number.isFinite(Number(price)) && Number(price) > 0;

  const amount = Number(price) || 0;
  const b = useMemo(() => bsd(amount), [amount]);
  const a = useMemo(() => { try { return absd(amount, profile, Number(count) || 1); } catch { return null; } },
    [amount, profile, count]);
  const s = useMemo(() => { const d = new Date(bought); return isNaN(d) ? null : ssd(amount, d); }, [amount, bought]);

  return (
    <>
      <div className="fld">
        <label>
          <span className="lab">Price, or market value if higher</span>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} min="0" step="10000" />
        </label>
      </div>

      {!validPrice && <p className="hint" role="status">Enter a price above zero to calculate stamp duty.</p>}
      <h2 className="sh" style={{ marginTop: 24 }}><span>Buying</span><span>BSD + ABSD</span></h2>
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
          {/* ── .total, NOT .duty ─────────────────────────────────────────
              This read `a?.duty ?? 0` and `money(a.duty)` for months, and the
              total on this page was BSD alone. A foreigner buying at S$1.2m was
              told S$32,600 against a real S$752,600 — understated by S$720,000,
              on a figure published under a CEA registration.

              It is an easy mistake to make and a hard one to see: bsd() returns
              bands where each band DOES carry `.duty`, so `.duty` looks like the
              house convention, while absd() and ssd() return `.total`. Then two
              things hid it. `?? 0` turned the undefined into a silent zero, and
              money() renders a non-finite number as an em dash — so the page
              read "ABSD — at 60%", which looks exactly like a deliberate
              statement that no ABSD applies.

              test/tools-duty.test.js now checks every property this component
              reads off bsd(), absd() and ssd() against the real return values,
              so a rename in either direction goes red instead of quiet. */}
          <span className="lab">Total stamp duty on purchase</span>
          <div className="big">{validPrice && a ? money(b.total + a.total) : '—'}</div>
        </div>
        <div className="figside">
          <span className="lab">Made up of</span>
          <div className="r">
            BSD {validPrice ? money(b.total) : '—'}<br />
            ABSD {validPrice && a ? `${money(a.total)} at ${pc(a.rate)}` : '—'}
          </div>
        </div>
      </div>
      {/* Band by band, as the menu and this page's title promise. The
          headline total above had nothing under it, so "band by band" was a
          claim the tool did not show. */}
      {validPrice && a && b.bands?.length > 0 && (
        <Statement id="duty-bands" title={`Stamp duty on ${money(amount)}`} basis="IRAS rates in force · band by band">
          <div className="tablewrap">
            <table className="stmt-rows">
              <tbody>
                <tr><th colSpan={2} scope="colgroup">Buyer&rsquo;s Stamp Duty</th></tr>
                {bsdBandsAsPrinted(b).map((x, i) => (
                  <tr key={x.from}><td>{pc(x.rate)} on the {i === 0 ? 'first' : 'next'} {money(x.to - x.from)}</td>
                    <td className="r">{money(x.duty)}</td></tr>
                ))}
                <tr className="stmt-sub"><td>Buyer&rsquo;s Stamp Duty</td><td className="r">{money(b.total)}</td></tr>
                <tr><th colSpan={2} scope="colgroup">Additional Buyer&rsquo;s Stamp Duty</th></tr>
                <tr><td>{pc(a.rate)} of the whole price<span className="q">at this buyer profile and property count</span></td>
                  <td className="r">{money(a.total)}</td></tr>
                <tr className="stmt-total"><td>Stamp duty to pay</td><td className="r">{money(b.total + a.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </Statement>
      )}
      {(profile === 'FOREIGNER') && (
        <div className="note"><b>Free trade agreements are not modelled here.</b> Nationals of certain
          countries are treated as citizens for ABSD. If that might be you, check with IRAS rather than
          trusting this figure.</div>
      )}

      <h2 className="sh" style={{ marginTop: 30 }}><span>Selling</span><span>SSD</span></h2>
      <div className="fld">
        <label>
          <span className="lab">Date you bought it</span>
          <input type="date" value={bought} onChange={e => setBought(e.target.value)} />
        </label>
      </div>
      {s && validPrice && (
        <>
          <div className="figwrap" style={{ marginTop: 20 }}>
            <div>
              <span className="lab">Seller&apos;s stamp duty if you sell today</span>
              {/* .total, same bug as the purchase figure above: this read
                  s.duty and printed S$0 for every seller. A flat bought on
                  1 Jun 2024 and sold today sits in the legacy regime's 4% band
                  — S$48,000 on S$1.2m, shown as nothing. */}
              <div className="big">{money(s.total)}</div>
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
      <dl className="resultguide" aria-label="Understand the stamp-duty result">
        <div><dt>What changed it</dt><dd>The higher of price or market value sets the base. Buyer profile and
          property count set ABSD; acquisition date selects the SSD schedule.</dd></div>
        <div><dt>What this cannot know</dt><dd>FTA treatment, remission eligibility, exemptions, part-shares or
          whether IRAS will use a higher market value. Those can materially change the bill.</dd></div>
        <div className="resultnext"><dt>Next useful step</dt><dd>
          <a href="/plan">Put the duties inside the full purchase budget →</a>
        </dd></div>
      </dl>
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
  const valid = [amount, rate, years, extra].every(v => String(v).trim() !== '' && Number.isFinite(Number(v)))
    && Number(amount) > 0 && Number(rate) >= 0 && Number(years) >= 1 && Number(years) <= 40
    && Number.isInteger(Number(years)) && Number(extra) >= 0;

  const a = useMemo(
    () => valid ? amortise({ principal: Number(amount), annualRate: Number(rate) / 100, years: Number(years), extraMonthly: Number(extra) }) : null,
    [amount, rate, years, extra, valid]);
  const saving = useMemo(
    () => (valid && Number(extra) > 0
      ? extraPaymentSaving({ principal: Number(amount), annualRate: Number(rate) / 100, years: Number(years), extraMonthly: Number(extra) })
      : null),
    [amount, rate, years, extra, valid]);
  const higherRate = useMemo(() => valid ? amortise({ principal: Number(amount),
    annualRate: (Number(rate) + 1) / 100, years: Number(years) }) : null,
  [amount, rate, years, valid]);

  return (
    <>
      <div className="planform">
        <label><span>Loan amount</span>
          <input type="number" min="1" step="any" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label><span>Interest rate, % a year</span>
          <input type="number" min="0" step="any" value={rate} onChange={e => setRate(e.target.value)} /></label>
        <label><span>Over how many years</span>
          <input type="number" min="1" max="40" step="1" value={years} onChange={e => setYears(e.target.value)} /></label>
        <label><span>Paying extra each month</span>
          <input type="number" min="0" step="any" value={extra} onChange={e => setExtra(e.target.value)} /></label>
      </div>

      {!a ? <p className="hint" role="status" style={{ marginTop: 18 }}>Enter a positive loan amount, a term of 1–40 whole years,
        and a rate and extra payment of zero or more. Fill every field; enter 0 if you are not paying extra.</p>
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
              <span className="filtn">{Number(extra) > 0 ? 'Monthly payment, including extra' : 'Monthly repayment'}</span>
              <b className="statnum">{money(a.paying)}</b>
              <p className="hint">
                {Number(extra) > 0 ? <>{money(a.instalment)} scheduled + {money(Number(extra))} extra. </> : null}
                {Math.round(a.firstMonthInterestShare * 100)}% of your first payment goes to interest.
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

          <dl className="resultguide" aria-label="Understand your repayment">
            <div><dt>If the rate were one percentage point higher</dt>
              <dd>At <b>{(Number(rate) + 1).toFixed(2)}% a year</b>, the scheduled payment would be{' '}
                <b>{money(higherRate?.instalment)} a month</b> — {money((higherRate?.instalment ?? 0) - a.instalment)} more,
                before optional extra payments. This compares the same loan and term at two constant rates.</dd></div>
            <div><dt>What the calculation assumes</dt><dd>The rate stays at {Number(rate)}% for the full term.
              Extra payments reduce the balance each month. Repricing, fees and prepayment charges are excluded;
              check your loan package before relying on the saving.</dd></div>
            <div className="resultnext"><dt>Next useful step</dt><dd>
              <a href="/plan">Check the loan against your income and purchase budget →</a>
            </dd></div>
          </dl>

          <details style={{ marginTop: 24 }}>
          <summary>See the year-by-year repayment schedule</summary>
          <p className="hint">Interest, principal repaid and the balance at each year end. Amounts are rounded for display.</p>
          <div style={{ overflowX: 'auto' }} role="region" aria-label="Year-by-year repayment schedule" tabIndex={0}>
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
          </div>
          </details>
        </>
      )}
    </>
  );
}
