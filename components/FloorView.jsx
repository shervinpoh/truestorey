'use client';
import { useMemo, useState } from 'react';
import { f, num } from './fmt.js';
import { Figure } from './Motion.jsx';
import { titleCase } from '../lib/name.js';

/**
 * Tower View, as a page you can browse rather than a section on one block.
 *
 * The method note is not decoration. This is the one tool on the site where
 * the naive version of the number — pool the country, compare band to band —
 * is dramatically wrong and looks completely convincing, so the page says
 * loudly which figure holds a building constant and which does not.
 */
const pc = v => `${v > 0 ? '+' : ''}${v}%`;
const SIDE = [
  { key: 'hdb', label: 'HDB', group: 'town', unit: 'block' },
  { key: 'private', label: 'Condo and apartment', group: 'district', unit: 'project' },
];

export default function FloorView({ storey }) {
  const [side, setSide] = useState('hdb');
  const [group, setGroup] = useState('');
  const [type, setType] = useState('');

  const S = SIDE.find(s => s.key === side);
  const d = storey[side];
  const groups = useMemo(() => Object.keys(d.groups).sort(), [d]);
  // Sorted by how much has actually been filed, not alphabetically. Sorting by
  // name opens the page on "1 ROOM", which has almost no transactions and so
  // greets everybody with a row of dashes.
  const types = useMemo(() => {
    const src = (group ? d.groups[group] : d.national) || {};
    return Object.keys(src).sort((a, b) => (src[b]?.n || 0) - (src[a]?.n || 0));
  }, [d, group]);

  const activeType = type && types.includes(type) ? type : types[0];
  const rec = group ? d.groups[group]?.[activeType] : d.national?.[activeType];
  const label = group ? (side === 'hdb' ? titleCase(group) : `District ${group}`) : 'All of Singapore';

  function switchSide(k) { setSide(k); setGroup(''); setType(''); }

  const max = rec?.bands?.length ? Math.max(...rec.bands.map(b => b[2])) : 1;

  return (
    <>
      <div className="seg" role="group" aria-label="Property type">
        {SIDE.map(s => (
          <button key={s.key} aria-pressed={side === s.key} onClick={() => switchSide(s.key)}>{s.label}</button>
        ))}
      </div>

      <div className="mapctl">
        <label className="mapjump">
          <span className="filtn">{S.group === 'town' ? 'Town' : 'District'}</span>
          <select value={group} onChange={e => setGroup(e.target.value)}>
            <option value="">All of Singapore</option>
            {groups.map(g => (
              <option key={g} value={g}>{side === 'hdb' ? titleCase(g) : `District ${g}`}</option>
            ))}
          </select>
        </label>
        <label className="mapjump">
          <span className="filtn">{side === 'hdb' ? 'Flat type' : 'Property type'}</span>
          <select value={activeType || ''} onChange={e => setType(e.target.value)}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {!rec ? (
        <div className="warn" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }}>Nothing filed for {activeType} in {label}.</p>
        </div>
      ) : (
        <>
          <div className="storeygrid">
            <div className="storeycard">
              <span className="filtn">Typical {S.unit}, {label}</span>
              {rec.within ? (
                <>
                  <Figure value={rec.within.p50} format={v => pc(Math.round(v * 10) / 10)} />
                  <p className="hint">
                    Middle of {num(rec.within.n)} {S.unit}s compared with themselves — floors{' '}
                    {storey.cuts[side].hi}+ against floors 1–{storey.cuts[side].lo}. Half fall between{' '}
                    {pc(rec.within.p25)} and {pc(rec.within.p75)}.{' '}
                    <b>{rec.within.neg} of {num(rec.within.n)} came out negative</b> — the high floors
                    fetched less. This is the figure that holds the building constant.
                  </p>
                </>
              ) : (
                <>
                  <b className="statnum" style={{ color: 'var(--mute)' }}>—</b>
                  <p className="hint">
                    No {S.unit} here has {storey.bars.side} or more filed sales at both ends for this
                    type. Nothing is shown rather than something estimated off two sales.
                  </p>
                </>
              )}
            </div>
            <div className="storeycard">
              <span className="filtn">Pooled across {S.unit}s — the misleading one</span>
              {rec.spread != null || group === '' ? (
                <>
                  <b className="statnum" style={{ color: 'var(--mute)' }}>
                    {rec.bands?.length > 1 ? pc(Math.round((rec.bands[rec.bands.length - 1][2] / rec.bands[0][2] - 1) * 1000) / 10) : '—'}
                  </b>
                  <p className="hint">
                    Top band against bottom band, every {S.unit} in {label} thrown in together. It runs
                    far above the honest figure because the tall {S.unit}s in most places are also the
                    newest and the most central. Shown so you can see the size of the trap, not
                    because it answers anything.
                  </p>
                </>
              ) : (
                <>
                  <b className="statnum" style={{ color: 'var(--mute)' }}>—</b>
                  <p className="hint">Not enough at both ends to pool.</p>
                </>
              )}
            </div>
          </div>

          {rec.bands?.length > 0 && (
            <table className="bandtable">
              <caption className="hint" style={{ captionSide: 'bottom', textAlign: 'left', marginTop: 10 }}>
                Median psf by storey band, {activeType}, {label}. Bands with fewer than{' '}
                {storey.bars.band} filed sales are left out entirely.
              </caption>
              <thead>
                <tr><th scope="col">Storeys</th><th scope="col">Median psf</th><th scope="col">Filed sales</th></tr>
              </thead>
              <tbody>
                {rec.bands.map(([range, , psf, n]) => (
                  <tr key={range}>
                    <th scope="row" className="mono">{range}</th>
                    <td><span className="barwrap"><span className="bar" style={{ width: `${Math.round((psf / max) * 100)}%` }} /></span><span className="mono">{f(psf)}</span></td>
                    <td className="mono">{num(n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
