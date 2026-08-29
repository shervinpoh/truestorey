import Link from 'next/link';
import { simplify } from '../lib/geojson.js';

/**
 * Singapore on the homepage, shaded by median HDB resale psf.
 *
 * WHY THIS AND NOT THE REAL MAP. /map is the most persuasive thing on this
 * site and it was reachable only from a nav item. But it is a client component
 * that ships about a megabyte of points, and putting that on the homepage
 * would make the slowest page the first one. So this is the same island, the
 * same boundaries and the same ramp, rendered to SVG on the server: no
 * JavaScript, no canvas, no fetch, in the HTML for a reader with scripts off
 * and for whatever crawls it. It is a picture of the data, and the tool it is
 * a picture of is one click away.
 *
 * WHAT IS DRAWN. URA's own Master Plan planning areas, the same file /map
 * fills its land from. Nothing is interpolated and no shape is invented —
 * rule 13. Areas are shaded only where an HDB town of that exact name has a
 * filed resale.
 *
 * WHAT IS NOT SHADED, AND WHY IT IS LEFT PLAIN. Two of the twenty-six HDB
 * towns have no planning area of the same name: HDB's Central Area spans
 * several, and Kallang/Whampoa straddles two. Both are left plain. Assigning
 * them by eye would be inventing an attribution the boundary file does not
 * carry, and it would be invisible once it was wrong. The rest of the plain
 * land — catchment, Tuas, the airport, Orchard and the reserves — is plain
 * because there is genuinely no HDB resale filed there. The caption says so;
 * an unexplained gap reads as missing data, and this is not missing.
 */

/* The ramp from PriceMap.jsx. One accent, six steps of it. */
const RAMP = ['#7AD3DC', '#45BECB', '#17A2B0', '#0A8089', '#065E66', '#03403F'];

/** Six equal-sized groups, not six equal price steps — the same choice /map
 *  makes, and for the same reason: on a min-max ramp a handful of expensive
 *  towns flatten every other one into a single shade. */
function quantileBreaks(values, bands = 6) {
  const v = [...values].sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < bands; i++) out.push(v[Math.floor((i / bands) * v.length)]);
  return out;
}

export default function IslandMap({ areas, towns, plotted, source }) {
  if (!areas?.length) return null;

  const psf = new Map(towns.map(t => [t.slug, t.medianPsf]));
  const shaded = towns.filter(t => areas.some(a => a.slug === t.slug));
  if (!shaded.length) return null;
  const breaks = quantileBreaks(shaded.map(t => t.medianPsf));
  const bandOf = v => { let b = 0; while (b < breaks.length && v > breaks[b]) b++; return b; };

  // Bounds from the geometry itself rather than a constant, so a re-ingest
  // that changes the coastline cannot leave the island cropped.
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const a of areas) for (const ring of a.rings) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  const W = 1000;
  // At 1.35°N a degree of longitude and a degree of latitude are within three
  // parts in ten thousand of each other, so the viewBox aspect alone keeps
  // this undistorted and no projection maths is needed.
  const H = Math.round(W * ((maxLat - minLat) / (maxLon - minLon)));
  const x = lon => (((lon - minLon) / (maxLon - minLon)) * W).toFixed(1);
  const y = lat => (((maxLat - lat) / (maxLat - minLat)) * H).toFixed(1);
  /**
   * Simplified again, on top of the ingest's own pass.
   *
   * scripts/ingest-boundaries resolves to about fifteen metres, which is right
   * for /map, where a reader can frame a single town and the coastline fills
   * the screen. Here the whole country is drawn at a thousand pixels and never
   * more — .islandsvg is width:100% inside a 1000px shell — so one pixel is
   * 0.0003° and anything finer than that is detail nobody can be shown.
   *
   * It is not cosmetic. App Router serialises a server component's output into
   * the RSC payload as well as rendering it, so every coordinate ships twice:
   * at the ingest's resolution the homepage was 215KB of HTML, most of it two
   * copies of a coastline drawn to a precision the page cannot display. This
   * halves the point count for a worst-case error under two pixels.
   */
  const pathOf = a => a.rings
    .map(r => simplify(r, 0.0005))
    .map(r => 'M' + r.map(([lon, lat]) => `${x(lon)},${y(lat)}`).join('L') + 'Z')
    .join('');

  const lo = Math.min(...shaded.map(t => t.medianPsf));
  const hi = Math.max(...shaded.map(t => t.medianPsf));
  const legend = [lo, ...breaks];

  return (
    <div className="island">
      <svg viewBox={`0 0 ${W} ${H}`} className="islandsvg" role="img"
        aria-label={`Map of Singapore's planning areas shaded by median HDB resale price per square foot, from $${lo} to $${hi}.`}>
        {areas.map(a => {
          const v = psf.get(a.slug);
          return (
            /* Unshaded land is --line, not --sunk. At #F5F7F9 on white the
               areas with no HDB were invisible, so the island read as a
               handful of coloured fragments floating in space rather than as
               a country with data on part of it. */
            <path key={a.slug} d={pathOf(a)} fillRule="evenodd"
              fill={v == null ? 'var(--line)' : RAMP[bandOf(v)]}
              stroke="var(--paper)" strokeWidth="1.1" strokeLinejoin="round" />
          );
        })}
      </svg>

      <div className="islandkey">
        <div className="islandramp">
          <span className="lab">Median HDB resale psf · six equal-sized groups</span>
          <div className="ramp" aria-hidden="true">
            {RAMP.map(c => <div className="step" key={c}><i style={{ background: c }} /></div>)}
          </div>
          {/* Ends only. Six break values in a column this narrow overlapped
              into each other, and a legend you have to decipher is worse than
              one that says less. The bands themselves are on /map. */}
          <div className="rampends"><span>${lo}</span><span>${hi}</span></div>
        </div>
        <Link href="/map" className="islandgo">
          Open the map{plotted ? ` — all ${plotted.toLocaleString('en-SG')} blocks and projects` : ''} →
        </Link>
      </div>

      <p className="prov islandprov">
        {shaded.length} of {towns.length} HDB towns shaded · {source} · land is URA
        Master Plan Planning Area Boundary (No Sea), via data.gov.sg.
        Grey areas have no filed HDB resale — Orchard, Tuas, the catchment and the
        reserves among them. Central Area and Kallang/Whampoa are grey for a
        different reason: neither is a single planning area, and splitting them by
        eye is not something the boundary file supports.
      </p>
    </div>
  );
}
