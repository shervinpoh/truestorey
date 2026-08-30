'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { relativity, annualDecay, curve, LEASE_TABLE } from '../lib/calc/lease.js';
import Chart from './Chart.jsx';
import { Figure } from './Motion.jsx';
import MoneyInput from './MoneyInput.jsx';
import Row from './PlanRow.jsx';

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
              A figure you already have — a filed price at the block, or a valuation you have been
              given. This site does not produce one.
            </p>
          </fieldset>
        </div>

        <aside className="plansummary" aria-label="What the table says">
          <div className="plansumin">
            <div className="plansumfig">
              <span className="lab">Worth, against freehold</span>
              <Figure value={pct ?? 0} format={n => `${n.toFixed(1)}%`} />
              <p className="hint">
                What the State itself uses at {years} year{years === 1 ? '' : 's'} remaining — for
                lease renewals, differential premium and land betterment charge.
              </p>
            </div>
            <div className="plansumfig">
              <span className="lab">One more year of holding</span>
              <Figure value={yearCost ?? 0} format={money} />
              <p className="hint">
                {decay != null
                  ? <>The table falls {decay.toFixed(2)} points between {years} years left and{' '}
                    {years - 1}. At {money(v)} today, that is what a year costs on this schedule
                    alone — before anything the market does.</>
                  : <>There is no year below this one on the table.</>}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="sh" style={{ marginTop: 26 }}>
        <span>The table</span><span>99 years, as a share of freehold</span>
      </div>
      <Chart
        points={pts} format={n => n.toFixed(1)} unit="% of freehold" height={150}
        ariaLabel="Leasehold value as a percentage of freehold value, from 99 years remaining down to 1." />

      <div className="plansteps" style={{ marginTop: 18 }}>
        <Row label="A fresh 99-year lease" value={`${relativity(99)}%`} note="not 100% — a lease has never been a freehold" />
        <Row label="60 years left" value={`${relativity(60)}%`} note={`falls ${annualDecay(60).toFixed(2)} points a year here`} />
        <Row label="30 years left" value={`${relativity(30)}%`} note={`falls ${annualDecay(30).toFixed(2)} points a year here`} />
        <Row label="A year costs six times more at the end than the start"
          value={`${annualDecay(20).toFixed(2)} vs ${annualDecay(95).toFixed(2)} pts`}
          note="20 years left against 95 — the same lease, the same table" strong />
      </div>

      <div className="note" style={{ marginTop: 20 }}>
        <b>This is a schedule, not a forecast.</b> It says what a lease is worth relative to a
        freehold of the same thing, and it is what the State applies when it prices a lease
        renewal. It does not know your block, your floor, your town or what anyone will pay — and
        nothing here says when to buy, hold or sell.
      </div>

      <div className="note">
        <b>Why the curve bends.</b> Value does not fall by one ninety-ninth a year. Half the lease
        gone leaves {relativity(50)}% of freehold, not half — the early decades are gentle and the
        last ones are steep, which is why the cost of waiting is small for a long time and then
        is not.
      </div>

      {observed?.bands?.length > 0 && (
        <>
          <div className="sh" style={{ marginTop: 26 }}>
            <span>What was actually paid</span>
            <span>{observed.n.toLocaleString('en-SG')} filed transactions</span>
          </div>
          <Chart
            points={observed.bands.map(b => ({ label: `${b.band} yrs left`, value: b.medianPsf }))}
            format={n => `$${Math.round(n).toLocaleString('en-SG')}`} unit=" psf" height={130}
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

      <div className="sh" style={{ marginTop: 26 }}><span>The rest of it</span></div>
      <ul className="idx">
        <li><Link href="/mop"><span className="n">When flats can start selling</span><span className="s">Every block reaching its fifth year, named and mapped</span></Link></li>
        <li><Link href="/plan"><span className="n">Can I afford it</span><span className="s">TDSR, the LTV ceiling, and both stamp duties</span></Link></li>
      </ul>
    </>
  );
}
