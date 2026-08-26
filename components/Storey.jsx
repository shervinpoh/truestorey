'use client';
import { useMemo, useState } from 'react';
import { f, num } from './fmt.js';
import { Figure } from './Motion.jsx';

/**
 * Tower View — what the floor is worth, on a record page.
 *
 * TRM charges for this. The data has been in data/hdb.json and
 * data/private.json since the first ingest: HDB files a storey range on every
 * resale, URA files a floor range on every non-landed sale.
 *
 * Two figures, and the page has to keep them visibly apart, because they are
 * different claims:
 *
 *   THIS BUILDING   the block compared with itself. Shown only when the block
 *                   has enough sales high and low on its own. It is the real
 *                   answer, because the estate, the lease and the location are
 *                   identical on both sides of the ratio.
 *
 *   THE TOWN        the median across every building in the town that clears
 *                   the same bar, as a spread rather than a single number, with
 *                   the count that came out NEGATIVE shown next to it. High
 *                   floors do not always fetch more, and a tool that rounds
 *                   that away is not measuring, it is reassuring.
 *
 * The band table underneath is descriptive only and is labelled as such: it
 * pools every building in the town, so an estate with tall new blocks pushes
 * its upper bands up regardless of what height is worth.
 *
 * No floor number is ever printed. The source says "10 TO 12" and so does this.
 */
const pc = v => `${v > 0 ? '+' : ''}${v}%`;

export default function Storey({ data, label }) {
  const [type, setType] = useState(null);
  // Types this BUILDING has its own figure for come first, then the rest by how
  // much has been filed. Sorting alphabetically opens on "3 ROOM" and greets
  // most visitors with two dashes on a block that has plenty of 4-room data.
  const types = useMemo(() => {
    const t = new Set([...Object.keys(data.group || {}), ...Object.keys(data.unit || {})]);
    return [...t].sort((a, b) => {
      const own = (data.unit?.[b] ? 1 : 0) - (data.unit?.[a] ? 1 : 0);
      return own || (data.group?.[b]?.n || 0) - (data.group?.[a]?.n || 0);
    });
  }, [data]);
  if (!types.length) return null;

  const active = type && types.includes(type) ? type : types[0];
  const g = data.group?.[active] || null;
  const u = data.unit?.[active] || null;
  const isHdb = data.kind === 'HDB';
  const unitNoun = isHdb ? 'block' : 'project';

  return (
    <section className="pane">
      <div className="sh"><span>What the floor is worth</span></div>

      {types.length > 1 && (
        <div className="seg" role="group" aria-label="Flat type">
          {types.map(t => (
            <button key={t} aria-pressed={t === active} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
      )}

      <div className="storeygrid">
        <div className="storeycard">
          <span className="filtn">This {unitNoun}</span>
          {u ? (
            <>
              <Figure value={u.prem} format={v => pc(Math.round(v * 10) / 10)} />
              <p className="hint">
                Floors {data.cut.hi}+ against floors 1–{data.cut.lo}, {label} only.
                Median {f(u.hi[0])} psf up top from {u.hi[1]} sale{u.hi[1] > 1 ? 's' : ''},{' '}
                {f(u.lo[0])} psf low down from {u.lo[1]}.
              </p>
            </>
          ) : (
            <>
              <b className="statnum" style={{ color: 'var(--mute)' }}>—</b>
              <p className="hint">
                Not enough filed sales at both ends of this {unitNoun} to compare it with itself.
                It needs {data.bars.side} or more high and {data.bars.side} or more low.
                The figure beside this one is the town, not here.
              </p>
            </>
          )}
        </div>

        <div className="storeycard">
          <span className="filtn">{data.scopeLabel}, typical {unitNoun}</span>
          {g?.within ? (
            <>
              <Figure value={g.within.p50} format={v => pc(Math.round(v * 10) / 10)} />
              <p className="hint">
                Middle of {g.within.n} {unitNoun}s in {data.scopeLabel} that clear the bar —
                half fall between {pc(g.within.p25)} and {pc(g.within.p75)}.
                {' '}<b>{g.within.neg === 0 ? 'None' : g.within.neg} came out negative</b>
                {g.within.neg > 0 ? ` — high floors sold for less in ${g.within.neg} of them.` : ' in this set.'}
              </p>
            </>
          ) : (
            <>
              <b className="statnum" style={{ color: 'var(--mute)' }}>—</b>
              <p className="hint">
                No {unitNoun} in {data.scopeLabel} has enough sales at both ends for this
                flat type. Nothing is shown rather than something estimated.
              </p>
            </>
          )}
        </div>
      </div>

      {g?.bands?.length > 1 && (
        <>
          <p className="hint" style={{ marginTop: 18 }}>
            <b>Every band in {data.scopeLabel}, for reference.</b> This pools all buildings in the
            town, so it carries the estates as well as the storeys — a town whose tall blocks are its
            newest ones will show a steeper climb than height alone buys. The two figures above are
            the ones that hold a building constant.
          </p>
          <table className="bandtable">
            <thead>
              <tr><th scope="col">Storeys</th><th scope="col">Median psf</th><th scope="col">Filed sales</th></tr>
            </thead>
            <tbody>
              {g.bands.map(([range, , psf, n]) => {
                const w = Math.round((psf / Math.max(...g.bands.map(b => b[2]))) * 100);
                return (
                  <tr key={range}>
                    <th scope="row" className="mono">{range}</th>
                    <td><span className="barwrap"><span className="bar" style={{ width: `${w}%` }} /></span><span className="mono">{f(psf)}</span></td>
                    <td className="mono">{num(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <p className="prov">
        {isHdb ? data.source.hdb : data.source.private} · accessed{' '}
        {isHdb ? data.source.hdbAccessed : data.source.privateAccessed}.
        Storey bands are the source's own — no floor number is inferred from them.
        A premium is a median of filed transactions, not a valuation of any home.
      </p>
    </section>
  );
}
