'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { progressive, STAGES, BUC_SOURCE, NOTICE_DAYS, STAMPING } from '../lib/calc/buc.js';
import { bsd, absd } from '../lib/calc/stampDuty.js';
import { f } from './fmt.js';
import { Figure } from './Motion.jsx';
import MoneyInput from './MoneyInput.jsx';
import Row from './PlanRow.jsx';

/**
 * The progressive payment ladder for a home still under construction.
 *
 * WHAT THIS ANSWERS THAT A TABLE OF PERCENTAGES DOES NOT. A buyer looking at a
 * new launch has five questions and a percentage table answers none of them:
 * how much do I need before the bank pays anything, when does my mortgage
 * actually start, why does the payment keep climbing, when is each slice
 * ACTUALLY due, and who is holding my last fifteen per cent. Each of those is
 * a row or a panel below, in that order.
 *
 * WHAT IT REFUSES TO SHOW. A duration column. Every construction stage falls
 * due within fourteen days of a NOTICE from the developer, and the Rules set
 * no interval between notices. Printing "6–9 months" beside a statutory
 * percentage, in the same table, in the same weight, tells a buyer they can
 * plan around a calendar nobody has promised them — and it is the one thing
 * every competitor's version of this does.
 */
const money = n => (Number.isFinite(n) ? f(n) : '—');
const pc = n => `${Math.round(n * 1000) / 10}%`;

