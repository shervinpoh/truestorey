/**
 * Web Mercator tile arithmetic, for putting a real basemap under the price map.
 *
 * ── WHY THIS IS SAFE ON A PROJECTION THAT IS NOT MERCATOR ──────────────────
 * PriceMap projects linearly in lat/lon — an equirectangular fit to the
 * island's bounding box — and OneMap serves Web Mercator tiles. Overlaying one
 * on the other is normally wrong, and here it is not, because Singapore sits on
 * the equator and spans 0.22 degrees of latitude. Mercator's vertical stretch
 * over that span differs from a linear one by 0.028%, which on a 900px-tall map
 * is a worst-case offset of ONE HUNDREDTH OF A PIXEL.
 *
 * That is measured, not assumed — the numbers are reproducible from the two
 * formulae below. It is also the reason this file must never be reused for a
 * map of anywhere else: the same trick at 50 degrees north is off by miles.
 *
 * ── WHY NOT A MAP LIBRARY ──────────────────────────────────────────────────
 * Three npm dependencies is the architecture. A tile is a 256px PNG at a URL
 * computed from three integers; drawing a grid of them onto a canvas is thirty
 * lines. Leaflet or MapLibre would bring a projection engine, an interaction
 * model and a renderer, all of which this map already has and none of which it
 * needs twice.
 */

const TILE = 256;

/** Which tile column a longitude falls in, at zoom z. Fractional. */
export const lonToTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;

/** Which tile row a latitude falls in, at zoom z. Fractional. */
export function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

export const tileXToLon = (x, z) => (x / 2 ** z) * 360 - 180;
export function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * The zoom whose tiles are closest to 1:1 with the pixels on screen.
 *
 * Picking too low blurs; too high fetches four times the tiles for detail
 * nobody can see. Clamped to what OneMap actually serves — asking for z20 of
 * a country that stops at 19 returns nothing and leaves a blank map with no
 * error anywhere.
 */
export const MIN_Z = 11;
export const MAX_Z = 18;
export function zoomFor(view, widthPx) {
  const [, west, , east] = view;
  if (!(east > west) || !(widthPx > 0)) return MIN_Z;
  // Tiles across the view at zoom z is (east-west)/360 * 2^z; we want that
  // times 256 to be about the pixel width.
  const z = Math.log2((widthPx / TILE) / ((east - west) / 360));
  return Math.max(MIN_Z, Math.min(MAX_Z, Math.round(z)));
}

/**
 * Every tile touching the view, with the lat/lon box each one covers.
 *
 * The caller projects those corners with its OWN projection, which is what
 * keeps this honest: the tiles land wherever the map's own maths says they
 * should, so the basemap and the data can never drift apart.
 *
 * Capped, because a wrong zoom or a degenerate view would otherwise ask for
 * thousands of images at once.
 */
export const MAX_TILES = 120;
export function tilesFor(view, widthPx) {
  const [south, west, north, east] = view;
  const z = zoomFor(view, widthPx);
  const n = 2 ** z;
  const x0 = Math.floor(lonToTileX(west, z));
  const x1 = Math.ceil(lonToTileX(east, z));
  const y0 = Math.floor(latToTileY(north, z));   // north is the SMALLER y
  const y1 = Math.ceil(latToTileY(south, z));

  const out = [];
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;   // off the world
      if (out.length >= MAX_TILES) return out;
      out.push({
        z, x, y,
        north: tileYToLat(y, z), south: tileYToLat(y + 1, z),
        west: tileXToLon(x, z), east: tileXToLon(x + 1, z),
      });
    }
  }
  return out;
}

/**
 * OneMap's own basemap, which is SLA's cartography of Singapore.
 *
 * Deliberately not a global tile vendor: this site refuses to draw geometry
 * its data does not contain, and a basemap of Singapore drawn by the national
 * mapping agency is the version of that rule applied to the background as well
 * as the foreground. Grey rather than Default — the coloured layer competes
 * with the price bands, and the map is about the prices.
 *
 * Attribution is required by OneMap's terms and is rendered beside the map.
 */
export const BASEMAP = {
  layer: 'Grey',
  url: ({ z, x, y }) => `https://www.onemap.gov.sg/maps/tiles/Grey/${z}/${x}/${y}.png`,
  credit: 'Basemap © OneMap, Singapore Land Authority',
  href: 'https://www.onemap.gov.sg/',
};
