'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Chart from './Chart.jsx';
import { Figure } from './Motion.jsx';

/**
 * What developers paid for the ground.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * The brief that prompted this asked for a "breakeven ladder": land price plus
 * an estimated construction cost plus a fifteen per cent developer margin,
 * summed into a projected launch price. That is refused. Two of those three
 * numbers are published by nobody — construction cost varies by site, by
 * contractor and by year, and no developer files its margin — so the sum would
 * be one fact carrying two guesses, presented as arithmetic. And a projected
 * launch price for a named future development is a valuation of a thing that
 * does not exist yet, which is the rule this site breaks least willingly.
 *
 * ── WHAT SURVIVES, AND WHY IT IS ENOUGH ────────────────────────────────────
 * The land price is a hard floor and it is published. A developer cannot sell
 * below what the ground cost, so "this site fetched $X per square metre" tells
 * a reader something true and load-bearing without anyone estimating anything.
 * Four hundred and forty-one of them, back to 1993, is a series.
 *
 * ── THE RATE COLUMN IS TWO THINGS ──────────────────────────────────────────
 * URA heads it "$psm per GFA or $psm per GPR" and does not say which applies
 * to a given site. They are not comparable to each other, so the caption says
 * so on every chart rather than once at the bottom. Prices are nominal: 1993
 * dollars are not 2026 dollars and nothing here pretends they are.
 */
const money = n => (Number.isFinite(n) ? `S$${Math.round(n).toLocaleString('en-SG')}` : '—');
const USES = [
  ['residential', 'Residential', /^Residential$|^Condominium/i],
  ['mixed', 'With commercial', /^Residential with Commercial/i],
  ['all', 'Every use', /./],
];

