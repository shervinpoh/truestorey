'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { num } from './fmt.js';
import { titleCase } from '../lib/name.js';

/**
 * What has sold around here, by radius.
 *
 * ── WHAT IS EXACT AND WHAT IS NOT ──────────────────────────────────────────
 * `projects` is a complete count of same-kind addresses inside the radius.
 * `indexed` is NOT a count of sales that happened: comps.json keeps at most
 * twenty per address, so the per-band totals arrive as exact multiples of
 * twenty. Quoting one as a sale count would be false and falsely precise, so
 * the sentence leads on projects, the sales figure is always qualified, and
 * the number of addresses sitting at the cap is named when there are any.
 *
 * The competitor's version of this panel says "Showing 3 of at least 843" and
 * then lists three rows. Three rows is a worse answer than the distribution,
 * so the middle half of the psf leads and the rows follow it.
 *
 * ── DISTANCE ───────────────────────────────────────────────────────────────
 * Straight-line, said on the page. Rule 10: what sits between two points — a
 * canal, an expressway, a fence — is in no dataset held here, and 300m across
 * a canal is not 300m.
 */
export default function NearbySales({ data, label }) {
  const [i, setI] = useState(() => Math.max(0, data.bands.indexOf(300)));
  const band = data.counts[i];
  const radius = data.bands[i];

  const rows = useMemo(() => data.rows.filter(r => r.m <= radius), [data.rows, radius]);
  const hdb = data.kind === 'HDB';

  return (
    <section className="pane" id="nearbysales">
      <div className="sh"><span>What has sold nearby</span>
        <span className="mono">{radius}m</span></div>

      <label className="nsrange">
        <span className="lab">Distance from {titleCase(label)}</span>
        <input type="range" min={0} max={data.bands.length - 1} step={1} value={i}
          aria-valuetext={`within ${radius} metres`}
          onChange={e => setI(Number(e.target.value))} />
        <span className="hint">
          Straight-line, not walking &mdash; what sits between two points is in no dataset here.
        </span>
      </label>

      {band.projects === 0 ? (
        <p className="note warnline">
          No other {hdb ? 'block' : 'project'} with filed sales sits within {radius}m. That is a
          fact about this radius, not about the market &mdash; widen it above.
        </p>
      ) : (<>
        <div className="nsstat">
          <div>
            <b className="mono">{num(band.projects)}</b>
            <span className="lab">
              {band.projects === 1 ? (hdb ? 'block' : 'project') : (hdb ? 'blocks' : 'projects')}
              {' '}within {radius}m
            </span>
          </div>
          <div>
            <b className="mono">${num(band.p25)}&ndash;${num(band.p75)}</b>
            <span className="lab">
              the middle half, per sq ft
              {/* One neighbour is not a market. The spread is still the real
                  spread of what was filed, but saying "the middle half" of a
                  single project's own sales implies a comparison across
                  projects that has not happened. */}
              {band.projects === 1 && <> &mdash; all from one {hdb ? 'block' : 'project'}</>}
            </span>
          </div>
          <div>
            <b className="mono">${num(band.median)}</b>
            <span className="lab">median of those sales</span>
          </div>
        </div>

        {/* The qualification is not a footnote. `indexed` counts what the file
            holds, and the file holds at most twenty per address. */}
        <p className="hint">
          From <b className="mono">{num(band.indexed)}</b> filed sales &mdash; the{' '}
          {data.perProjectCap} most recent at each {hdb ? 'block' : 'project'}, which is all this
          index keeps.{' '}
          {band.atCap > 0 && <>{num(band.atCap)} of them {band.atCap === 1 ? 'is' : 'are'} at that
            limit, so {band.atCap === 1 ? 'it has' : 'they have'} sold more than is counted
            here.</>}
        </p>

        <table className="nstable">
          <thead>
            <tr>
              <th scope="col">{hdb ? 'Block' : 'Project'}</th>
              <th scope="col" className="r">Away</th>
              <th scope="col">Filed</th>
              <th scope="col">{hdb ? 'Storey' : 'Floor'}</th>
              <th scope="col" className="r">Size</th>
              <th scope="col" className="r">PSF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={k}>
                <td><Link href={r.href}>{titleCase(r.label)}</Link></td>
                <td className="r mono">{r.m}m</td>
                <td className="mono">{r.month}</td>
                {/* The floor BAND, because that is what URA and HDB publish.
                    A unit number is not in either feed, and the only route to
                    one is a licence this site does not hold. */}
                <td className="mono">
                  {r.floor && r.floor !== '-' ? String(r.floor).replace(' TO ', '–') : '—'}
                </td>
                <td className="r mono">{num(r.areaSqm)} sqm</td>
                <td className="r mono">${num(r.psf)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="hint">
          {rows.length < band.indexed
            ? <>The <b className="mono">{num(rows.length)}</b> most recent are listed, out of{' '}
                {num(band.indexed)} in the index at this radius.</>
            : <>All <b className="mono">{num(rows.length)}</b> at this radius are listed.</>}
          {' '}The floor band is what URA and HDB publish; neither feed carries a unit number.
        </p>
      </>)}
    </section>
  );
}
