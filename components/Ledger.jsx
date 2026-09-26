'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import HowWorked from './HowWorked.jsx';
import Statement from './Statement.jsx';
import MoneyInput from './MoneyInput.jsx';
import { Figure } from './Motion.jsx';
import { f, num } from './fmt.js';
import { titleCase } from '../lib/name.js';
import { costLedger } from '../lib/report/cost.js';
import { saleStatement } from '../lib/calc/ledger.js';
import Downside from './Downside.jsx';
import Scenarios from './Scenarios.jsx';
import ShareResult, { OpenedFromLink } from './ShareResult.jsx';
import EmailReport from './EmailReport.jsx';
import ResultBridge from './ResultBridge.jsx';
import useShareLink from './useShareLink.js';
import { COST_SHARE, COST_LABELS, COST_DEFAULTS as DEFAULTS } from '../lib/share.js';

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

export default function Ledger({ indices = {}, canEmail = false }) {
  const [price, setPrice] = useState(DEFAULTS.price);
  const [bought, setBought] = useState(DEFAULTS.bought);
  const [type, setType] = useState(DEFAULTS.type);
  const [profile, setProfile] = useState(DEFAULTS.profile);
  const [owned, setOwned] = useState(DEFAULTS.owned);
  const [cashDown, setCashDown] = useState(DEFAULTS.cashDown);
  const [cpfDown, setCpfDown] = useState(DEFAULTS.cpfDown);
  const [cpfMonthly, setCpfMonthly] = useState(DEFAULTS.cpfMonthly);
  const [rate, setRate] = useState(DEFAULTS.rate);
  const [tenure, setTenure] = useState(DEFAULTS.tenure);
  const [held, setHeld] = useState(DEFAULTS.held);
  const [agent, setAgent] = useState(DEFAULTS.agent);

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

  /* The one set of figures this page holds: what the share link carries, what
     the email report is rendered from, and what the ledger is computed on. */
  const shareValues = useMemo(() => ({
    price, bought, type, profile, owned, cashDown, cpfDown, cpfMonthly, rate, tenure, held, agent,
    ...(picked ? { home: picked.href, label: picked.label, beds } : {}),
  }), [price, bought, type, profile, owned, cashDown, cpfDown, cpfMonthly, rate, tenure, held, agent,
       picked, beds]);

  /* costLedger, not ledger(): the mapping from these fields to the calculator's
     arguments lives in lib/report/cost.js so the emailed copy cannot drift from
     what is on the screen. */
  const { r, loan, ltv } = useMemo(
    () => costLedger(shareValues, { monthlyRent: market?.rent?.median ?? null }),
    [shareValues, market?.rent?.median]);
  const p = Number(price) || 0;

  /* A result as a link — see components/useShareLink.js. The figures animate
     from the defaults to the link's values on arrival; a static page cannot
     know the fragment before it renders. */
  const { fromLink, url: shareUrl, hash: shareHash } = useShareLink(COST_SHARE, shareValues, v => {
    const set = { price: setPrice, bought: setBought, type: setType, profile: setProfile,
      owned: setOwned, cashDown: setCashDown, cpfDown: setCpfDown, cpfMonthly: setCpfMonthly,
      rate: setRate, tenure: setTenure, held: setHeld, agent: setAgent };
    for (const [k, fn] of Object.entries(set)) if (k in v) fn(v[k]);
    if (v.home) {
      setPicked({ href: v.home, label: v.label || v.home.split('/').pop().replace(/-/g, ' '), sub: '' });
      if (v.beds) setBeds(v.beds);
    }
  });

  const clear = r.breakEven.returnOfCash;
  const sale = saleStatement(r);
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
          <OpenedFromLink fromLink={fromLink} labels={COST_LABELS} />
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
              The month picks the Seller&rsquo;s Stamp Duty schedule.
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
              Loan <b className="mono">{f(loan)}</b> · <b className="mono">{(ltv * 100).toFixed(0)}%</b> of the price.
              {ltv > 0.75 && <> Above the 75% ceiling — a bank would not lend it.</>}
            </p>
            {/* A control must not use a different number from the one typed
                into it. The excess is real money — it just never enters the
                property, so it is not in this ledger. */}
            {r.cpfEntry.clamped && (
              <p className="hint warnline" style={{ margin: '8px 0 0' }}>
                The instalment is only <b className="mono">{f(r.holding.instalment)}</b>, so CPF pays
                no more than that; the other <b className="mono">{f(r.cpfEntry.wanted - r.cpfEntry.used)}</b> a
                month stays in your Ordinary Account.
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
              Your agreed fee. GST at {(r.exit.gstRate * 100).toFixed(0)}% is added.
            </p>
            {r.holding.repaidInYear && (
              <p className="hint warnline" style={{ margin: '8px 0 0' }}>
                Loan repaid in year <b className="mono">{r.holding.repaidInYear}</b>. The CPF you
                used keeps accruing interest until you sell.
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
              Optional. Adds what similar homes rent for, from filed contracts.
              {lookup === 'failed' && <> The lookup failed; nothing else is affected.</>}
              {lookup === 'done' && !market?.rent && <> No filed rents for this one.</>}
            </p>
          </fieldset>
        </div>

        <aside className="plansummary" aria-label="What a sale must clear">
          <div className="plansumin">
            <div className="plansumfig">
              <span className="lab">A sale must clear</span>
              <Figure value={clear} format={f} />
              <p className="hint">
                to return every dollar of cash you put in{cpfBack ? ', after refunding CPF' : ''}.
                {overPaid !== null && <> <b>{(overPaid * 100).toFixed(1)}%</b> above what you paid.</>}
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
                  {f(cpfBack.principal)} used plus <b className="mono">{f(cpfBack.interest)}</b> interest.
                  It returns to your CPF, not to you.
                </p>
              </div>
            )}
            <div className="plansumrows">
              <div><span>Gone for good</span><b className="mono">{f(r.friction)}</b></div>
              <div><span>CPF to refund</span><b className="mono">{f(r.cpf.total)}</b></div>
              <div><span>Loan still owing</span><b className="mono">{f(r.holding.outstanding)}</b></div>
            </div>
            <dl className="resultguide" aria-label="How to use this result">
              <div>
                <dt>What changed it</dt>
                <dd>Loan owing, CPF refund, selling costs and your cash in.</dd>
              </div>
              <div>
                <dt>What this cannot know</dt>
                <dd>The sale price. Maintenance, tax and renovation.</dd>
              </div>
              <div className="resultnext">
                <dt>Next useful step</dt>
                <dd><a href="#downside">Test it against the historical record &rarr;</a></dd>
              </div>
            </dl>
            <ShareResult tool="cost" title="What owning it actually costs — Truestorey" url={shareUrl} />
          </div>
        </aside>
      </div>

      {/* ── THE ANSWER FOLLOWS YOU BELOW 900px ────────────────────────────
          The comment above .planlayout says why the summary is sticky: "the
          two figures that matter stay visible while you argue with the
          assumptions that produce them." Below the breakpoint the aside goes
          static and that intent is lost entirely — measured on a 375px
          viewport, the last input sits at 656px and the answer at 2,011px, so
          every adjustment meant scrolling 1,355px to find out whether
          anything moved. A calculator you cannot see the result of while you
          change it is a form.

          The bar, the CSS and the scroll-padding that keeps it from covering
          a focused input have existed since Planner.jsx got them. This page
          shares the same layout and never got one.

          aria-hidden because it repeats the aside above it verbatim; a screen
          reader has already been given both figures and does not need them
          announced a second time on every keystroke. */}
      <div className="planbar" aria-hidden="true">
        <span><i className="lab">A sale must clear</i> <b className="mono">{f(clear)}</b></span>
        {cpfBack
          ? <span><i className="lab">Back to CPF</i> <b className="mono">{f(cpfBack.total)}</b></span>
          : <span><i className="lab">Gone for good</i> <b className="mono">{f(r.friction)}</b></span>}
      </div>

      {/* ── THE LEDGER, AS A STATEMENT ─────────────────────────────────────
          Moved up from below the two what-if sections, where it read as an
          appendix to the headline rather than its working, and set as the
          page's one statement (components/Statement.jsx). It now ends where
          the headline comes from: the sale at the price that must be
          cleared, line by line, down to the cash put in. */}
      <Statement id="ledger" title="Where every dollar goes"
        basis={`The ledger · your figures · held ${num(r.yearsHeld)} year${r.yearsHeld === 1 ? '' : 's'}`}
        lede={sale
          ? <>The working behind <b className="mono">{f(sale.price)}</b>: what is gone for good, what goes back
            to CPF, and what a sale at that price pays out.</>
          : <>What is gone for good, and what goes back to CPF.</>}>
        <div className="tablewrap">
          <table className="stmt-rows">
            <tbody>
              <tr><th colSpan={2} scope="colgroup">Gone for good — no sale returns these</th></tr>
              <tr><td>Buyer&rsquo;s Stamp Duty</td><td className="r">{f(r.entry.bsd)}</td></tr>
              {r.entry.absd > 0 && (
                <tr><td>Additional Buyer&rsquo;s Stamp Duty, {(r.entry.absdRate * 100).toFixed(0)}%</td>
                  <td className="r">{f(r.entry.absd)}</td></tr>)}
              <tr><td>Legal fees on purchase</td><td className="r">{f(r.entry.legal)}</td></tr>
              <tr><td>Interest paid to the bank over {num(r.yearsHeld)} year{r.yearsHeld === 1 ? '' : 's'}</td>
                <td className="r">{f(r.holding.interestPaid)}</td></tr>
              <tr><td>Legal fees on sale</td><td className="r">{f(r.exit.legal)}</td></tr>
              <tr className="stmt-sub"><td>Gone for good, before commission</td><td className="r">{f(r.friction)}</td></tr>

              {r.cpf.total > 0 && <>
                <tr><th colSpan={2} scope="colgroup">Comes back — to your CPF, not to you</th></tr>
                <tr><td>CPF principal used{r.cpfEntry.used
                  ? <span className="q">{f(r.cpfEntry.used)} a month while the loan ran</span> : null}</td>
                  <td className="r">{f(r.cpf.principal)}</td></tr>
                <tr><td>Accrued interest at {(r.cpf.rate * 100).toFixed(1)}%</td>
                  <td className="r">{f(r.cpf.interest)}</td></tr>
                <tr className="stmt-sub"><td>Refunded to your Ordinary Account</td><td className="r">{f(r.cpf.total)}</td></tr>
              </>}

              <tr><th colSpan={2} scope="colgroup">Each month while you hold it</th></tr>
              <tr><td>Instalment<span className="q">{f(r.cash.perMonth)} of it cash
                {r.holding.repaidInYear ? `, paid for ${r.holding.loanMonths / 12} years` : ''}</span></td>
                <td className="r">{f(r.holding.instalment)}</td></tr>

              {sale ? <>
                <tr><th colSpan={2} scope="colgroup">A sale at {f(sale.price)} — the price that must be cleared</th></tr>
                <tr><td>Sale price</td><td className="r">{f(sale.price)}</td></tr>
                {sale.lines.map(l => (
                  <tr key={l.key}><td>{{
                    loan: <>Redeems the loan<span className="q">outstanding after {num(r.yearsHeld)} year{r.yearsHeld === 1 ? '' : 's'}</span></>,
                    cpf: 'Refunds your CPF, with its interest',
                    commission: `Agent commission, ${r.exit.agentFeePct}% plus GST`,
                    ssd: <>Seller&rsquo;s Stamp Duty, {(r.exit.ssd.rate * 100).toFixed(0)}%<span className="q">{ssdLabel.replace(/^ — /, '')}</span></>,
                    legal: 'Legal fees on sale',
                  }[l.key]}</td><td className="r">&minus;{f(l.amount)}</td></tr>
                ))}
                <tr className="stmt-total"><td>Back to you — the cash you put in</td><td className="r">{f(sale.toSeller)}</td></tr>
              </> : <>
                <tr><th colSpan={2} scope="colgroup">Charged on the sale price, so it depends on what you get</th></tr>
                <tr><td>Agent commission at {r.exit.agentFeePct}% plus GST</td>
                  <td className="r">{(r.exit.agentRate * 100).toFixed(2)}%</td></tr>
                <tr><td>Seller&rsquo;s Stamp Duty{ssdLabel}</td>
                  <td className="r">{r.exit.ssd.rate
                    ? `${(r.exit.ssd.rate * 100).toFixed(0)}%`
                    : (r.exit.ssd.regime ? 'None' : 'Not applicable')}</td></tr>
                <tr><td>Outstanding loan after {num(r.yearsHeld)} year{r.yearsHeld === 1 ? '' : 's'}</td>
                  <td className="r">{f(r.holding.outstanding)}</td></tr>
              </>}
            </tbody>
          </table>
        </div>
        <p className="stmt-foot">Your inputs and published rates — not a valuation of any home.
          {sale && !r.exit.ssd.rate && r.exit.ssd.regime ? ' No Seller’s Stamp Duty: held past the schedule.' : ''}</p>
      </Statement>
      <HowWorked title="What is not in this ledger, and the rules applied">
        <p>Every figure comes from what you typed, from published rates, and — in the section on
          being wrong — from a published index applied to your own price over named, dated periods.
          None of it says what your home is worth or will fetch; <Link href="/condo">the filed
          transaction ranges</Link> are the evidence for that.</p>
        <p><b>Not in this ledger:</b></p>
        <ul>{r.omissions.map(o => <li key={o.slice(0, 24)}>{o}</li>)}</ul>
        <p>URA&rsquo;s filed rental contracts are on <Link href="/yield">the rental yield page</Link>.</p>
        <p><b>The rules being applied:</b></p>
        <ul>{r.caveats.map(c => <li key={c.slice(0, 24)}>{c}</li>)}</ul>
        <p>CPF per month is the part of the instalment your Ordinary Account pays; the rest is cash.
          Commission is your agreed figure, not a market average. The month you bought picks the
          Seller&rsquo;s Stamp Duty schedule, which changed on 4 July 2025.</p>
      </HowWorked>

      {r.renting && (
        <>
          <h2 className="sh" style={{ marginTop: 26 }}><span>Against renting the same thing</span></h2>
          <div className="rentcmp">
            <div>
              <span className="lab">Gone for good, owning</span>
              <b className="mono">{f(r.renting.friction)}</b>
              <span className="hint">Duties, interest and fees only.</span>
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
              <span className="hint">Before any change in the home&rsquo;s value.</span>
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

      <Downside indices={indices} r={r} price={p} propertyType={type} />

      <Scenarios indices={indices} r={r} price={p} propertyType={type} />


      {/* After the answer, never in front of it — §8.2: the email is a copy,
          not the unlock. Absent entirely when the server cannot send. */}
      {canEmail && <EmailReport tool="cost" hash={shareHash} title="the ledger" />}

      <ResultBridge tool="ownership-cost ledger" nextHref="/when-can-i-sell"
        nextLabel="Check the dates that affect a sale" />

      <p className="prov" style={{ marginTop: 22 }}>
        {r.sources.map(s => `${s.name} (effective ${s.effective})`).join(' · ')}
        {' · '}CPF refund rule:{' '}
        <a href="https://www.cpf.gov.sg/service/article/how-much-do-i-need-to-refund-to-my-cpf-account-if-i-am-selling-my-whole-property"
           target="_blank" rel="noopener noreferrer">CPF Board</a>
        {' · '}nothing on this page is saved. Your figures leave the browser only if you ask for
        the emailed copy; the WhatsApp handoff includes no figures.
      </p>

      <h2 className="sh" style={{ marginTop: 26 }}><span>The rest of it</span></h2>
      <ul className="idx">
        <li><Link href="/plan"><span className="n">Whether you clear the loan at all</span><span className="s">TDSR, MSR, the LTV ceiling and both stamp duties</span></Link></li>
        <li><Link href="/progressive"><span className="n">Paying for one still being built</span><span className="s">The statutory ladder, and what the instalment climbs to</span></Link></li>
        <li><Link href="/guides/absd-tdsr-ssd"><span className="n">The guide behind these rates</span><span className="s">What each duty is, and when it bites</span></Link></li>
      </ul>
    </>
  );
}
