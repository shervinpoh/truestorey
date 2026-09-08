'use client';
import { useMemo, useState } from 'react';
import { f, num } from './fmt.js';
import { saleOutcome } from '../lib/calc/ledger.js';
import { distribution, countAtOrBelow, totalFromCagr } from '../lib/calc/windows.js';

/**
 * Three scenarios the reader sets, and how often each has actually happened.
 *
 * ── WHY THIS IS NOT THE SECTION ABOVE IT ───────────────────────────────────
 * "What it costs to be wrong" reads the record: every window of the reader's
 * holding length that has ever run, worst to best, nothing chosen. This one
 * inverts it. The reader picks a rate — the way every stress tester in this
 * market works — and the arithmetic follows their assumption rather than the
 * record's.
 *
 * On its own that is the weaker tool, and it is the exact move this site
 * declines elsewhere: pick a growth rate that reads well and compound it. So
 * it is not on its own. Every slider carries the count of windows in the
 * published index that finished at or below the rate it is set to. Drag Base
 * to 2% a year and the page says how many five-year stretches since 1975
 * managed 2% a year or less. The assumption stays the reader's; whether it has
 * been a common one stops being a matter of opinion.
 *
 * ── WHAT THE BAR IS ────────────────────────────────────────────────────────
 * Where the sale price goes, not whether the number is good. Four segments
 * that sum to the price: what selling costs, what redeems the loan, what
 * returns to CPF, what reaches the seller. saleOutcome() guarantees they add
 * up — test/windows.test.js asserts it at four different prices — so the bar
 * cannot drift from the ledger beside it.
 *
 * ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
 * Any suggestion that one column is the likely one. They are three arithmetics
 * on three assumptions the reader typed. The page says which have been common
 * and stops there.
 */

