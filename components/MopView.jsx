'use client';
import { useState } from 'react';
import Chart from './Chart.jsx';
import MopMap from './MopMap.jsx';

/**
 * MOP tracker. Every year shown is the EARLIEST POSSIBLE fifth year derived from
 * completion — never presented as "the MOP date", because the dataset does not
 * carry key collection. Where a resale has actually been filed, that is shown
 * as the observed fact it is.
 *
 * IT USED TO STOP AT THE TOWN. Opening a town gave three more totals — 2026,
 * 2,133 units, 21 blocks — which is the same statistic at a finer grain and
 * still nothing a reader can act on. The blocks were in the dataset the whole
 * time. What a seller in Tampines wants to know is which blocks, and what a
 * buyer wants is whether one of them is the block they are about to view, and
 * both of those are answered by naming them.
 *
 * THE MOST USEFUL COLUMN IS THE ONE THAT IS OFTEN EMPTY. A block past its
 * fifth year with no resale ever filed is supply that has not reached the
 * market. That is an absence of evidence, stated as one — never rewritten as
 * "none available" or left blank to be read as zero.
 */
export default function MopView({
  towns, areas, years, totals, source, accessedAt, caveat, generatedForYear, coverage,
}) {
  const [open, setOpen] = useState(null);

  return (
    <>
      <span className="lab">By year · units reaching their fifth year</span>
      {/* Five bars, and every one of them readable. This was a row of grey
          slabs with the accent on the first, and a native title tooltip as the
          only way to learn what any of the others meant. */}
      <Chart
        points={years.map(y => ({ label: `${y.year} · ${y.blocks} block${y.blocks > 1 ? 's' : ''}`, value: y.units }))}
        format={v => v.toLocaleString('en-SG')} unit=" units" height={130}
        ariaLabel={`Units reaching their fifth year, ${years[0]?.year} to ${years.at(-1)?.year}.`} />

      <div className="kpi3" style={{marginTop:18}}>
        <div><div className="v">{totals.upcomingBlocks.toLocaleString('en-SG')}</div><span className="lab">Blocks</span></div>
        <div><div className="v">{totals.upcomingUnits.toLocaleString('en-SG')}</div><span className="lab">Units</span></div>
        <div><div className="v">{towns.length}</div><span className="lab">Towns</span></div>
      </div>
      <p className="prov">{source} · accessed {accessedAt.slice(0,10)}</p>

      <div className="note">
        <b>Read this as “earliest possible”, not “the date”.</b> {caveat}
      </div>

      <h2 style={{marginTop:26,fontSize:'1.05rem'}}>Where it lands</h2>
      <MopMap areas={areas} towns={towns} selected={open} onSelect={setOpen} coverage={coverage} />

      <h2 style={{marginTop:26,fontSize:'1.05rem'}}>By town</h2>
      <p className="hint">Ordered by units. Tap a town to light it on the map and name its blocks.</p>
      <ul className="idx">
        {towns.map(t => (
          <li key={t.slug}>
            <button type="button" className="idxbtn" aria-expanded={open===t.slug}
                    onClick={()=>setOpen(open===t.slug ? null : t.slug)}>
              <span className="n">{t.town}</span>
              <span className="s mono">{t.units.toLocaleString('en-SG')} units · {t.blocks} block{t.blocks>1?'s':''}</span>
            </button>
            {open===t.slug && <TownBlocks town={t} generatedForYear={generatedForYear} />}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * One town, opened: the years, then the blocks behind them.
 *
 * Grouped by year rather than listed flat, because the year is the question —
 * "what is coming in 2027" is the shape of the enquiry, and a 127-block town
 * sorted only by size makes the reader do the grouping themselves.
 */
function TownBlocks({ town, generatedForYear }) {
  const [showAll, setShowAll] = useState(false);
  const byYear = new Map();
  for (const b of town.list) {
    if (!byYear.has(b.y)) byYear.set(b.y, []);
    byYear.get(b.y).push(b);
  }
  const yearsSorted = [...byYear.keys()].sort((a, b) => a - b);
  const CAP = 12;

  return (
    <div className="idxdet">
      {yearsSorted.map(y => {
        const list = byYear.get(y);
        const shown = showAll ? list : list.slice(0, CAP);
        const filed = list.filter(b => b.r > 0).length;
        return (
          <div key={y} className="mopyear">
            <div className="row">
              <span>{y}<small>{list.length} block{list.length>1?'s':''}
                {filed > 0 && ` · ${filed} already with a filed resale`}</small></span>
              <span>{list.reduce((s,b)=>s+b.u,0).toLocaleString('en-SG')} units</span>
            </div>
            <ul className="blocklist">
              {shown.map(b => (
                <li key={b.h}>
                  <a href={b.h}>
                    <span className="bk mono">{b.b}</span>
                    <span className="st">{b.s}</span>
                    <span className="un mono">{b.u.toLocaleString('en-SG')} units</span>
                    {/* An absence, named. A block with no filed resale is the
                        interesting one — it has not reached the market — and
                        printing nothing here would read as a missing value
                        rather than as the finding it is. */}
                    <span className={'fl mono' + (b.r ? '' : ' none')}>
                      {b.r ? `${b.r} resale${b.r>1?'s':''} filed` : 'none filed yet'}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            {list.length > CAP && !showAll && (
              <button type="button" className="linkish" onClick={()=>setShowAll(true)}>
                Show all {town.blocks} blocks in {town.town}
              </button>
            )}
          </div>
        );
      })}
      <p className="hint" style={{margin:'10px 0 0'}}>
        Every block links to what has actually transacted there. A year is the earliest possible
        fifth year from completion, not a date HDB has published for that block.
      </p>
    </div>
  );
}
