'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Search from './Search.jsx';

/**
 * The one decision on the homepage.
 *
 * There used to be three ways in stacked on one screen — a search box, a
 * region grid, and a three-step wizard — all visible at once, none of them
 * saying which was for what. That is not a choice, it is a pile.
 *
 * Now it is a single fork: an address, or an area. Picking one replaces the
 * other, so nothing irrelevant is ever on screen.
 *
 * The two are deliberately NOT equals. An address is the default and the area
 * side says plainly that a town median blends every block, floor and lease in
 * it. The whole argument of this site is that the block is the honest unit;
 * the interface should not quietly suggest otherwise.
 */
const REGION = {
  'ANG MO KIO':'North-East','HOUGANG':'North-East','SENGKANG':'North-East','PUNGGOL':'North-East','SERANGOON':'North-East',
  'BEDOK':'East','TAMPINES':'East','PASIR RIS':'East','MARINE PARADE':'East','GEYLANG':'East',
  'WOODLANDS':'North','YISHUN':'North','SEMBAWANG':'North',
  'JURONG EAST':'West','JURONG WEST':'West','CLEMENTI':'West','BUKIT BATOK':'West','CHOA CHU KANG':'West','BUKIT PANJANG':'West',
  'BISHAN':'Central','TOA PAYOH':'Central','QUEENSTOWN':'Central','BUKIT MERAH':'Central','KALLANG/WHAMPOA':'Central','CENTRAL AREA':'Central',
};
const ORDER = ['Central', 'North-East', 'East', 'North', 'West'];
const slug = s => String(s).toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

export default function Finder({ cat }) {
  const [mode, setMode] = useState('address');
  const [kind, setKind] = useState('HDB');

  const src = kind === 'HDB' ? cat.heat : cat.dheat;
  const range = useMemo(() => {
    const v = Object.values(src || {}).filter(Boolean);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
  }, [src]);
  const heat = key => {
    const v = src?.[key];
    if (!v) return 0.03;
    const [lo, hi] = range;
    return 0.03 + (hi > lo ? (v - lo) / (hi - lo) : 0) * 0.26;
  };

  return (
    <>
      <div className="seg" role="group" aria-label="What are you looking for">
        <button aria-pressed={mode === 'address'} onClick={() => setMode('address')}>A specific address</button>
        <button aria-pressed={mode === 'area'} onClick={() => setMode('area')}>A whole area</button>
      </div>

      {mode === 'address' ? (
        <div style={{ marginTop: 18 }}>
          <Search />
          <p className="hint" style={{ marginTop: 12 }}>
            Every HDB block and every private project with a filed transaction. A block number,
            a street, or a project name.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div className="seg" style={{ marginBottom: 14 }}>
            {['HDB', 'PRIVATE'].map(k => (
              <button key={k} aria-pressed={kind === k}
                disabled={k === 'HDB' ? !cat.hasHdb : !cat.hasPrivate}
                onClick={() => setKind(k)}>{k === 'HDB' ? 'HDB towns' : 'Private districts'}</button>
            ))}
          </div>

          {kind === 'HDB' ? ORDER.map(rg => {
            const list = (cat.hdbTowns || []).filter(t => REGION[t] === rg);
            if (!list.length) return null;
            return (
              <div className="reg" key={rg}>
                <span className="lab" style={{ display: 'block', marginBottom: 6 }}>{rg}</span>
                <div className="grid">
                  {list.map(t => (
                    <Link key={t} href={`/hdb/${slug(t)}`} className="tw" style={{ '--heat': heat(t), textDecoration: 'none' }}>
                      <span className="n">{t}</span>
                      <span className="p">${cat.heat?.[t] ?? '—'} psf</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          }) : (
            <div className="reg">
              <span className="lab" style={{ display: 'block', marginBottom: 6 }}>District</span>
              <div className="grid">
                {(cat.districts || []).map(d => (
                  <Link key={d} href={`/condo#g-${d}`} className="tw" style={{ '--heat': heat(d), textDecoration: 'none' }}>
                    <span className="n">D{d}</span>
                    <span className="p">${cat.dheat?.[d] ?? '—'} psf</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="note"><b>An area median is context, not an answer about a home.</b> It blends
            every block, floor and lease left inside it. Useful for a feel; useless for a decision.
            Open a town, then a block.</div>
        </div>
      )}
    </>
  );
}
