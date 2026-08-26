import test from 'node:test';
import assert from 'node:assert/strict';
import { attrsFromDescription, ringsOf, simplify, centroid } from '../lib/geojson.js';
import { buildAreas, nameOf } from '../scripts/ingest-boundaries.mjs';

/* The boundary ingest needs a network connection, so the geometry is tested
 * against fixtures. What is being protected is the shape of the source: URA
 * ships its attributes as an HTML table inside a GeoJSON property, and a
 * silent parse failure there produces a map of areas all called "kml_1". */

const desc = `<center><table><tr><th>PLN_AREA_N</th> <td>BISHAN</td></tr>
  <tr><th>PLN_AREA_C</th> <td>BS</td></tr>
  <tr><th>REGION_N</th> <td>CENTRAL REGION</td></tr></table></center>`;

test('attributes are read out of the HTML table URA hides them in', () => {
  const a = attrsFromDescription(desc);
  assert.equal(a.PLN_AREA_N, 'BISHAN');
  assert.equal(a.REGION_N, 'CENTRAL REGION');
});

test('attributes are also read when the row uses two plain cells', () => {
  // The same publisher ships both markups. The first version of this parser
  // only handled <th>/<td> and every feature came back nameless, which failed
  // the whole ingest with no clue as to why.
  const a = attrsFromDescription('<table><tr><td>PLN_AREA_N</td><td>TAMPINES</td></tr></table>');
  assert.equal(a.PLN_AREA_N, 'TAMPINES');
});

test('a missing or malformed description yields nothing rather than throwing', () => {
  assert.deepEqual(attrsFromDescription(null), {});
  assert.deepEqual(attrsFromDescription('<table><tr><td>orphan</td></tr></table>'), {});
});

test('a name is found however the publisher stored it', () => {
  assert.equal(nameOf({ PLN_AREA_N: 'BISHAN' }), 'BISHAN', 'flat property');
  assert.equal(nameOf({ Name: 'kml_1', Description: desc }), 'BISHAN', 'HTML table');
  assert.equal(nameOf({ Name: 'kml_1', Description: '<table><tr><td>PLN_AREA_N</td><td>YISHUN</td></tr></table>' }), 'YISHUN', 'two-cell table');
  assert.equal(nameOf({ Name: 'PUNGGOL' }), 'PUNGGOL', 'plain Name');
  assert.equal(nameOf({ Name: 'kml_1' }), null, 'a placemark id is not a name');
  assert.equal(nameOf({}), null);
});

test('a GeometryCollection gives up its rings too', () => {
  const square = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
  const rings = ringsOf({
    type: 'GeometryCollection',
    geometries: [{ type: 'Polygon', coordinates: [square] }, { type: 'MultiPolygon', coordinates: [[square]] }],
  });
  assert.equal(rings.length, 2);
});

test('both Polygon and MultiPolygon give up their outer rings', () => {
  const square = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
  assert.equal(ringsOf({ type: 'Polygon', coordinates: [square] }).length, 1);
  assert.equal(ringsOf({ type: 'MultiPolygon', coordinates: [[square], [square]] }).length, 2);
  assert.deepEqual(ringsOf({ type: 'Point', coordinates: [0, 0] }), []);
  assert.deepEqual(ringsOf(null), []);
});

test('simplify drops collinear detail and keeps the corners', () => {
  // A straight run of points with one real corner in it.
  const line = [[0, 0], [0.1, 0], [0.2, 0], [0.3, 0], [0.3, 0.3], [0.3, 0.6]];
  const out = simplify(line, 0.001);
  assert.ok(out.length < line.length, 'nothing was simplified away');
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [0.3, 0.6]);
  assert.ok(out.some(p => p[0] === 0.3 && p[1] === 0), 'the corner was smoothed away');
});

test('simplify never returns fewer than the endpoints, and short rings pass through', () => {
  assert.equal(simplify([[0, 0], [1, 1]], 10).length, 2);
  assert.deepEqual(simplify([], 0.1), []);
});

test('the centroid is the area centroid, not the average vertex', () => {
  // A square with a crowd of extra points along one edge. A vertex average is
  // dragged toward that edge; the shoelace centroid stays in the middle.
  const ring = [[0, 0], [0.1, 0], [0.2, 0], [0.3, 0], [0.4, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const [x, y] = centroid(ring);
  assert.ok(Math.abs(x - 0.5) < 0.02, `centroid x drifted to ${x}`);
  assert.ok(Math.abs(y - 0.5) < 0.02, `centroid y drifted to ${y}`);
});

test('a degenerate ring falls back instead of dividing by zero', () => {
  const c = centroid([[1, 1], [1, 1], [1, 1]]);
  assert.ok(Number.isFinite(c[0]) && Number.isFinite(c[1]));
});

/* ── the ingest's own mapping ────────────────────────────────────────────── */

const feature = (description, name = 'kml_1') => ({
  type: 'Feature',
  properties: { Name: name, Description: description },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [103.84, 1.35, 0], [103.85, 1.35, 0], [103.86, 1.35, 0], [103.86, 1.36, 0],
      [103.86, 1.37, 0], [103.85, 1.37, 0], [103.84, 1.37, 0], [103.84, 1.36, 0], [103.84, 1.35, 0],
    ]],
  },
});

test('an area takes its name from URA\'s field, never from the KML placemark id', () => {
  const { areas } = buildAreas({ features: [feature(desc)] });
  assert.equal(areas.length, 1);
  assert.equal(areas[0].name, 'BISHAN');
  assert.equal(areas[0].slug, 'bishan');
});

test('a feature with no usable name is dropped, not published as kml_1', () => {
  const { areas, dropped } = buildAreas({ features: [feature('<table></table>')] });
  assert.equal(areas.length, 0);
  assert.equal(dropped, 1);
});

test('the altitude ordinate is discarded and coordinates come back as pairs', () => {
  const { areas } = buildAreas({ features: [feature(desc)] });
  for (const ring of areas[0].rings) for (const p of ring) assert.equal(p.length, 2);
});

test('the centroid is stored lat-first, the way every other coordinate on this site is', () => {
  const { areas } = buildAreas({ features: [feature(desc)] });
  const [lat, lon] = areas[0].centroid;
  assert.ok(lat > 1.2 && lat < 1.5, `latitude came back as ${lat} — lat/lon are swapped`);
  assert.ok(lon > 103.5 && lon < 104.1, `longitude came back as ${lon} — lat/lon are swapped`);
});
