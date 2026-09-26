'use client';
import { useMemo, useState } from 'react';
import { f, num } from './fmt.js';
import { titleCase } from '../lib/name.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REGIONS = {
  CCR: 'Core Central Region (CCR)',
  RCR: 'Rest of Central Region (RCR)',
  OCR: 'Outside Central Region (OCR)',
};
const REGION_ORDER = ['CCR', 'RCR', 'OCR'];

/** Whole filed prices by place, area band and year — no estimate of one home. */
export default function QuantumView({ data }) {
  const [market, setMarket] = useState('hdb');
  const [place, setPlace] = useState('');
  const [band, setBand] = useState('');

  const chosen = data?.[market];
  const available = chosen?.rows || [];
  const bands = [...new Set(available.filter(r => r[0] === place).map(r => r[1]))].sort((a, b) => a - b);
  const rows = useMemo(() => available.filter(r => r[0] === place && r[1] === Number(band))
    .sort((a, b) => a[2] - b[2]), [available, place, band]);
  const period = chosen?.period;
  const source = data?.source?.[market];
  const places = market === 'hdb' ? chosen?.places || []
    : REGION_ORDER.filter(region => chosen?.places?.includes(region));

  const chooseMarket = next => { setMarket(next); setPlace(''); setBand(''); };
  const choosePlace = next => { setPlace(next); setBand(''); };
  const partialYear = year => {
    const first = String(period?.from || '');
    const last = String(period?.to || '');
    if (String(year) === first.slice(0, 4) && first.slice(5) !== '01')
      return `${MONTHS[Number(first.slice(5)) - 1]}–Dec only`;
    if (String(year) === last.slice(0, 4) && last.slice(5) !== '12')
      return `Jan–${MONTHS[Number(last.slice(5)) - 1]} only`;
    return null;
  };

  if (!data?.hdb?.rows?.length && !data?.private?.rows?.length) return null;

  return (
    <section className="quantum" aria-labelledby="quantum-title">
      <span className="lab">Recorded whole prices · not psf</span>
      <h2 id="quantum-title">What buyers actually paid.</h2>
      <p className="hint">Choose a place and a 20 sqm size band: the middle half of filed sale prices
        each year, its median and the sales behind it. No asking prices or estimates.</p>

      <div className="quantum-market" role="group" aria-label="Property market">
        <button type="button" aria-pressed={market === 'hdb'} onClick={() => chooseMarket('hdb')}>HDB resale</button>
        <button type="button" aria-pressed={market === 'private'} onClick={() => chooseMarket('private')}>Private condos and apartments</button>
      </div>

      <div className="quantum-controls">
        <label><span className="filtn">{market === 'hdb' ? 'HDB town' : 'URA market region'}</span>
          <select value={place} onChange={e => choosePlace(e.target.value)}>
            <option value="">Choose {market === 'hdb' ? 'a town' : 'a region'}</option>
            {places.map(p => <option key={p} value={p}>{market === 'hdb' ? titleCase(p) : REGIONS[p] || p}</option>)}
          </select>
        </label>
        <label><span className="filtn">Floor area</span>
          <select value={band} onChange={e => setBand(e.target.value)} disabled={!place}>
            <option value="">Choose a size band</option>
            {bands.map(b => <option key={b} value={b}>{b} to under {b + data.bandSqm} sqm · about {num(Math.round(b * 10.7639))}–{num(Math.round((b + data.bandSqm) * 10.7639))} sq ft</option>)}
          </select>
        </label>
      </div>

      {place && band && (
        <>
          <p className="quantum-selection">
            <b>{market === 'hdb' ? titleCase(place) : REGIONS[place] || place}</b> · {band} to under {Number(band) + data.bandSqm} sqm
          </p>
          {rows.length ? (
            <ol className="quantum-years" aria-label="Filed whole prices by year">
              {rows.map(([, , year, n, p25, median, p75]) => (
                <li key={year}>
                  <span className="quantum-year mono">{year}{partialYear(year) && <small>{partialYear(year)}</small>}</span>
                  <div><span className="lab">Middle half of filed prices</span>
                    <b>{f(p25)}–{f(p75)}</b></div>
                  <div><span className="lab">Filed median</span><b>{f(median)}</b></div>
                  <span className="quantum-count mono">{num(n)} sales</span>
                </li>
              ))}
            </ol>
          ) : <p className="hint">No size-and-place cohort met the {data.minSales}-sale minimum.</p>}
          <p className="prov">{source} · {period?.from}–{period?.to} · calendar-year cohorts · at least {data.minSales} sales each.</p>
          <p className="hint">These are different homes sold in each year, even inside the same size band.
            A change in the middle can reflect which homes sold; it is not repeat-sale growth and
            cannot price a particular unit.</p>
        </>
      )}
    </section>
  );
}
