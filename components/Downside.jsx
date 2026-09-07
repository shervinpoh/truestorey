'use client';
import { useMemo, useState } from 'react';
import { f, num } from './fmt.js';
import { distribution, countAtOrBelow, cagrFromTotal, qNum, qLabel } from '../lib/calc/windows.js';
import { saleOutcome } from '../lib/calc/ledger.js';

/**
 * What it costs to be wrong.
 *
 * ── WHY THIS IS THE ONE FEATURE NOBODY ELSE SHIPS ──────────────────────────
 * Every property calculator in this market models the upside. Ask any of them
 * what a home will be worth in five years and it picks a growth rate that
 * reads well and compounds it. The other tail is never drawn, and the other
 * tail is where the decision lives — it is the reason people are told to hold
 * property "long term" without ever being told how long, or what happens if
 * they cannot.
 *
 * ── HOW IT AVOIDS BEING A FORECAST ─────────────────────────────────────────
 * It never picks a rate. It reads a published index and takes EVERY window of
 * the reader's own holding length that has actually run — 126 five-year
 * stretches in HDB's index, 186 in URA's — and applies what happened in each
 * to the price the reader typed. The worst one is dated. So is the best.
 * Nothing is extrapolated and nothing is averaged into a single answer.
 *
 * ── WHY IT IS NOT A VALUATION ──────────────────────────────────────────────
 * Rule 2 forbids publishing a valuation. Nothing here estimates what this home
 * is worth: every figure is the reader's OWN purchase price moved by a
 * published national index over a dated historical period, presented as the
 * full range of what that index has done rather than as one number. The
 * conditional is written on the page in those words — "if it had moved with
 * the market" — because an index is a market and a home is one home, and the
 * gap between the two is the whole subject of /blindspot.
 *
 * ── THE FIGURE THE FEATURE EXISTS FOR ──────────────────────────────────────
 * Not the worst case. The BREAK-EVEN FREQUENCY: a sale needs to clear a
 * particular rise just to return the reader's own money — duties, interest and
 * commission see to that — and this counts how many windows in the published
 * record failed to deliver it. That turns "prices go up over time" from a
 * belief into a count.
 */

/** Which published series governs which purchase. */
function pick(indices, propertyType, landed) {
  if (propertyType === 'HDB') return indices.hdb || null;
  if (landed && propertyType === 'PRIVATE') return indices.landed || null;
  return indices.nonLanded || null;
}

const pct = x => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

