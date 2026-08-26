'use client';
import { useState } from 'react';

/**
 * MOP tracker. Every year shown is the EARLIEST POSSIBLE fifth year derived from
 * completion — never presented as "the MOP date", because the dataset does not
 * carry key collection. Where a resale has actually been filed, that is shown
 * as the observed fact it is.
 */
export default function MopView({ mop }) {
  const [open, setOpen] = useState(null);
  const years = mop.upcomingByYear;
  const maxUnits = Math.max(...years.map(y => y.units), 1);

  const towns = Object.values(mop.towns)
    .map(t => {
      const upcoming = Object.values(t.byYear)
        .filter(y => y.year >= mop.generatedForYear && y.year <= mop.generatedForYear + 4);
      return {
        town: t.town,
        blocks: upcoming.reduce((a, y) => a + y.blocks, 0),
        units: upcoming.reduce((a, y) => a + y.units, 0),
        years: upcoming.sort((a, b) => a.year - b.year),
      };
    })
    .filter(t => t.units > 0)
    .sort((a, b) => b.units - a.units);

  return (
    <>
      <span className="lab">By year · units reaching their fifth year</span>
      <div className="bars" style={{height:110,marginTop:8}}>
        {years.map((y,i)=>(
          <i key={y.year} className={i===0?'last':''}
             style={{height:(10+(y.units/maxUnits)*88)+'%'}}
             title={`${y.year} · ${y.units.toLocaleString('en-SG')} units · ${y.blocks} blocks`} />
        ))}
      </div>
      <div className="axis">
        {years.map(y => <span className="lab" key={y.year}>{String(y.year).slice(2)}</span>)}
      </div>

      <div className="kpi3" style={{marginTop:18}}>
        <div><div className="v">{mop.totals.upcomingBlocks.toLocaleString('en-SG')}</div><span className="lab">Blocks</span></div>
        <div><div className="v">{mop.totals.upcomingUnits.toLocaleString('en-SG')}</div><span className="lab">Units</span></div>
        <div><div className="v">{towns.length}</div><span className="lab">Towns</span></div>
      </div>
      <p className="prov">{mop.source} · accessed {mop.accessedAt.slice(0,10)}</p>

      <div className="note">
        <b>Read this as “earliest possible”, not “the date”.</b> {mop.caveat}
      </div>

      <h2 style={{marginTop:26,fontSize:'1.05rem'}}>By town</h2>
      <p className="hint">Ordered by units. Tap a town for the years behind it.</p>
      <ul className="idx">
        {towns.map(t => (
          <li key={t.town}>
            <button type="button" className="idxbtn" aria-expanded={open===t.town}
                    onClick={()=>setOpen(open===t.town ? null : t.town)}>
              <span className="n">{t.town}</span>
              <span className="s mono">{t.units.toLocaleString('en-SG')} units · {t.blocks} block{t.blocks>1?'s':''}</span>
            </button>
            {open===t.town && (
              <div className="idxdet">
                {t.years.map(y => (
                  <div className="row" key={y.year}>
                    <span>{y.year}<small>{y.blocks} block{y.blocks>1?'s':''}
                      {y.withResale>0 && ` · ${y.withResale} already with a filed resale`}</small></span>
                    <span>{y.units.toLocaleString('en-SG')} units</span>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
