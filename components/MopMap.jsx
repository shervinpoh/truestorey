'use client';

/**
 * Every block reaching its fifth year, on the island, lit by town.
 *
 * WHY A MAP AND NOT ANOTHER TABLE. "TAMPINES · 12,960 units" is a statistic.
 * Where those units are is the thing that decides whether they matter to you,
 * and 693 dots clustered into a dozen bright patches says in one look what a
 * sorted list says in three screens: this supply is not spread evenly, it is
 * piled in Tengah, Tampines and Punggol.
 *
 * WHAT IS DRAWN, AND WHAT IS NOT. URA's own Master Plan planning areas for the
 * land, and one dot per block at its geocoded coordinate. No town boundary is
 * drawn around the lit blocks and no shape is interpolated between them —
 * rule 13. The lit set is the dots themselves.
 *
 * A BLOCK WITH NO COORDINATE IS LISTED AND NOT PLOTTED, and the caption counts
 * it. These are the blocks that have never sold, which is exactly the set a
 * geocoder walking transaction records used to miss — 694 of 749 of them, once
 * — so this map states its own coverage rather than letting a thin scatter
 * read as thin supply.
 *
 * ARIA-HIDDEN ON PURPOSE. The town list underneath is the same information as
 * a real control, already focusable and already announced. Making each town's
 * dots a second tab stop would double every announcement to say the same thing
 * twice, so the map is a visual index of a list that carries the meaning.
 */
export default function MopMap({ areas, towns, selected, onSelect, coverage }) {
  if (!areas?.length) return null;

  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const a of areas) for (const ring of a.rings) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  const W = 1000;
  // At 1.35°N a degree of longitude and one of latitude differ by three parts
  // in ten thousand, so the viewBox aspect alone keeps this undistorted.
  const H = Math.round(W * ((maxLat - minLat) / (maxLon - minLon)));
  const x = lon => ((lon - minLon) / (maxLon - minLon)) * W;
  const y = lat => ((maxLat - lat) / (maxLat - minLat)) * H;

  const land = areas.map(a => a.rings
    .map(r => 'M' + r.map(([lon, lat]) => `${x(lon).toFixed(1)},${y(lat).toFixed(1)}`).join('L') + 'Z')
    .join('')).join('');

  const plottable = towns.map(t => ({
    ...t, dots: t.list.filter(b => Number.isFinite(b.la) && Number.isFinite(b.lo)),
  }));
  const hit = plottable.find(t => t.slug === selected);

  return (
    <div className="mopmap">
      <svg viewBox={`0 0 ${W} ${H}`} className="mopsvg" aria-hidden="true"
        onClick={e => { if (e.target === e.currentTarget) onSelect(null); }}>
        <path d={land} fill="var(--line2)" stroke="var(--paper)" strokeWidth="1.2" strokeLinejoin="round" />

        {/* Two passes, unlit first, so a lit dot is never painted under a
            neighbouring town's. Painter's algorithm — the same reason /map
            sorts north-first before it draws. */}
        {plottable.map(t => t.slug === selected ? null : (
          <g key={t.slug} className="mopdots" onClick={() => onSelect(t.slug)}>
            {t.dots.map(b => (
              <circle key={b.h} cx={x(b.lo).toFixed(1)} cy={y(b.la).toFixed(1)} r={selected ? 2.4 : 3}
                className={selected ? 'dim' : ''} />
            ))}
          </g>
        ))}

        {hit && (
          <g className="mopdots lit">
            {hit.dots.map(b => (
              <circle key={b.h} cx={x(b.lo).toFixed(1)} cy={y(b.la).toFixed(1)} r="5" />
            ))}
          </g>
        )}
      </svg>

      <p className="prov" style={{ marginTop: 8 }}>
        {selected && hit
          ? <><b>{hit.town}</b> — {hit.dots.length} block{hit.dots.length === 1 ? '' : 's'} lit
              of {hit.blocks} reaching their fifth year here.</>
          : <>Every block reaching its fifth year in the next five years. Tap a town to light it.</>}
        {coverage?.unplotted > 0 && (
          <> {coverage.unplotted} block{coverage.unplotted === 1 ? ' has' : 's have'} no
            published coordinate and {coverage.unplotted === 1 ? 'is' : 'are'} listed but not
            drawn.</>
        )}<br />
        Land: URA Master Plan planning areas. Blocks: OneMap. No boundary is drawn around the
        lit blocks — the dots are the set.
      </p>
    </div>
  );
}