export default function Downside({ indices = {}, r, price, propertyType }) {
  const [landed, setLanded] = useState(false);
  const idx = pick(indices, propertyType, landed);

  const dist = useMemo(() => (idx ? distribution(idx.series, r.yearsHeld) : null), [idx, r.yearsHeld]);

  /* The rise a sale needs before any of this is even a question. Null when the
     costs of selling would consume the whole price, which breakEven() already
     refuses to dress up as money. */
  const clear = r.breakEven.returnOfCash;
  const needed = clear && price ? clear / price - 1 : null;
  const missed = dist && needed !== null ? countAtOrBelow(dist, needed) : null;
  const neededCagr = needed === null ? null : cagrFromTotal(needed, r.yearsHeld);

  const outcomes = useMemo(() => {
    if (!dist) return null;
    const at = w => ({
      ...w,
      ...saleOutcome({
        salePrice: price * (1 + w.change),
        outstanding: r.holding.outstanding,
        cpfRefund: r.cpf.total,
        legalSell: r.exit.legal,
        agentRate: r.exit.agentRate,
        ssdRate: r.exit.ssd.rate,
        cashIn: r.cash.total,
      }),
    });
    return { worst: at(dist.worst), middle: at(dist.middle), best: at(dist.best) };
  }, [dist, price, r.holding.outstanding, r.cpf.total, r.exit.legal, r.exit.agentRate,
      r.exit.ssd.rate, r.cash.total]);

  /* Two forms, because one string cannot be both. "5 years" is the noun and
     "5-year" is the adjective, and "every 5 years stretch" is what you get for
     trying to make the first do the second's job. */
  const yrs = `${num(r.yearsHeld)} year${r.yearsHeld === 1 ? '' : 's'}`;
  const spanAdj = `${num(r.yearsHeld)}-year`;

  /* ── what the index STOOD AT, for the windows that need saying ────────────
     "The best 3 years on record: +278.6%" is true, dated, and unbelievable.
     It is 1978-Q2 to 1981-Q2, when the index went from 11.7 to 44.3 — against
     210.6 today. Reported bare it discredits the section, because a reader who
     cannot place a figure treats it as invented, and this section's entire
     claim is that none of it is.

     So the levels are named. Not a second superlative, not a friendlier span
     picked after looking at the numbers: two published values with dates on
     them, which is what lets a reader see for themselves that the window
     belongs to a market at a fraction of this one's size.

     The trigger is that the index then was under half what it is now. That is
     the condition under which the sentence is worth reading — it fires on the
     windows nobody believes and stays silent on the rest, and it describes
     itself rather than encoding a chosen year. */
  const era = useMemo(() => {
    if (!idx || !dist) return null;
    const v = idx.series.values;
    const i = qNum(dist.best.from) - qNum(idx.series.from);
    const then = v[i], now = v.at(-1);
    if (!(then > 0) || !(now > 0) || then >= now / 2) return null;
    return { then, now, to: v[i + dist.quarters] };
  }, [idx, dist]);

  /* Where the reader's own purchase sits in the published record. Not a
     valuation and not about this home: it is what the INDEX did between the
     quarter they bought in and the latest one published, which is a market
     fact with two dates on it. Null when the purchase month is outside the
     series — a purchase still being built has no quarter behind it yet. */
  const sinceBought = useMemo(() => {
    if (!idx || !r.purchaseDate) return null;
    const d = new Date(r.purchaseDate);
    if (Number.isNaN(d.getTime())) return null;
    const q = `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    const i = qNum(q) - qNum(idx.series.from);
    const v = idx.series.values;
    if (!(i >= 0) || i >= v.length - 1) return null;
    return { from: q, to: qLabel(qNum(idx.series.from) + v.length - 1),
             change: v[v.length - 1] / v[i] - 1 };
  }, [idx, r.purchaseDate]);

  return (
    <>
      <div className="sh" style={{ marginTop: 26 }}><span>What it costs to be wrong</span></div>

      <p className="wrongintro">
        Everything above assumes the price does whatever it does. This is the other tail. It makes
        no forecast and picks no growth rate: it reads the published index, takes <b>every</b>{' '}
        {spanAdj} stretch that has ever run in it, and applies what actually happened in each one
        to the price you paid.
      </p>

      {propertyType === 'PRIVATE' && (indices.landed && indices.nonLanded) && (
        <div className="planform" style={{ margin: '0 0 14px', maxWidth: 260 }}>
          <label><span>Which index</span>
            <select value={landed ? 'landed' : 'nonLanded'}
              onChange={e => setLanded(e.target.value === 'landed')}>
              <option value="nonLanded">Non-landed</option>
              <option value="landed">Landed</option>
            </select></label>
        </div>
      )}

      {!idx && (
        <p className="note warnline">
          The price index for this property type is not in the build, so this check cannot run and
          is <b>not</b> being reported as no risk. Run <code>npm run ingest:ppi</code> for private
          and <code>npm run ingest:index</code> for HDB.
        </p>
      )}

      {idx && !dist && (
        <p className="note warnline">
          <b>This does not read at {yrs}.</b> {idx.name} starts at {idx.series.from}, so it holds
          about <b className="mono">{Math.floor((idx.series.values.length / 4) / r.yearsHeld)}</b>{' '}
          {spanAdj} stretches that do not overlap each other. Windows that share {yrs === '1 year'
            ? 'most of their length'
            : `all but a quarter of their ${r.yearsHeld} years`} are one reading counted many times,
          not many readings, and a distribution built from them says more about when the index
          starts than about what a {spanAdj} hold has done. Nothing is inferred from the few that
          fit, and this is not being reported as no risk. Set the holding period to 12 years or
          fewer to read it.
        </p>
      )}

      {idx && dist && (
        <>
          {/* THE HEADLINE. Not the worst case — the break-even frequency. A
              percentage a sale must clear is an abstraction until it is set
              against how often the market has delivered it. */}
          {missed && needed !== null && (
            <div className="wrongline">
              <p>
                A sale has to clear <b className="mono">{f(clear)}</b> just to return the money you
                put in — <b className="mono">{pct(needed)}</b> above what you paid, before this home
                has made you a cent. Across {yrs} that is{' '}
                <b className="mono">{neededCagr === null ? '—' : pct(neededCagr)}</b> a year.
              </p>
              {/* The question this answers is the one every reader asks of the
                  figure above it: why does holding LONGER mean selling HIGHER?
                  Because the bar is "return every dollar of cash", and the
                  dollars keep going in — S$359k at three years, S$856k at
                  seventeen. The total rises and the RATE it asks for falls, and
                  quoting only the total made a 2.7%-a-year bar read as a
                  58.3% one. */}
              <p className="wrongwhy">
                That total rises the longer you hold, because you keep putting cash in —{' '}
                <b className="mono">{f(r.cash.total)}</b> so far, and every instalment adds to it.
                The rate it asks for falls at the same time. A longer hold is a bigger number and
                an easier one.
              </p>
              <p className={missed.count ? 'wrongcount' : 'wrongcount ok'}>
                <b className="mono">{num(missed.count)} of the {num(missed.of)}</b> {spanAdj}{' '}
                stretches in {idx.name.replace(/ —.*/, '')} since {dist.from} finished below that.
              </p>
              {sinceBought && (
                <p className="wrongsince">
                  Since you bought, in {sinceBought.from}, that index has moved{' '}
                  <b className="mono">{pct(sinceBought.change)}</b> to {sinceBought.to}. That is what
                  the market did, not what this home did — the two are not the same number and
                  nothing here claims to know the second.
                </p>
              )}
            </div>
          )}

          <div className="rentcmp wrong3">
            {[['worst', `The worst ${yrs} on record`],
              ['middle', 'The middle one'],
              ['best', `The best ${yrs} on record`]].map(([k, label]) => {
              const o = outcomes[k];
              return (
                <div key={k} className={k === 'middle' ? 'diff' : undefined}>
                  <span className="lab">{label}</span>
                  <span className={`pill ${o.change < 0 ? 'd' : 'u'}`} style={{ marginTop: 0 }}>
                    {pct(o.change)}
                  </span>
                  <b className="mono" style={{ marginTop: 8 }}>
                    {o.cashToComplete > 0 ? f(o.cashToComplete) : f(o.toSeller)}
                  </b>
                  <span className="hint">
                    {o.cashToComplete > 0
                      ? <>to <b>bring to completion</b>. A sale at that price does not redeem the
                          loan, and the bank is not optional.</>
                      : <>in your hand at completion, against <b className="mono">{f(r.cash.total)}</b>{' '}
                          of cash you put in — {o.cashChange >= 0 ? 'up' : 'down'}{' '}
                          <b className="mono">{f(Math.abs(o.cashChange))}</b>.</>}
                    {o.cpfShortfall > 0 && <> And <b className="mono">{f(o.cpfShortfall)}</b> of your
                      CPF never goes back into the account.</>}
                  </span>
                  {k === 'best' && era && (
                    <span className="hint wrongera">
                      The index stood at <b className="mono">{era.then}</b> when that window opened
                      and <b className="mono">{era.to}</b> when it closed. It is{' '}
                      <b className="mono">{era.now}</b> now — that stretch belongs to a market a
                      fraction of this one&rsquo;s size, which is why it looks the way it does.
                    </span>
                  )}
                  <span className="hint mono wrongwhen">{o.from} → {o.to}</span>
                </div>
              );
            })}
          </div>

          <p className="hint">
            {dist.negative
              ? <><b className="mono">{num(dist.negative)}</b> of those {num(dist.n)} stretches ended
                  lower than they started.</>
              : <>None of those {num(dist.n)} stretches ended lower than it started — which is a fact
                  about {r.yearsHeld} years and not about {r.yearsHeld - 1}.</>}
            {' '}Every window overlaps its neighbours, so these are {num(dist.n)} readings of one
            history and not {num(dist.n)} independent trials — the index holds{' '}
            <b className="mono">{num(dist.independent)}</b> {spanAdj} stretches that share no
            quarter with each other. They are counted, not turned into a
            probability, for that reason. The worst of them started in{' '}
            <span className="mono">{dist.worst.from.slice(0, 4)}</span> and the best in{' '}
            <span className="mono">{dist.best.from.slice(0, 4)}</span>: they are the boundaries of
            what has happened, not a range of what will.
          </p>

          <div className="note" style={{ marginTop: 18 }}>
            <b>An index is a market. Your home is one home.</b> Every figure here is the price{' '}
            <em>you</em> typed, moved by what {idx.agency.replace(/,.*/, '')}&rsquo;s published index
            actually did over a dated period. It is not an estimate of what this property is worth,
            was worth, or will fetch — no such number appears on this page, and one address can
            diverge from the island by a wide margin in either direction.{' '}
            {propertyType === 'HDB' || propertyType === 'EC_DEVELOPER'
              ? 'A minimum occupation period governs when this one can be sold at all, which is a '
                + 'harder constraint than any of the above.'
              : ''}
          </div>

          <p className="prov">
            {idx.name} · {idx.agency} · {idx.base} · {idx.series.from} to{' '}
            {dist.to} · {num(dist.n)} overlapping {spanAdj} windows ·
            {' '}retrieved {String(idx.accessedAt).slice(0, 10)}
            {idx.href && <> · <a href={idx.href} target="_blank" rel="noopener noreferrer">source</a></>}
            {idx.excludes && <> · {idx.excludes}</>}
          </p>
          {idx.footnote && <p className="prov" style={{ marginTop: 6 }}>{idx.footnote}</p>}
        </>
      )}
    </>
  );
}
