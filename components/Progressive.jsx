'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BUC_SOURCE, NOTICE_DAYS, STAMPING } from '../lib/calc/buc.js';
import { progressiveResult } from '../lib/report/progressive.js';
import { f } from './fmt.js';
import { Figure } from './Motion.jsx';
import MoneyInput from './MoneyInput.jsx';
import Statement from './Statement.jsx';
import HowWorked from './HowWorked.jsx';
import ConstructionStudy from './ConstructionStudy.jsx';
import ShareResult, { OpenedFromLink } from './ShareResult.jsx';
import useShareLink from './useShareLink.js';
import { PROGRESSIVE_SHARE, PROGRESSIVE_LABELS, PROGRESSIVE_DEFAULTS as D } from '../lib/share.js';
import EmailReport from './EmailReport.jsx';
import ResultBridge from './ResultBridge.jsx';

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

export default function Progressive({ canEmail = false }) {
  const [price, setPrice] = useState(D.price);
  const [ltv, setLtv] = useState(D.ltv);
  const [fee, setFee] = useState(D.fee);
  const [rate, setRate] = useState(D.rate);
  const [tenure, setTenure] = useState(D.tenure);
  const [profile, setProfile] = useState(D.profile);
  const [owned, setOwned] = useState(D.owned);
  const [showPlanBar, setShowPlanBar] = useState(false);

  /* A result as a link — see components/useShareLink.js.
     One set of figures: the link, the emailed copy and the ladder below. */
  const shareValues = useMemo(() => ({ price, ltv, fee, rate, tenure, profile, owned }),
    [price, ltv, fee, rate, tenure, profile, owned]);

  const { fromLink, url: shareUrl, hash: shareHash } = useShareLink(PROGRESSIVE_SHARE, shareValues,
    v => {
      const set = { price: setPrice, ltv: setLtv, fee: setFee, rate: setRate, tenure: setTenure,
        profile: setProfile, owned: setOwned };
      for (const [k, fn] of Object.entries(set)) if (k in v) fn(v[k]);
    });

  /* progressiveResult, not progressive() and the duties separately: that
     mapping lives in lib/report/progressive.js so the emailed copy cannot
     drift from what is on the screen. Stamp duty is NOT part of the price and
     so not part of the ladder — it sits beside it, added to the headline. */
  const { r, duty, firstDraw } = useMemo(() => progressiveResult(shareValues), [shareValues]);


  return (
    <>
      <ConstructionStudy rows={r.rows} price={r.price} rate={Number(rate) || 0}
        tenure={Number(tenure) || 25} bookingFee={r.bookingFee} onStudyPassed={setShowPlanBar} />
      <div className="planlayout" id="purchase-assumptions">
        <div className="planinputs">
          <OpenedFromLink fromLink={fromLink} labels={PROGRESSIVE_LABELS} />
          <p className="construction-return"><a href="#construction-heading">See these figures in the construction study ↑</a></p>
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
              5% is the usual launch figure, but each project&rsquo;s agreement sets it (Fourth
              Schedule, item 2) &mdash; check yours.
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
              A rate you were quoted, not one this site predicts.
            </p>
          </fieldset>
        </div>

        <aside className="plansummary" aria-label="What you need">
          <div className="plansumin">
            <div className="plansumfig">
              <span className="lab">Before the bank pays anything</span>
              <Figure value={r.cashCpfTotal + duty.total} format={money} />
              <p className="hint">
                {money(r.cashCpfTotal)} ({pc(1 - ltv)}) from your cash and CPF over the first{' '}
                {firstDraw >= 0 ? firstDraw + 1 : ''} stages, plus {money(duty.total)} stamp duty.
              </p>
            </div>
            <div className="plansumfig">
              <span className="lab">Cash that cannot be CPF</span>
              <Figure value={r.bookingFee} format={money} />
              <p className="hint">
                The booking fee buys the Option, before the Sale and Purchase Agreement &mdash; and
                CPF cannot be used until that exists.
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

      {/* This answer already has two large figures and three supporting rows.
          Putting the explanation inside its 300px sticky column made the
          result 1,062px tall in a 720px viewport. The same hierarchy follows
          immediately below, but uses the page width instead of creating a
          nested scroll region inside the answer. */}
      <dl className="resultguide resultguide-wide" aria-label="How to use this result">
        <div>
          <dt>What changed it</dt>
          <dd>The LTV leaves <b>{pc(1 - ltv)}</b> to cash and CPF; the <b>{pc(fee)} booking fee</b> is
            cash-only; your profile sets the stamp duty.</dd>
        </div>
        <div>
          <dt>What this cannot know</dt>
          <dd>When the developer&rsquo;s notices will arrive, or whether your bank charges a fully
            amortising payment or interest-only before TOP.</dd>
        </div>
        <div className="resultnext">
          <dt>Next useful step</dt>
          <dd><a href="#construction-heading">Walk through the nine payment stages &uarr;</a>
            <span>Where your funds end and the bank begins.</span></dd>
        </div>
      </dl>
      <div className="resultshare-wide">
        <ShareResult tool="progressive" title="Paying for a home still being built — Truestorey" url={shareUrl} />
      </div>

      {/* ── THE ANSWER FOLLOWS YOU BELOW 900px ────────────────────────────
          Below the two-column breakpoint the aside goes static and the answer
          leaves the screen while the reader is still changing the assumptions
          that produce it — which is the opposite of what the comment above
          .planlayout says the sticky summary is for.

          .planbar and its scroll-padding have existed since Planner.jsx got
          them. Three of the four calculators sharing this layout never got
          one; this is the second. aria-hidden because it repeats the aside
          verbatim and a screen reader does not need both figures announced
          again on every keystroke. */}
      <div className="planbar" aria-hidden="true" hidden={!showPlanBar}>
        <span><i className="lab">Before the bank pays</i> <b className="mono">{money(r.cashCpfTotal + duty.total)}</b></span>
        <span><i className="lab">Cash, not CPF</i> <b className="mono">{money(r.bookingFee)}</b></span>
      </div>

      {/* The page's statement (components/Statement.jsx): the one sum on it
          with a legal deadline attached. The penalty stays visible under it,
          because that is the part that changes what somebody does. */}
      <Statement id="stamp-duty" title="Stamp duty, on top of the price"
        basis={`Stamp Duties Act · due in ${STAMPING.withinDaysInSingapore} days`}>
        <div className="tablewrap">
          <table className="stmt-rows">
            <tbody>
              <tr><td>Buyer&rsquo;s Stamp Duty<span className="q">progressive, on the price</span></td>
                <td className="r">{money(duty.bsd)}</td></tr>
              <tr><td>Additional Buyer&rsquo;s Stamp Duty<span className="q">{duty.absd === 0
                ? 'none — first residential property as a citizen'
                : `${pc(duty.absdRate)} at this profile and count`}</span></td>
                <td className="r">{money(duty.absd)}</td></tr>
              <tr className="stmt-total"><td>To pay within {STAMPING.withinDaysInSingapore} days
                <span className="q">from the day after the agreement is first executed in Singapore &mdash;{' '}
                  {STAMPING.withinDaysAbroad} days if executed abroad</span></td>
                <td className="r">{money(duty.total)}</td></tr>
            </tbody>
          </table>
        </div>
      </Statement>
      <div className="note">
        {/* The competitor states the 14 days and stops. The penalty is the part
            that changes what somebody does, and four times the duty on a
            purchase this size is not a late fee. */}
        <b>Miss it and the penalty is not a late fee.</b> Stamped {STAMPING.penalties[0].after} of
        that deadline, it is {STAMPING.penalties[0].rule}. {STAMPING.penalties[1].after
          .replace(/^after/, 'Later than')} it is {STAMPING.penalties[1].rule} — on this purchase,
        four times {money(duty.total)}.
      </div>

      <HowWorked title="Why there is no calendar, and why the payment climbs">
        <p><b>No calendar, on purpose.</b> Every construction stage falls due within {NOTICE_DAYS} days
          of a notice from the developer that the stage is finished. The Rules set the percentages and
          the order; they set no interval between one notice and the next. A table that prints
          &ldquo;6&ndash;9 months&rdquo; beside these figures is showing a builder&rsquo;s estimate in the
          same weight as the law.</p>
        <p><b>Why the payment climbs.</b> You are charged only on what has been disbursed, so the
          instalment steps up each time the bank pays another slice. The figures are the fully
          amortising payment on the amount drawn so far, over your whole tenure &mdash; how most
          Singapore banks present a BUC loan. Some packages are interest-only until TOP instead:
          cheaper during construction, identical afterwards. Ask which one you are being offered.</p>
        <p>The stamp duty clock starts {STAMPING.clockStarts}, not on the day itself. The booking fee
          is set by each project&rsquo;s agreement at <em>&ldquo;such amount as set out in item 2 of
          the Fourth Schedule&rdquo;</em>, not by law.</p>
      </HowWorked>

      <p className="prov" style={{ marginTop: 22 }}>
        {BUC_SOURCE.name}<br />
        Read against the version current as at {BUC_SOURCE.versionAsAt} ·{' '}
        <a href={BUC_SOURCE.url} target="_blank" rel="noopener noreferrer">{BUC_SOURCE.url}</a><br />
        Percentages and wording are the Rules&rsquo;; your agreement may carry approved modifications
        in its Second or Third Schedule.<br />
        Stamp duty timing: {STAMPING.source} · read against the version current as at{' '}
        {STAMPING.versionAsAt} · <a href={STAMPING.url} target="_blank" rel="noopener noreferrer">{STAMPING.url}</a><br />
        This plans a purchase from figures you typed; it does not value any property and it is not
        financial advice.
      </p>

      {/* After the answer, never in front of it. Absent when nothing can send. */}
      {canEmail && <EmailReport tool="progressive" hash={shareHash} title="the ladder" />}

      <ResultBridge tool="progressive-payment calculator" nextHref="/plan"
        nextLabel="Put the full purchase through the budget check" />

      <h2 className="sh" style={{ marginTop: 26 }}><span>The rest of it</span></h2>
      <ul className="idx">
        <li><Link href="/plan"><span className="n">Whether you clear the loan at all</span><span className="s">TDSR, MSR, the LTV ceiling and both stamp duties</span></Link></li>
        <li><Link href="/guides/absd-tdsr-ssd"><span className="n">The guide behind these numbers</span><span className="s">What each rule is, and when it bites</span></Link></li>
      </ul>
    </>
  );
}
