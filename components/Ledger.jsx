'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MoneyInput from './MoneyInput.jsx';
import { Figure } from './Motion.jsx';
import { f, num } from './fmt.js';
import { titleCase } from '../lib/name.js';
import { ledger } from '../lib/calc/ledger.js';

/**
 * What owning it costs, before it does anything.
 *
 * Everything on this page is arithmetic on figures the reader supplies and
 * rates that are published — IRAS for the duties, CPF for the Ordinary Account
 * rate, the reader's own quoted mortgage rate. Nothing here reads a market, so
 * nothing here is a valuation: the two headline figures are what a SALE MUST
 * CLEAR to return the reader's own money, which is a fact about their bank
 * statement and not an opinion about their home.
 *
 * That distinction is the whole reason this page is allowed to exist, so it is
 * written on the page in those words and not left to be inferred.
 *
 * THE LOAN IS DERIVED, NOT ASKED FOR. Price less what you put down IS the
 * loan; asking for all three lets a reader enter a set that cannot be true and
 * then quietly answering the wrong question. The implied LTV is shown back so
 * a figure above the ceiling is visible rather than silently financed.
 */

const TYPES = [
  ['HDB', 'HDB flat'],
  ['EC_DEVELOPER', 'EC from developer'],
  ['EC_RESALE', 'EC resale'],
  ['PRIVATE', 'Private'],
];

