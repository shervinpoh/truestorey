/**
 * Where this block actually is, among the blocks around it.
 *
 * WHY A RECORD PAGE NEEDED ONE. It opened with a large psf figure and then
 * became a ledger. Every fact on it was true and none of it said WHERE — a
 * reader arriving from a search had a number, a street name and no sense of
 * place at all. This is the cheapest honest fix: the planning area the town is
 * named for, every block in that town as a dot, and this one lit.
 *
 * ── EVERYTHING HERE IS PUBLISHED GEOMETRY OR A PUBLISHED COORDINATE ─────────
 * The outline is URA's own Master Plan planning area. The dots are OneMap
 * geocodes of real addresses. Nothing is interpolated, no street is drawn, and
 * no radius is implied — rule 13, and rule 10, which is why there is no
 * distance or walking time on it either.
 *
 * A BLOCK WITH NO COORDINATE RENDERS NOTHING. Rule 12: a coordinate below
 * street-grade confidence is not published, so a record without one gets no
 * map rather than a map with a guess at the middle of the town.
 *
 * TWO OF TWENTY-SIX TOWNS HAVE NO OUTLINE, on purpose. HDB's Central Area
 * spans several planning areas and Kallang/Whampoa straddles two, so neither
 * name matches one — the same join IslandMap documents. They get the dots and
 * no outline, which is honest; picking an area by eye would be an attribution
 * the boundary file does not carry.
 *
 * Server component. An SVG of a few hundred points needs no JavaScript, and a
 * record page is the last place to spend any.
 */
export default function Locator({ area, points = [], here, label }) {
  if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lon)) return null;

  // Frame on the town, not the island — a dot inside Singapore locates nothing.
  const lats = [here.lat, ...points.map(p => p.lat)];
  const lons = [here.lon, ...points.map(p => p.lon)];
  for (const ring of area?.rings || []) for (const [lon, lat] of ring) { lats.push(lat); lons.push(lon); }

  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLon = Math.min(...lons), maxLon = Math.max(...lons);
  // A town with one plotted block would otherwise have zero extent.
  const padLat = Math.max((maxLat - minLat) * 0.08, 0.002);
  const padLon = Math.max((maxLon - minLon) * 0.08, 0.002);
  minLat -= padLat; maxLat += padLat; minLon -= padLon; maxLon += padLon;

  const W = 640;
  // At 1.35°N a degree of longitude and one of latitude are within three parts
  // in ten thousand of each other, so the viewBox aspect keeps this undistorted.
  const H = Math.round(W * ((maxLat - minLat) / (maxLon - minLon)));
  const x = lon => (((lon - minLon) / (maxLon - minLon)) * W).toFixed(1);
  const y = lat => (((maxLat - lat) / (maxLat - minLat)) * H).toFixed(1);

  const path = (area?.rings || [])
    .map(r => 'M' + r.map(([lon, lat]) => `${x(lon)},${y(lat)}`).join('L') + 'Z')
    .join('');

  return (
    <figure className="locator">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${label} shown among ${points.length} other blocks in the same town.`}>
        {path && <path d={path} fill="var(--line2)" stroke="var(--line)" strokeWidth="1.2"
          strokeLinejoin="round" />}
        {points.map(p => (
          <circle key={p.href} cx={x(p.lon)} cy={y(p.lat)} r="2.4" className="near" />
        ))}
        {/* Drawn last so it is never painted under a neighbour. */}
        <circle cx={x(here.lon)} cy={y(here.lat)} r="6" className="here" />
      </svg>
      <figcaption className="prov">
        {/* One line, deliberately. A line break between the word and the
            plural expression is whitespace to JSX, and it rendered "346
            block s". */}
        {label} among {points.length.toLocaleString('en-SG')} {points.length === 1 ? 'block' : 'blocks'} in the same town.
        {path
          ? ' Outline: URA Master Plan planning area. '
          : ' No planning area carries this town’s name, so no outline is drawn. '}
        Positions: OneMap. No distance or route is shown — only where things are.
      </figcaption>
    </figure>
  );
}
