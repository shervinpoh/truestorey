'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import SchoolMap from './SchoolMap.jsx';
import { f } from './fmt.js';

/**
 * The homes around one school: a map and the table it draws from, filtered
 * together. HDB by flat type (HDB records it); private by size (URA records
 * floor area, never bedrooms). Choosing a type or size swaps every figure in
 * the row for that type's or size's own — a 5-room median is not a block's.
 */
export default function SchoolHomes({ school, homes, land, hdbTypes, sizeBands }) {
  const [kind, setKind] = useState('all');
  const [band, setBand] = useState('1');
  const [size, setSize] = useState('');
  const [order, setOrder] = useState('near');
  const [all, setAll] = useState(false);

  const shown = useMemo(() => {
    const within = homes.filter(h => (band === '1' ? h.m <= 1000 : band === '2' ? h.m > 1000 : true))
      .filter(h => kind === 'all' || (kind === 'hdb' ? h.kind === 'hdb' : h.kind !== 'hdb'));
    const rows = within.map(h => {
      const t = size && kind !== 'all' ? h.types?.[size] : null;
      if (size && kind !== 'all' && !t) return null;
      return { ...h, fig: t || { n: h.n, medianPsf: h.medianPsf, minPrice: h.minPrice, maxPrice: h.maxPrice } };
    }).filter(Boolean);
    return order === 'psf' ? rows.sort((a, b) => (a.fig.medianPsf ?? 0) - (b.fig.medianPsf ?? 0)) : rows;
  }, [homes, kind, band, size, order]);

  const sizes = kind === 'hdb' ? hdbTypes.filter(t => homes.some(h => h.kind === 'hdb' && h.types?.[t]))
    .map(t => ({ key: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))
    : kind === 'private' ? sizeBands.map(b => ({ key: b.key, label: `${b.label} (${b.sqft})` })) : [];
  const rows = all ? shown : shown.slice(0, 40);

  return (
    <>
      <div className="schoolhomesfilter">
        <div className="seg" role="group" aria-label="Kind of home">
          {[['all', 'All homes'], ['hdb', 'HDB'], ['private', 'Private']].map(([k, l]) => (
            <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setSize(''); }}>{l}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Straight-line distance">
          {[['1', 'Within 1 km'], ['2', '1 to 2 km'], ['both', 'Within 2 km']].map(([k, l]) => (
            <button key={k} aria-pressed={band === k} onClick={() => setBand(k)}>{l}</button>
          ))}
        </div>
        {sizes.length > 0 && (
          <label className="fld"><span className="lab">{kind === 'hdb' ? 'Flat type' : 'Size of sale'}</span>
            <select value={size} onChange={e => setSize(e.target.value)}>
              <option value="">Any</option>
              {sizes.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select></label>
        )}
      </div>

      <SchoolMap box={land.box} rings={land.rings} centre={school} homes={shown}
        label={`Homes with filed sales around ${school.name}`} />
      <p className="schoolmapkey">
        <span><i className="sq" aria-hidden="true" />HDB block</span>
        <span><i className="ci" aria-hidden="true" />Private project or landed street</span>
        <span>Circles: 1 km and 2 km, straight-line from the school&rsquo;s registered point — not MOE&rsquo;s measurement.</span>
      </p>

      <div className="schoolsfilter">
        <p className="hint" style={{ margin: 0 }}><b className="mono">{shown.length}</b> {shown.length === 1 ? 'home' : 'homes'}
          {size ? ` with ${kind === 'hdb' ? 'a' : ''} ${sizes.find(s => s.key === size)?.label.toLowerCase()} sale` : ''}.</p>
        <label className="fld"><span className="lab">Order</span>
          <select value={order} onChange={e => setOrder(e.target.value)}>
            <option value="near">Nearest first</option>
            <option value="psf">Lowest median psf first</option>
          </select></label>
      </div>
      <div className="tablewrap">
        <table className="schooltable">
          <thead><tr>
            <th scope="col">Home</th><th scope="col" className="r">Straight-line</th>
            <th scope="col" className="r">Median psf</th><th scope="col" className="r">Filed prices</th>
            <th scope="col">Tenure</th><th scope="col" className="r">Sales</th>
          </tr></thead>
          <tbody>
            {rows.map(h => (
              <tr key={h.href}>
                <td><Link href={h.href}>{h.label}</Link></td>
                <td className="r mono">{(h.m / 1000).toFixed(2)} km</td>
                <td className="r mono">{h.fig.medianPsf ? `S$${h.fig.medianPsf.toLocaleString('en-SG')}` : '—'}</td>
                <td className="r mono">{h.fig.minPrice === h.fig.maxPrice ? f(h.fig.minPrice) : `${f(h.fig.minPrice)} – ${f(h.fig.maxPrice)}`}</td>
                <td>{h.kind === 'hdb' ? h.lease : h.tenure}</td>
                <td className="r mono">{h.fig.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > 40 && (
        <button type="button" className="ghost" onClick={() => setAll(v => !v)}>
          {all ? 'Show the first 40' : `Show all ${shown.length}`}</button>
      )}
    </>
  );
}