export default function LandView({ data }) {
  const [use, setUse] = useState('residential');
  const [area, setArea] = useState('');

  const match = USES.find(u => u[0] === use)[2];
  const sites = useMemo(
    () => data.sites.filter(s => match.test(s.use) && (!area || s.planningArea === area)),
    [data.sites, match, area]);

  const areas = useMemo(() => {
    const c = new Map();
    for (const s of data.sites) if (match.test(s.use) && s.planningArea) c.set(s.planningArea, (c.get(s.planningArea) || 0) + 1);
    return [...c.entries()].filter(([, n]) => n >= 3).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.sites, match]);

  /* By year of award, median rate. A median rather than a mean because two
     Orchard sites in a thin year would otherwise be the year. */
  const byYear = useMemo(() => {
    const y = new Map();
    for (const s of sites) {
      if (!Number.isFinite(s.psmGfaOrGpr)) continue;
      const k = s.award.slice(0, 4);
      if (!y.has(k)) y.set(k, []);
      y.get(k).push(s.psmGfaOrGpr);
    }
    return [...y.entries()].sort()
      .filter(([, v]) => v.length >= 2)          // one site is not a year
      .map(([k, v]) => {
        const s = v.slice().sort((a, b) => a - b);
        return { label: k, value: s[Math.floor(s.length / 2)], n: v.length };
      });
  }, [sites]);

  const withRate = sites.filter(s => Number.isFinite(s.psmGfaOrGpr));
  const latest = sites.slice(0, 12);
  const median = withRate.length
    ? withRate.map(s => s.psmGfaOrGpr).sort((a, b) => a - b)[Math.floor(withRate.length / 2)]
    : null;

  return (
    <>
      <div className="mapctl" style={{ marginBottom: 4 }}>
        <div className="seg" role="group" aria-label="Use">
          {USES.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={use === k} onClick={() => { setUse(k); setArea(''); }}>
              {label}
            </button>
          ))}
        </div>
        <label className="mapjump">
          <span className="filtn">Planning area</span>
          <select value={area} onChange={e => setArea(e.target.value)} aria-label="Planning area">
            <option value="">Everywhere</option>
            {areas.map(([a, n]) => <option key={a} value={a}>{a} — {n} sites</option>)}
          </select>
        </label>
      </div>

      <div className="kpi3" style={{ marginTop: 16 }}>
        <div><div className="v"><Figure value={sites.length} format={n => Math.round(n).toLocaleString('en-SG')} /></div>
          <span className="lab">Sites awarded</span></div>
        <div><div className="v">{median ? money(median) : '—'}</div><span className="lab">Median rate, psm</span></div>
        <div><div className="v">{sites.length ? `${sites.at(-1).award.slice(0, 4)}–${sites[0].award.slice(0, 4)}` : '—'}</div>
          <span className="lab">Awarded between</span></div>
      </div>

      {byYear.length > 1 && (
        <>
          <div className="sh" style={{ marginTop: 22 }}>
            <span>Median rate by year of award</span>
            <span>years with two or more sites</span>
          </div>
          <Chart points={byYear} format={n => `$${Math.round(n).toLocaleString('en-SG')}`} unit=" psm"
            height={140}
            ariaLabel={`Median land rate per square metre by year of award, ${byYear[0].label} to ${byYear.at(-1).label}.`} />
          {/* Said here, beside the chart, not once at the foot of the page. */}
          <div className="warn" style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}>
              <b>These rates are not all on the same basis.</b> URA heads the column
              &ldquo;$psm per GFA or $psm per GPR&rdquo; and the sheet does not say which applies to
              a given site, so two rates in this chart may be measuring different things. Prices are
              nominal — 1993 dollars are not 2026 dollars.
            </p>
          </div>
        </>
      )}

      <div className="sh" style={{ marginTop: 26 }}>
        <span>Most recently awarded</span><span>{sites.length.toLocaleString('en-SG')} matching</span>
      </div>
      <div className="tablewrap">
        <table className="anst">
          <thead><tr>
            <th>Awarded</th><th>Site</th><th>Planning area</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th style={{ textAlign: 'right' }}>psm</th>
            <th style={{ textAlign: 'right' }}>Bids</th>
            <th>Won by</th>
          </tr></thead>
          <tbody>
            {latest.map(s => (
              <tr key={`${s.award}-${s.site}`}>
                <td className="mono">{s.award}</td>
                <td>{s.site}</td>
                <td>{s.planningArea || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(s.price)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{s.psmGfaOrGpr ? money(s.psmGfaOrGpr) : '—'}</td>
                {/* A single bid is the most informative number on this row and
                    it is easy to skim past. */}
                <td className="mono" style={{ textAlign: 'right' }}>{s.bids ?? '—'}</td>
                <td>{s.winner || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 20 }}>
        <b>What this is, and what it is not.</b> A developer cannot sell below what the ground cost,
        so the land rate is a real floor under whatever is eventually launched there. It is not a
        launch price: construction cost and developer margin are published by nobody, and adding two
        estimates to one fact would produce a forecast wearing arithmetic&rsquo;s clothes. This page
        gives you the fact.
      </div>

      <p className="prov" style={{ marginTop: 20 }}>
        {data.source} · {data.counts.awarded.toLocaleString('en-SG')} awarded sites,{' '}
        {data.counts.fromYear}–{data.counts.toYear} · accessed {data.accessedAt.slice(0, 10)}<br />
        <a href={data.sourcePage} target="_blank" rel="noopener noreferrer">{data.sourcePage}</a><br />
        {data.rateNote}
      </p>

      <div className="sh" style={{ marginTop: 26 }}><span>The rest of it</span></div>
      <ul className="idx">
        <li><Link href="/progressive"><span className="n">Paying for a home still being built</span><span className="s">The nine statutory stages, and what the instalment does</span></Link></li>
        <li><Link href="/blindspot"><span className="n">What is coming near a property</span><span className="s">Upcoming supply, checked against a published rubric</span></Link></li>
      </ul>
    </>
  );
}
