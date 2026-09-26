'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { relativity, annualDecay, curve, LEASE_TABLE } from '../lib/calc/lease.js';
import Chart from './Chart.jsx';
import { Figure } from './Motion.jsx';
import MoneyInput from './MoneyInput.jsx';
import Statement from './Statement.jsx';
import HowWorked from './HowWorked.jsx';
import ResultBridge from './ResultBridge.jsx';

/**
 * The leasehold relativity table, and what it costs to hold.
 *
 * ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
 * No appreciation line, and no "inflection point". The brief that prompted
 * this asked for the table plotted against a 2% annual growth assumption with
 * the crossing marked as the moment a reader "must execute their exit
 * strategy". Nobody publishes a promised appreciation rate — drawing one turns
 * a government schedule into a forecast — and telling someone when to sell is
 * advice this site does not give.
 *
 * What is here instead is the table itself, the ANNUAL cost of holding derived
 * from it by subtraction, and the same figure applied to a price the reader
 * types. All three are the table; none is a prediction.
 */
const money = n => (Number.isFinite(n) ? `S$${Math.round(n).toLocaleString('en-SG')}` : '—');

export default function LeaseView({ observed = null }) {
  const [years, setYears] = useState(60);
  const [value, setValue] = useState(600_000);

  const pts = useMemo(() => curve().map(c => ({ label: `${c.years} yrs left`, value: c.pct })), []);
  const pct = relativity(years);
  const decay = annualDecay(years);
  const v = Number(value) || 0;

  // The table is a share of FREEHOLD. Working back to what freehold this price
  // implies is the only way to put a dollar on one year of the table, and it
  // is arithmetic on a published factor, not a valuation of anything.
  const impliedFreehold = pct ? (v / (pct / 100)) : null;
  const yearCost = impliedFreehold && decay ? impliedFreehold * (decay / 100) : null;
  const observedIndex = useMemo(() => {
    if (!observed?.bands?.length) return null;
    return observed.bands.reduce((best, band, index) => {
      const [lo, hi] = String(band.band).split('–').map(Number);
      const distance = years < lo ? lo - years : years > hi ? years - hi : 0;
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Infinity }).index;
  }, [observed, years]);

  return (
    <>
      <div className="planlayout">
        <div className="planinputs">
          <fieldset className="plangroup">
            <legend className="lab">A lease</legend>
            <div className="planform">
              <label className="wide2"><span>Years left</span>
                <input type="range" min="1" max="99" value={years}
                  onChange={e => setYears(Number(e.target.value))}
                  aria-label="Years of lease remaining" />
              </label>
              <label><span>Years remaining</span>
                <input type="number" min="1" max="99" value={years}
                  onChange={e => setYears(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} /></label>
              <label><span>What it is worth today</span>
                <MoneyInput value={value} onChange={setValue} /></label>
            </div>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              A figure you already have &mdash; this site does not produce one.
            </p>
          </fieldset>
        </div>

        <aside className="plansummary" aria-label="What the table says">
          <div className="plansumin">
            <div className="plansumfig">
              <span className="lab">Worth, against freehold</span>
              <Figure value={pct ?? 0} format={n => `${n.toFixed(1)}%`} />
              <p className="hint">
                The State&rsquo;s own figure at {years} year{years === 1 ? '' : 's'} remaining.
              </p>
            </div>
            <div className="plansumfig">
              <span className="lab">One more year of holding</span>
              <Figure value={yearCost ?? 0} format={money} />
              <p className="hint">
                {decay != null
                  ? <>{decay.toFixed(2)} points between {years} and {years - 1} years left, on{' '}
                    {money(v)} &mdash; the schedule alone, before the market.</>
                  : <>There is no year below this one on the table.</>}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <dl className="resultguide resultguide-wide" aria-label="How to use this result">
        <div>
          <dt>What changed it</dt>
          <dd>The {years}-year row: <b>{pct?.toFixed(1) ?? '—'}% of freehold</b>, and a{' '}
            {decay?.toFixed(2) ?? '—'}-point fall to the next year, applied to your {money(v)}.</dd>
        </div>
        <div>
          <dt>What this cannot know</dt>
          <dd>What a buyer will pay. This is a government schedule, not a market forecast.</dd>
        </div>
        <div className="resultnext">
          <dt>Next useful step</dt>
          <dd><a href="#lease-evidence">Inspect the full table and filed evidence &darr;</a>
            <span>The curve, then what was actually paid.</span></dd>
        </div>
      </dl>

      {/* ── THE ANSWER FOLLOWS YOU BELOW 900px ────────────────────────────
          Below the two-column breakpoint the aside goes static and the answer
          leaves the screen while the reader is still changing the assumptions
          that produce it — which is the opposite of what the comment above
          .planlayout says the sticky summary is for.

          .planbar and its scroll-padding have existed since Planner.jsx got
          them. Three of the four calculators sharing this layout never got
          one; this is the third. aria-hidden because it repeats the aside
          verbatim and a screen reader does not need both figures announced
          again on every keystroke. */}
      <div className="planbar" aria-hidden="true">
        <span><i className="lab">Against freehold</i> <b className="mono">{pct == null ? "—" : `${pct.toFixed(1)}%`}</b></span>
        <span><i className="lab">One more year</i> <b className="mono">{yearCost == null ? "—" : money(yearCost)}</b></span>
      </div>

      {/* The page's statement (components/Statement.jsx): the schedule itself,
          which is what every figure above is read from. */}
      <Statement id="lease-evidence" title="The table: 99 years, as a share of freehold"
        basis="The State’s own schedule">
        <Chart
          points={pts} format={n => n.toFixed(1)} unit="% of freehold" height={150}
          defaultIndex={99 - years}
          idleLabel="selected lease — point at the chart to read any year"
          ariaLabel="Leasehold value as a percentage of freehold value, from 99 years remaining down to 1." />
        <div className="tablewrap">
          <table className="stmt-rows" style={{ marginTop: 14 }}>
            <tbody>
              <tr><td>A fresh 99-year lease<span className="q">not 100% — a lease has never been a freehold</span></td>
                <td className="r">{relativity(99)}%</td></tr>
              <tr><td>60 years left<span className="q">falls {annualDecay(60).toFixed(2)} points a year here</span></td>
                <td className="r">{relativity(60)}%</td></tr>
              <tr><td>30 years left<span className="q">falls {annualDecay(30).toFixed(2)} points a year here</span></td>
                <td className="r">{relativity(30)}%</td></tr>
              <tr className="stmt-sub"><td>A year costs six times more at the end than the start
                <span className="q">20 years left against 95 — the same lease, the same table</span></td>
                <td className="r">{annualDecay(20).toFixed(2)} vs {annualDecay(95).toFixed(2)} pts</td></tr>
            </tbody>
          </table>
        </div>
        <p className="stmt-foot"><b>This is a schedule, not a forecast.</b> It does not know your block,
          floor, town or what anyone will pay, and says nothing about when to buy, hold or sell.</p>
      </Statement>
      <HowWorked title="Why the curve bends">
        <p>Value does not fall by one ninety-ninth a year. Half the lease gone leaves{' '}
          {relativity(50)}% of freehold, not half &mdash; the early decades are gentle and the last ones
          steep, which is why the cost of waiting is small for a long time and then is not. It is the
          table the State applies when it prices a lease renewal, differential premium or land
          betterment charge.</p>
      </HowWorked>

      {observed?.bands?.length > 0 && (
        <>
          <h2 className="sh" style={{ marginTop: 26 }}>
            <span>What was actually paid</span>
            <span>{observed.n.toLocaleString('en-SG')} filed transactions</span>
          </h2>
          <Chart
            points={observed.bands.map(b => ({ label: `${b.band} yrs left`, value: b.medianPsf }))}
            format={n => `$${Math.round(n).toLocaleString('en-SG')}`} unit=" psf" height={130}
            defaultIndex={observedIndex}
            idleLabel="nearest filed lease band — point at the chart to read any band"
            ariaLabel={`Median filed price per square foot by remaining lease, across ${observed.n} transactions.`} />
          {/* The confound, stated first rather than in a footnote. Without it
              this chart reads as a measurement of lease decay, which it is not. */}
          <div className="warn" style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}>
              <b>This is not a measurement of lease decay.</b> It is the median filed price at each
              remaining-lease band, and nothing is held constant: older leases sit in different
              towns, in different flat types, on different floors, built to different standards.
              Read it as what buyers paid, not as what the lease did to the price.
            </p>
          </div>
          <p className="prov">{observed.source} · {observed.period} · accessed {observed.accessedAt}</p>
        </>
      )}

      <p className="prov" style={{ marginTop: 22 }}>
        {LEASE_TABLE.table} · source: {LEASE_TABLE.source}<br />
        {/* The chain is stated, not implied. SLA does not publish this at a URL
            that could be found, so a reader is told how it got here. */}
        Transcribed {LEASE_TABLE.transcribed} from Table 1 of{' '}
        <a href={LEASE_TABLE.reproducedUrl} target="_blank" rel="noopener noreferrer">
          Kwong, Goh &amp; Ti (2025), <em>Unpacking Singapore&rsquo;s leasehold relativity table</em>
        </a>, whose own source line reads &ldquo;Singapore Land Authority&rdquo; — SLA does not
        publish the table at any URL findable on {LEASE_TABLE.transcribed}. All 99 rows are present
        and rise with the term.
      </p>

      <ResultBridge tool="lease calculator" nextHref="/blindspot"
        nextLabel="Check the lease beside the other Blindspot checks"
        body="A schedule cannot see the block, floor, condition or likely buyer pool. Tell me the home and your likely holding period; I’ll tell you which lease assumption I would verify first." />

      <h2 className="sh" style={{ marginTop: 26 }}><span>The rest of it</span></h2>
      <ul className="idx">
        <li><Link href="/mop"><span className="n">When flats can start selling</span><span className="s">Every block reaching its fifth year, named and mapped</span></Link></li>
        <li><Link href="/plan"><span className="n">Can I afford it</span><span className="s">TDSR, the LTV ceiling, and both stamp duties</span></Link></li>
      </ul>
    </>
  );
}
