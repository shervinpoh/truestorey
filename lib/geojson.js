/**
 * Just enough geometry to draw Singapore, with no map library in the repo.
 *
 * The map's whole claim is that it depends on nothing outside this repo — no
 * tiles, no basemap host, no Leaflet. Adding a mapping library to draw a
 * coastline would trade that away for one feature. These are the four
 * functions that make it unnecessary, and they are here rather than in the
 * ingest script so they can be tested without a network.
 */

/**
 * URA's GeoJSON carries its attributes as an HTML table inside a Description
 * property, and it does not always use the same markup.
 *
 * Seen in the wild, all from the same publisher:
 *   <tr><th>PLN_AREA_N</th><td>BISHAN</td></tr>     header cell then value
 *   <tr><td>PLN_AREA_N</td><td>BISHAN</td></tr>     two plain cells
 *
 * The first version of this only matched the first form, which meant every
 * feature came back nameless and the whole ingest reported "no usable areas" —
 * a total failure from a markup difference. Both are matched now, and the
 * caller checks flat properties first anyway, so this is the third line of
 * defence rather than the only one.
 */
export function attrsFromDescription(html) {
  const out = {};
  const src = String(html || '');
  const re = /<(th|td)[^>]*>\s*([A-Za-z0-9_.]+)\s*<\/\1>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(src))) {
    const key = m[2].trim();
    const value = m[3].replace(/<[^>]*>/g, '').trim();
    // A two-cell row whose "key" is itself a value would overwrite a real one,
    // so the first occurrence of a key wins.
    if (key && !(key in out)) out[key] = value;
  }
  return out;
}

/**
 * Every outer ring in a geometry. Polygon, MultiPolygon and GeometryCollection
 * all appear in Singapore's open geospatial data, sometimes in the same file.
 */
export function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates?.[0]].filter(Boolean);
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).map(p => p?.[0]).filter(Boolean);
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).flatMap(ringsOf);
  return [];
}

/**
 * Douglas–Peucker. Singapore's planning areas ship at a resolution meant for
 * planning documents — well over a megabyte of coordinates that no screen can
 * resolve. Simplifying to roughly 15 metres keeps every recognisable inlet and
 * drops the rest.
 *
 * Perpendicular distance is computed in degrees, which is not metres — at
 * 1.35°N a degree of longitude and a degree of latitude differ by 0.03%, far
 * below the tolerance itself, so the error is irrelevant here and the
 * alternative is a projection this file does not need.
 */
export function simplify(points, tolerance = 0.00015) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const sqTol = tolerance * tolerance;

  const sqSegDist = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };

  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = sqTol, index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxSq) { maxSq = d; index = i; }
    }
    if (index > -1) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Area centroid, for placing a name.
 *
 * The shoelace centroid, not the average of the vertices: a coastline with
 * hundreds of points along one bay and a straight line along the other side
 * drags a vertex average into the water. Degenerate rings fall back to the
 * vertex mean rather than dividing by zero.
 */
export function centroid(ring) {
  if (!ring?.length) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (a === 0) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}