export default function Ledger() {
  const [price, setPrice] = useState(1_600_000);
  const [bought, setBought] = useState('2021-06');
  const [type, setType] = useState('PRIVATE');
  const [profile, setProfile] = useState('SC');
  const [owned, setOwned] = useState(1);
  const [cashDown, setCashDown] = useState(200_000);
  const [cpfDown, setCpfDown] = useState(200_000);
  const [cpfMonthly, setCpfMonthly] = useState(2_500);
  const [rate, setRate] = useState(3.6);
  const [tenure, setTenure] = useState(30);
  const [held, setHeld] = useState(5);
  const [agent, setAgent] = useState(2);

  /* Which home, so the ledger can read a filed rent for it. Optional: every
     figure below works without it, and the omissions list says what is missing
     while it is unset rather than quietly leaving a gap. */
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(null);
  const [beds, setBeds] = useState('');
  const [market, setMarket] = useState(null);
  const [lookup, setLookup] = useState('idle');
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (picked || term.length < 3) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=6`, { signal: ctl.signal });
        const j = await r.json();
        setHits(j.hits || j.results || []);
      } catch { /* a failed lookup leaves the ledger exactly as it was */ }
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, picked]);

  useEffect(() => {
    if (!picked) { setMarket(null); setLookup('idle'); return; }
    const mine = ++seq.current;
    setLookup('loading');
    fetch(`/api/rent?href=${encodeURIComponent(picked.href)}${beds ? `&beds=${beds}` : ''}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('no rent'))))
      .then(j => { if (mine === seq.current) { setMarket(j); setLookup('done'); } })
      .catch(() => { if (mine === seq.current) { setMarket(null); setLookup('failed'); } });
  }, [picked, beds]);

  const p = Number(price) || 0;
  const loan = Math.max(0, p - (Number(cashDown) || 0) - (Number(cpfDown) || 0));
  const ltv = p > 0 ? loan / p : 0;

  const r = useMemo(() => ledger({
    price: p,
    purchaseDate: `${bought}-01`,
    propertyType: type,
    buyerProfile: profile,
    propertyCount: Number(owned) || 1,
    loan,
    loanRate: (Number(rate) || 0) / 100,
    loanYears: Number(tenure) || 25,
    cashDown: Number(cashDown) || 0,
    cpfDown: Number(cpfDown) || 0,
    cpfMonthly: Number(cpfMonthly) || 0,
    yearsHeld: Number(held) || 0,
    agentFeePct: Number(agent) || 0,
    monthlyRent: market?.rent?.median ?? null,
  }), [p, bought, type, profile, owned, loan, rate, tenure, cashDown, cpfDown, cpfMonthly, held, agent,
       market?.rent?.median]);

  const clear = r.breakEven.returnOfCash;
  const cpfBack = r.cpfReturns;
  // Against what was paid — a comparison with the reader's OWN purchase price,
  // not with any estimate of what the property is worth now.
  const overPaid = clear && p ? clear / p - 1 : null;

  // Why the SSD row says what it says. A zero because you held long enough and
  // a zero because the duty never applied are different facts, and a reader
  // deciding when to sell needs to know which one they are looking at.
  const years = r.exit.ssd.regime === '2025' ? 'four' : 'three';
  const ssdLabel = !r.exit.ssd.regime
    ? ' — an HDB flat or EC from the developer is bound by MOP instead'
    : r.exit.ssd.rate
      ? ` — the ${years}-year schedule, in year ${Math.ceil(r.yearsHeld)}`
      : ` — held past the ${years}-year schedule`;

  return (
    <>
      <div className="planlayout">
        <div className="planinputs">
          <fieldset className="plangroup">
            <legend className="lab">The purchase</legend>
            <div className="planform">
              <label className="wide2"><span>Price paid</span>
                <MoneyInput value={price} onChange={setPrice} slider
                  min={200_000} max={8_000_000} step={25_000} /></label>
              <label><span>Bought</span>
                <input type="month" value={bought} max="2036-12"
                  onChange={e => setBought(e.target.value)} /></label>
              <label><span>Property</span>
                <select value={type} onChange={e => setType(e.target.value)}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></label>
              <label><span>Buyer profile</span>
                <select value={profile} onChange={e => setProfile(e.target.value)}>
                  <option value="SC">Singapore Citizen</option>
                  <option value="SPR">Permanent Resident</option>
                  <option value="FOREIGNER">Foreigner</option>
                </select></label>
              <label><span>Properties owned</span>
                <select value={owned} onChange={e => setOwned(Number(e.target.value))}>
                  <option value={1}>This is my only one</option>
                  <option value={2}>My second</option>
                  <option value={3}>My third or more</option>
                </select></label>
            </div>
            {/* The month matters, not just the year: the SSD schedule changed
                on 4 Jul 2025 and it is chosen by PURCHASE date. */}
            <p className="hint" style={{ margin: '8px 0 0' }}>
              The month is used to pick the Seller&rsquo;s Stamp Duty schedule, which changed on
              4 July 2025 and is selected by when you <em>bought</em>, not when you sell.
            </p>
          </fieldset>

          <fieldset className="plangroup">
            <legend className="lab">What you put in</legend>
            <div className="planform">
              <label><span>Cash down</span>
                <MoneyInput value={cashDown} onChange={setCashDown} /></label>
              <label><span>CPF down</span>
                <MoneyInput value={cpfDown} onChange={setCpfDown} /></label>
              <label><span>CPF per month</span>
                <MoneyInput value={cpfMonthly} onChange={setCpfMonthly} /></label>
              <label><span>Interest rate, %</span>
                <input type="number" step="0.05" min="0" max="10" value={rate}
                  onChange={e => setRate(e.target.value)} /></label>
              <label><span>Tenure, years</span>
                <input type="number" step="1" min="5" max="35" value={tenure}
                  onChange={e => setTenure(e.target.value)} /></label>
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              The loan is what is left: <b className="mono">{f(loan)}</b>, or{' '}
              <b className="mono">{(ltv * 100).toFixed(0)}%</b> of the price.
              {ltv > 0.75 && <> That is above the 75% ceiling for a first housing loan — the
                figures below still compute it, but a bank would not lend it.</>}
              {' '}CPF per month is the part of the instalment your Ordinary Account pays; the rest
              comes out of your pocket and is counted as cash.
            </p>
            {/* A control must not use a different number from the one typed
                into it. The excess is real money — it just never enters the
                property, so it is not in this ledger. */}
            {r.cpfEntry.clamped && (
              <p className="hint warnline" style={{ margin: '8px 0 0' }}>
                The instalment is only <b className="mono">{f(r.holding.instalment)}</b>, so that is
                all your CPF can pay towards it. The remaining{' '}
                <b className="mono">{f(r.cpfEntry.wanted - r.cpfEntry.used)}</b> a month stays in
                your Ordinary Account earning the same {(r.cpf.rate * 100).toFixed(1)}% — it never
                goes into the property, so it is not counted below.
              </p>
            )}
          </fieldset>

          <fieldset className="plangroup">
            <legend className="lab">Selling</legend>
            <div className="planform">
              <label className="wide2"><span>Held for {num(held)} year{held === 1 ? '' : 's'}</span>
                <input type="range" min="1" max="30" step="1" value={held}
                  onChange={e => setHeld(Number(e.target.value))} /></label>
              <label><span>Agent fee, %</span>
                <input type="number" step="0.25" min="0" max="5" value={agent}
                  onChange={e => setAgent(e.target.value)} /></label>
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Commission is a matter between you and your agent — nobody publishes a rate, so this
              is your figure and not a market average. GST at {(r.exit.gstRate * 100).toFixed(0)}% is
              added to it.
            </p>
            {r.holding.repaidInYear && (
              <p className="hint warnline" style={{ margin: '8px 0 0' }}>
                The loan is repaid in year <b className="mono">{r.holding.repaidInYear}</b>, so
                nothing more goes in after that. The CPF you had already used stays used, and its
                accrued interest keeps running until the day you sell — which is why that figure
                carries on climbing while the principal does not.
              </p>
            )}
          </fieldset>

          <fieldset className="plangroup">
            <legend className="lab">Which home (optional)</legend>
            {picked ? (
              <div className="mapfocus" style={{ marginTop: 0 }}>
                <b>{titleCase(picked.label)}</b>
                <span className="mono">
                  {market?.n ? `${num(market.n)} filed sales` : 'looking up…'}
                  {market?.medianPsf ? ` · median S$${num(market.medianPsf)} psf` : ''}
                </span>
                <button type="button" className="linkish" style={{ marginLeft: 'auto' }}
                  onClick={() => { setPicked(null); setQ(''); setMarket(null); }}>Change</button>
              </div>
            ) : (
              <>
                <div className="planform">
                  <label className="wide2"><span>Name the project or block</span>
                    <input value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
                      placeholder="Normanton Park, or Blk 275A Bishan St 24" /></label>
                </div>
                {hits.length > 0 && (
                  <ul className="idx" style={{ marginTop: 8 }}>
                    {hits.map(h => (
                      <li key={h.href}>
                        <button type="button" className="pickrow"
                          onClick={() => { setPicked(h); setHits([]); setQ(''); }}>
                          <span className="n">{titleCase(h.label)}</span>
                          <span className="s mono">{h.sub}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {picked && (
              <div className="planform" style={{ marginTop: 10 }}>
                <label><span>Bedrooms</span>
                  <select value={beds} onChange={e => setBeds(e.target.value)}>
                    <option value="">Any size</option>
                    {['1', '2', '3', '4', '5'].map(b => <option key={b} value={b}>{b} bedroom{b === '1' ? '' : 's'}</option>)}
                  </select></label>
              </div>
            )}
            {/* The whole ledger works without this. Saying so stops it reading
                as a required field somebody has to satisfy before an answer. */}
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Every figure below works without this. Name a home and the ledger also reads what
              places like it actually let for, from filed tenancy contracts — which is the one
              number a cost of ownership is meaningless without.
              {lookup === 'failed' && <> That lookup failed; the rest of the page is unaffected.</>}
              {lookup === 'done' && !market?.rent && <> No filed tenancy contract cohort was found
                for this one, so the rent comparison stays off.</>}
            </p>
          </fieldset>
        </div>

        <aside className="plansummary" aria-label="What a sale must clear">
          <div className="plansumin">
            <div className="plansumfig">
              <span className="lab">A sale must clear</span>
              <Figure value={clear} format={f} />
              <p className="hint">
                to return every dollar of cash you have put in — after settling the loan
                {cpfBack ? ', refunding CPF with its interest,' : ''} and paying the commission and
                legal fees{r.exit.ssd.rate ? ', and Seller’s Stamp Duty' : ''}.
                {overPaid !== null && <> That is <b>{(overPaid * 100).toFixed(1)}%</b> above what
                  you paid.</>}
              </p>
            </div>
            {/* Only when CPF was actually used. This slot used to grow the
                reader's CASH at the Ordinary Account rate and call it a
                benchmark — but cash outside CPF cannot earn that rate, and a
                purchase with no CPF at all still got the figure. What is true
                is that the refund goes to the ACCOUNT, not to the seller. */}
            {cpfBack && (
              <div className="plansumfig">
                <span className="lab">Goes back to CPF, not to you</span>
                <Figure value={cpfBack.total} format={f} />
                <p className="hint">
                  {f(cpfBack.principal)} you took out, plus{' '}
                  <b className="mono">{f(cpfBack.interest)}</b> of accrued interest —{' '}
                  {(cpfBack.interestShare * 100).toFixed(0)}% of the refund is money you never
                  had. It returns to your Ordinary Account at completion, so it is not part of
                  what you walk away with.
                </p>
              </div>
            )}
            <div className="plansumrows">
              <div><span>Gone for good</span><b className="mono">{f(r.friction)}</b></div>
              <div><span>CPF to refund</span><b className="mono">{f(r.cpf.total)}</b></div>
              <div><span>Loan still owing</span><b className="mono">{f(r.holding.outstanding)}</b></div>
            </div>
          </div>
        </aside>
      </div>

      {r.renting && (
        <>
          <div className="sh" style={{ marginTop: 26 }}><span>Against renting the same thing</span></div>
          <div className="rentcmp">
            <div>
              <span className="lab">Gone for good, owning</span>
              <b className="mono">{f(r.renting.friction)}</b>
              <span className="hint">Duties, interest and fees. Not the loan principal or the CPF
                refund — those are still yours, in another form.</span>
            </div>
            <div>
              <span className="lab">Rent over the same {num(r.yearsHeld)} year{r.yearsHeld === 1 ? '' : 's'}</span>
              <b className="mono">{f(r.renting.paid)}</b>
              <span className="hint">
                {f(r.renting.monthlyRent)} a month
                {market?.rent && <> — the median of {num(market.rent.n)} filed{' '}
                  {market.rent.beds ? `${market.rent.beds}-bedroom ` : ''}tenancy contracts
                  {market.rent.basis === 'district' ? ` across District ${market.rent.district}` : ' here'}</>}
                , held flat.
              </span>
            </div>
            <div className={r.renting.difference > 0 ? 'diff over' : 'diff under'}>
              <span className="lab">{r.renting.difference > 0 ? 'Owning cost more' : 'Owning cost less'}</span>
              <b className="mono">{f(Math.abs(r.renting.difference))}</b>
              <span className="hint">
                Before any change in what the home is worth, which this page does not estimate.
              </span>
            </div>
          </div>
          {market?.rent && (
            <p className="prov">
              {market.rent.source} · {market.rent.n} contracts, {market.rent.from} to {market.rent.to} ·
              {' '}{market.rent.basis === 'project' ? 'filed at this project' : `District ${market.rent.district}, all projects`} ·
              {' '}floor area {num(market.rent.areaFromSqm)}–{num(market.rent.areaToSqm)} sqm ·
              {' '}median monthly rent, not a projection
            </p>
          )}
        </>
      )}

      <div className="sh" style={{ marginTop: 26 }}><span>The ledger</span></div>

      <div className="tablewrap">
        <table className="ledgertable">
          <tbody>
            <tr className="grp"><th colSpan={2} scope="colgroup">Gone for good — no sale returns these</th></tr>
            <tr><td>Buyer&rsquo;s Stamp Duty</td><td className="r mono">{f(r.entry.bsd)}</td></tr>
            {r.entry.absd > 0 && (
              <tr><td>Additional Buyer&rsquo;s Stamp Duty, {(r.entry.absdRate * 100).toFixed(0)}%</td>
                <td className="r mono">{f(r.entry.absd)}</td></tr>)}
            <tr><td>Legal fees on purchase</td><td className="r mono">{f(r.entry.legal)}</td></tr>
            <tr><td>Interest paid to the bank over {num(r.yearsHeld)} year{r.yearsHeld === 1 ? '' : 's'}</td>
              <td className="r mono">{f(r.holding.interestPaid)}</td></tr>
            <tr><td>Legal fees on sale</td><td className="r mono">{f(r.exit.legal)}</td></tr>
            <tr className="sub"><td>Subtotal, before commission</td><td className="r mono">{f(r.friction)}</td></tr>

            <tr className="grp"><th colSpan={2} scope="colgroup">Charged on the sale price, so it depends on what you get</th></tr>
            <tr><td>Agent commission at {r.exit.agentFeePct}% plus GST</td>
              <td className="r mono">{(r.exit.agentRate * 100).toFixed(2)}%</td></tr>
            <tr><td>Seller&rsquo;s Stamp Duty{ssdLabel}</td>
              <td className="r mono">{r.exit.ssd.rate
                ? `${(r.exit.ssd.rate * 100).toFixed(0)}%`
                : (r.exit.ssd.regime ? 'None' : 'Not applicable')}</td></tr>

            <tr className="grp"><th colSpan={2} scope="colgroup">Comes back, but to CPF and not to you</th></tr>
            <tr><td>CPF principal used{r.cpfEntry.used
              ? ` — ${f(r.cpfEntry.used)} a month while the loan ran` : ''}</td>
              <td className="r mono">{f(r.cpf.principal)}</td></tr>
            <tr><td>Accrued interest at {(r.cpf.rate * 100).toFixed(1)}%</td>
              <td className="r mono">{f(r.cpf.interest)}</td></tr>
            <tr className="sub"><td>Refunded to your Ordinary Account</td><td className="r mono">{f(r.cpf.total)}</td></tr>

            <tr className="grp"><th colSpan={2} scope="colgroup">Still owed</th></tr>
            <tr><td>Outstanding loan after {num(r.yearsHeld)} year{r.yearsHeld === 1 ? '' : 's'}</td>
              <td className="r mono">{f(r.holding.outstanding)}</td></tr>
            <tr><td>Monthly instalment — {f(r.cash.perMonth)} of it cash
              {r.holding.repaidInYear ? `, paid for ${r.holding.loanMonths / 12} years` : ''}</td>
              <td className="r mono">{f(r.holding.instalment)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="note">
        <b>This is not a valuation.</b> Every figure above comes from what you typed and from
        published rates. Nothing here reads the market, so nothing here is an opinion about what
        your home is worth or what it will fetch — only about what it has cost you to hold. What a
        sale would actually realise is a separate question, and{' '}
        <Link href="/condo">the filed transaction ranges</Link> are the evidence for it.
      </div>

      <div className="note" style={{ marginTop: 20 }}>
        <b>What is not in this ledger.</b>
        <ul className="bul">{r.omissions.map(o => <li key={o.slice(0, 24)}>{o}</li>)}</ul>
        <p style={{ margin: '10px 0 0' }}>
          URA&rsquo;s filed rental contracts are on <Link href="/yield">the rental yield page</Link> if
          you want to put a real number to the first of those.
        </p>
      </div>

      <div className="note" style={{ marginTop: 20 }}>
        <b>The rules being applied.</b>
        <ul className="bul">{r.caveats.map(c => <li key={c.slice(0, 24)}>{c}</li>)}</ul>
      </div>

      <p className="prov" style={{ marginTop: 22 }}>
        {r.sources.map(s => `${s.name} (effective ${s.effective})`).join(' · ')}
        {' · '}CPF refund rule:{' '}
        <a href="https://www.cpf.gov.sg/service/article/how-much-do-i-need-to-refund-to-my-cpf-account-if-i-am-selling-my-whole-property"
           target="_blank" rel="noopener noreferrer">CPF Board</a>
        {' · '}nothing on this page is saved or sent anywhere.
      </p>

      <div className="sh" style={{ marginTop: 26 }}><span>The rest of it</span></div>
      <ul className="idx">
        <li><Link href="/plan"><span className="n">Whether you clear the loan at all</span><span className="s">TDSR, MSR, the LTV ceiling and both stamp duties</span></Link></li>
        <li><Link href="/progressive"><span className="n">Paying for one still being built</span><span className="s">The statutory ladder, and what the instalment climbs to</span></Link></li>
        <li><Link href="/guides/absd-tdsr-ssd"><span className="n">The guide behind these rates</span><span className="s">What each duty is, and when it bites</span></Link></li>
      </ul>
    </>
  );
}