const PCT = x => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const PCTP = p => `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;

/* Defaults are a starting position, not a house view. Bear below zero because
   a stress tester whose worst case is growth is not one.
 *
 * STATE IS THE PERCENT, NOT THE RATE. Holding 0.035 and rendering
 * value={0.035 * 100} puts 3.5000000000000004 into a controlled input whose
 * step is 0.5. The browser snaps the DOM value back to 3.5, React re-asserts
 * the unsnapped one on the next render, and the two argue — invisible with a
 * mouse, and on a touchscreen, where a drag is a stream of small moves, enough
 * to make the thumb stick or jump back. The percent round-trips exactly; the
 * rate is derived where it is needed. */
const START = [
  { id: 'bear', label: 'Bear', pct: -1.5 },
  { id: 'base', label: 'Base', pct: 2 },
  { id: 'bull', label: 'Bull', pct: 4 },
];

export default function Scenarios({ indices = {}, r, price, propertyType }) {
  const [rates, setRates] = useState(START);
  const [monthly, setMonthly] = useState(400);

  const years = r.yearsHeld;

  /* The same series the section above uses, so the two cannot disagree about
     what the record says. Non-landed for private: an EC or a condo is not
     measured by the landed index. */
  const idx = propertyType === 'HDB' ? indices.hdb : indices.nonLanded;
  const dist = useMemo(() => (idx ? distribution(idx.series, years) : null), [idx, years]);

  const rows = useMemo(() => rates.map(s => {
    const change = totalFromCagr(s.pct / 100, years);
    const sale = price * (1 + change);
    const o = saleOutcome({
      salePrice: sale,
      outstanding: r.holding.outstanding,
      cpfRefund: r.cpf.total,
      legalSell: r.exit.legal,
      agentRate: r.exit.agentRate,
      ssdRate: r.exit.ssd.rate,
      cashIn: r.cash.total,
    });
    /* Holding costs are paid across the hold, not out of the sale, so they sit
       outside the bar and come off the cash afterwards. Putting them in the
       stack would make the segments stop summing to the price. */
    const holding = Math.round((Number(monthly) || 0) * 12 * years);
    const hist = dist ? countAtOrBelow(dist, change) : null;
    return { ...s, change, ...o, holding, inHand: o.toSeller - holding,
             vsCashIn: o.cashChange - holding, hist };
  }), [rates, price, years, monthly, dist, r.holding.outstanding, r.cpf.total,
       r.exit.legal, r.exit.agentRate, r.exit.ssd.rate, r.cash.total]);

  const tallest = Math.max(...rows.map(x => x.salePrice), 1);
  const setRate = (id, v) => setRates(rs => rs.map(s => (s.id === id ? { ...s, pct: v } : s)));

  return (
    <>
      <h2 className="sh" style={{ marginTop: 26 }}><span>Three you set yourself</span></h2>

      <p className="wrongintro">
        The section above reads the record and chooses nothing. This one does the opposite: you
        pick the rate, and the arithmetic follows your assumption. Under each slider is the number
        of {num(years)}-year stretches in the published index that finished at or below the rate
        you have set — so the assumption stays yours, and how common it has been does not.
      </p>

      {/* A <div>, not a <label>. Wrapping the whole card in a label forwards a
          tap ANYWHERE inside it — including the two lines of explanation under
          the track — to the range input, which jumps the value to wherever the
          finger landed horizontally. Reading the note about your assumption
          must not silently change your assumption. The name is a real label
          bound by id instead. */}
      <div className="scenset">
        {rates.map(s => {
          const row = rows.find(x => x.id === s.id);
          return (
            <div key={s.id} className="scenslider">
              <label className="lab" htmlFor={`scen-${s.id}`}>{s.label}</label>
              <b className="mono">{PCTP(s.pct)} <i>a year</i></b>
              <input id={`scen-${s.id}`} type="range" min={-8} max={10} step={0.5}
                value={s.pct}
                aria-valuetext={`${PCTP(s.pct)} a year`}
                onChange={e => setRate(s.id, Number(e.target.value))} />
              <span className="hint">
                {PCT(row.change)} over {num(years)} year{years === 1 ? '' : 's'}
                {row.hist
                  ? <> · <b className="mono">{num(row.hist.count)} of {num(row.hist.of)}</b> stretches
                      on record finished at or below this</>
                  : <> · no index long enough to say how often</>}
              </span>
            </div>
          );
        })}
      </div>

      <label className="scencost">
        <span>Maintenance, tax and insurance, per month</span>
        <input type="number" min="0" max="5000" step="50" value={monthly}
          onChange={e => setMonthly(e.target.value)} />
        <span className="hint">
          Your figure — nobody publishes it per property. It is the first thing named in
          &ldquo;what is not in this ledger&rdquo; above, and it is the only part of this section
          the ledger does not already carry.
        </span>
      </label>

      {/* The key sits ABOVE the bars, not below them. On a phone the three bars
          stack, so a legend underneath lands two screens away from the first
          thing it explains — and a touchscreen has no hover, so the segments'
          title attributes name nothing at all there. */}
      <ul className="scenkey">
        <li><i className="s4" />Selling costs</li>
        <li><i className="s3" />Redeems the loan</li>
        <li><i className="s2" />Back to CPF</li>
        <li><i className="s1" />To you</li>
      </ul>

      <div className="scenbars">
        {rows.map(row => (
          <div key={row.id} className="scenbar">
            <div className="scenplot">
              {/* A custom property, because the same ratio is the bar's HEIGHT
                  on a wide screen and its WIDTH on a narrow one, and an inline
                  style cannot answer a media query. */}
              <div className="scencol" style={{ '--share': row.salePrice / tallest }}>
                {[['s4', row.sellingCosts, 'Selling costs'],
                  ['s3', row.outstanding, 'Redeems the loan'],
                  ['s2', row.cpfRefunded, 'Back to CPF'],
                  ['s1', row.toSeller, 'To you']]
                  /* A zero segment is not drawn. A 2px sliver for a CPF refund
                     of nothing reads as a small amount rather than none. */
                  .filter(([, v]) => v > 0)
                  .map(([cls, v, title]) => (
                    <span key={cls} className={'seg ' + cls}
                      style={{ flexGrow: v }} title={`${title}: ${f(v)}`} />
                  ))}
              </div>
            </div>
            <div className="scenfoot">
              <b className="mono">{PCT(row.change)}</b>
              <span className="lab">{row.label}</span>
              <span className="hint mono">a sale at {f(row.salePrice)}</span>
              {/* Three different facts, not one with a minus sign in front of it.
                    "S$-24,000 in hand" is not a thing that happens to anybody:
                    either you bring money to completion, or you walk away with
                    something, or you walk away with nothing having paid the
                    holding costs anyway. */}
              {row.cashToComplete > 0
                ? <span className="scenshort mono">bring {f(row.cashToComplete)} to completion</span>
                : row.inHand > 0
                  ? <span className="hint">
                      {f(row.inHand)} in hand, after {f(row.holding)} of holding costs
                    </span>
                  : <span className="hint">
                      nothing in hand &mdash; {f(row.toSeller)} of proceeds against{' '}
                      {f(row.holding)} of holding costs
                    </span>}
              <span className={'hint mono ' + (row.vsCashIn >= 0 ? 'scenup' : 'scendown')}>
                {row.vsCashIn >= 0 ? 'up ' : 'down '}{f(Math.abs(row.vsCashIn))} on cash in
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="note" style={{ marginTop: 16 }}>
        <b>These are three arithmetics on three rates you typed.</b> None of them is a forecast and
        the page does not say which is likely — only how often each has happened. Every figure comes
        from your own inputs, the published duties, and the index counts beside the sliders. The bar
        is where a sale price goes, not a view on whether it is a good one.
        {r.exit.ssd.rate > 0 && <> Seller&rsquo;s Stamp Duty at{' '}
          <b className="mono">{(r.exit.ssd.rate * 100).toFixed(0)}%</b> is inside the selling costs
          at this holding period, which is why the short horizons look the way they do.</>}
      </div>
    </>
  );
}