export default function Progressive() {
  const [price, setPrice] = useState(1_500_000);
  const [ltv, setLtv] = useState(0.75);
  const [fee, setFee] = useState(0.05);
  const [rate, setRate] = useState(2.5);
  const [tenure, setTenure] = useState(25);
  const [profile, setProfile] = useState('SC');
  const [owned, setOwned] = useState(1);
  const [open, setOpen] = useState(null);

  const r = useMemo(() => progressive({
    price: Number(price) || 0, ltv,
    bookingFeePct: fee, rate: (Number(rate) || 0) / 100, tenureYears: Number(tenure) || 25,
  }), [price, ltv, fee, rate, tenure]);

  /*
   * Stamp duty is NOT part of the price, so it is not part of the ladder — it
   * is money on top, due on its own clock. Folding it into a stage percentage
   * would corrupt a statutory schedule with a figure the schedule does not
   * contain; leaving it off the upfront total would understate what a buyer
   * needs by tens of thousands. So it sits beside the ladder, added to the
   * headline, and dated separately.
   */
  const duty = useMemo(() => {
    const p = Number(price) || 0;
    const b = bsd(p), a = absd(p, profile, Number(owned) || 1);
    return { bsd: b.total, absd: a.total, absdRate: a.rate, total: b.total + a.total };
  }, [price, profile, owned]);

  // The stage at which the bank first pays anything — the answer to "when
  // does my mortgage start", which is not a date but a milestone.
  const firstDraw = r.rows.findIndex(x => x.loan > 0);

  return (
    <>
      <div className="planlayout">
        <div className="planinputs">
          <fieldset className="plangroup">
            <legend className="lab">The purchase</legend>
            <div className="planform">
              <label className="wide2"><span>Price</span>
                <MoneyInput value={price} onChange={setPrice} slider
                  min={500_000} max={8_000_000} step={50_000} /></label>
              <label><span>Loan-to-value</span>
                <select value={ltv} onChange={e => setLtv(Number(e.target.value))}>
                  <option value={0.75}>75% — first housing loan</option>
                  <option value={0.55}>55% — extended tenure</option>
                  <option value={0.45}>45% — second housing loan</option>
                  <option value={0.35}>35% — third or later</option>
                </select>
              </label>
              <label><span>Buyer profile</span>
                <select value={profile} onChange={e => setProfile(e.target.value)}>
                  <option value="SC">Singapore Citizen</option>
                  <option value="SPR">Permanent Resident</option>
                  <option value="FOREIGNER">Foreigner</option>
                </select>
              </label>
              <label><span>Properties owned after this</span>
                <select value={owned} onChange={e => setOwned(Number(e.target.value))}>
                  <option value={1}>This is my only one</option>
                  <option value={2}>My second</option>
                  <option value={3}>My third or more</option>
                </select>
              </label>
              <label><span>Booking fee</span>
                <select value={fee} onChange={e => setFee(Number(e.target.value))}>
                  <option value={0.05}>5% — the usual</option>
                  <option value={0.10}>10%</option>
                  <option value={0.20}>20% — no separate booking fee</option>
                </select>
              </label>
            </div>
            {/* The Rules do not fix this. Saying so is the difference between
                a tool and a brochure. */}
            <p className="hint" style={{ margin: '8px 0 0' }}>
              The Rules set the booking fee at <em>&ldquo;such amount as set out in item 2 of the
              Fourth Schedule&rdquo;</em> — it is written into each project&rsquo;s own agreement, not
              fixed by law. 5% is the usual figure at a launch. Check the Fourth Schedule of the
              agreement you are actually signing.
            </p>
          </fieldset>

          <fieldset className="plangroup">
            <legend className="lab">The loan</legend>
            <div className="planform">
              <label><span>Interest rate, %</span>
                <input type="number" step="0.05" min="0" max="10" value={rate}
                  onChange={e => setRate(e.target.value)} /></label>
              <label><span>Tenure, years</span>
                <input type="number" step="1" min="5" max="35" value={tenure}
                  onChange={e => setTenure(e.target.value)} /></label>
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              A rate you have been quoted, not a rate this site predicts. The instalments below are
              the fully amortising payment on the amount drawn so far — see the note under the ladder.
            </p>
          </fieldset>
        </div>

        <aside className="plansummary" aria-label="What you need">
          <div className="plansumin">
            <div className="plansumfig">
              <span className="lab">Before the bank pays anything</span>
              <Figure value={r.cashCpfTotal + duty.total} format={money} />
              <p className="hint">
                {money(r.cashCpfTotal)} of the price — {pc(1 - ltv)}, out of your own cash and CPF,
                across the first {firstDraw >= 0 ? firstDraw + 1 : ''} stages, before the bank has
                disbursed anything — plus {money(duty.total)} of stamp duty, which is not part of
                the price and runs on its own clock.
              </p>
            </div>
            <div className="plansumfig">
              <span className="lab">Cash that cannot be CPF</span>
              <Figure value={r.bookingFee} format={money} />
              <p className="hint">
                The booking fee buys the Option, which exists before the Sale and Purchase
                Agreement — and CPF cannot be used until that agreement does.
              </p>
            </div>
            <div className="plansumrows">
              <div><span>Loan drawn in total</span><b className="mono">{money(r.loanTotal)}</b></div>
              <div><span>Instalment at TOP</span><b className="mono">{money(r.monthlyAtTop)}</b></div>
              <div><span>Once fully drawn</span><b className="mono">{money(r.monthlyFinal)}</b></div>
            </div>
          </div>
        </aside>
      </div>

      <div className="sh" style={{ marginTop: 26 }}>
        <span>The ladder</span><span>{STAGES.length} stages · 100% of the price</span>
      </div>

      <ul className="ladder">
        {r.rows.map((x, i) => (
          <li key={x.on} className={x.kind ? `st-${x.kind}` : undefined}>
            <button type="button" aria-expanded={open === i}
              onClick={() => setOpen(open === i ? null : i)}>
              <span className="pct mono">{x.pct}%</span>
              <span className="what">
                <b>{x.on}</b>
                <small>
                  {x.own > 0 && <>{money(x.own)} yours</>}
                  {x.own > 0 && x.loan > 0 && ' · '}
                  {x.loan > 0 && <>{money(x.loan)} drawn</>}
                </small>
              </span>
              <span className="mth mono">
                {x.monthly > 0 ? <>{money(x.monthly)}<i>/mo</i></> : <i>no loan yet</i>}
              </span>
            </button>
            {open === i && (
              <div className="ladderdet">
                {/* A quotation, not a summary. */}
                <p className="quote">{x.wording}</p>
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  {x.kind === 'signing'
                    ? <>Due on signing, or within 8 weeks of the Option date — whichever the agreement
                      says. This is the only stage the Rules attach a clock to.</>
                    : x.kind === 'completion'
                      ? <>Only 2% of this reaches the developer on the day. The other 13% sits with the
                        Singapore Academy of Law until the CSC is issued and the Final Payment Date
                        passes — that is your protection, not theirs.</>
                      : <>Falls due within {NOTICE_DAYS} days of the developer&rsquo;s notice that this
                        stage is complete. There is no date for it, only the notice.</>}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="sh" style={{ marginTop: 26 }}>
        <span>Stamp duty</span><span>on top of the price, on its own clock</span>
      </div>
      <div className="plansteps">
        <Row label="Buyer's Stamp Duty" value={money(duty.bsd)} note="progressive, on the price" />
        <Row label="Additional Buyer's Stamp Duty" value={money(duty.absd)}
          note={duty.absd === 0 ? 'none — first residential property as a citizen' : `${pc(duty.absdRate)} at this profile and count`} />
        <Row label="Due" value={`${STAMPING.withinDaysInSingapore} days`}
          note={`from the day after the agreement is first executed in Singapore — ${STAMPING.withinDaysAbroad} days if it is executed abroad`} strong />
      </div>
      <div className="note">
        {/* The competitor states the 14 days and stops. The penalty is the part
            that changes what somebody does, and four times the duty on a
            purchase this size is not a late fee. */}
        <b>Miss it and the penalty is not a late fee.</b> Stamped {STAMPING.penalties[0].after} of
        that deadline, it is {STAMPING.penalties[0].rule}. {STAMPING.penalties[1].after
          .replace(/^after/, 'Later than')} it is {STAMPING.penalties[1].rule} — on this purchase,
        four times {money(duty.total)}. The clock starts {STAMPING.clockStarts}, not on the day
        itself.
      </div>

      <div className="note" style={{ marginTop: 20 }}>
        <b>There is no calendar here, and that is the point.</b> Every construction stage above falls
        due within {NOTICE_DAYS} days of a notice from the developer that the stage is finished. The
        Rules set the percentages and the order; they set no interval between one notice and the next.
        A table that prints &ldquo;6&ndash;9 months&rdquo; beside these figures is showing you a
        builder&rsquo;s estimate in the same weight as the law.
      </div>

      <div className="note">
        <b>Why the payment climbs.</b> You are charged only on what has been disbursed, so the
        instalment steps up each time the bank pays another slice. The figures above are the fully
        amortising payment on the amount drawn so far, over your whole tenure — which is how most
        Singapore banks present a BUC loan. Some packages are interest-only until TOP instead:
        cheaper during construction, identical afterwards. Ask which one you are being offered.
      </div>

      <p className="prov" style={{ marginTop: 22 }}>
        {BUC_SOURCE.name}<br />
        Read against the version current as at {BUC_SOURCE.versionAsAt} ·{' '}
        <a href={BUC_SOURCE.url} target="_blank" rel="noopener noreferrer">{BUC_SOURCE.url}</a><br />
        Percentages and wording are the Rules&rsquo;. The rate and tenure are yours. Your project&rsquo;s
        agreement may carry modifications approved by the Controller of Housing — the Second or Third
        Schedule of that agreement is where they would be.<br />
        Stamp duty timing: {STAMPING.source} · read against the version current as at{' '}
        {STAMPING.versionAsAt} · <a href={STAMPING.url} target="_blank" rel="noopener noreferrer">{STAMPING.url}</a><br />
        This plans a purchase from figures you typed; it does not value any property and it is not
        financial advice.
      </p>

      <div className="sh" style={{ marginTop: 26 }}><span>The rest of it</span></div>
      <ul className="idx">
        <li><Link href="/plan"><span className="n">Whether you clear the loan at all</span><span className="s">TDSR, MSR, the LTV ceiling and both stamp duties</span></Link></li>
        <li><Link href="/guides/absd-tdsr-ssd"><span className="n">The guide behind these numbers</span><span className="s">What each rule is, and when it bites</span></Link></li>
      </ul>
    </>
  );
}
