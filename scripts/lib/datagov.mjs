/**
 * data.gov.sg fetchers. No dependencies — this repo has three, and a KML
 * parser is not worth a fourth.
 *
 * Two APIs, because data.gov.sg has two kinds of dataset:
 *
 *   table  →  /api/action/datastore_search        rows, paginated
 *   geo    →  /v1/public/api/datasets/{id}/poll-download
 *             which returns a short-lived signed URL to a GeoJSON or KML file
 *
 * Both are wrapped so a caller gets the same shape back: an array of plain
 * objects, plus what was actually fetched, so the ingest can record source
 * and access date on every figure it later publishes.
 */

const UA = { 'User-Agent': 'truestorey/0.1 (+personal research)', Accept: 'application/json' };
const TIMEOUT = 30000;

/**
 * data.gov.sg rate-limits anonymous callers, and the probe walks six layers
 * back to back — which is precisely the shape that trips it. So every call in
 * this module goes through one gate, and a 429 is waited out rather than
 * treated as a broken dataset id. Their own message says "try again in 10
 * seconds", and that is what this does.
 */
const MIN_GAP = 1200;
let nextAt = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gate() {
  const wait = nextAt - Date.now();
  if (wait > 0) await sleep(wait);
  nextAt = Date.now() + MIN_GAP;
}

async function get(url, { json = true, attempt = 0 } = {}) {
  await gate();
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  if (res.status === 429) {
    if (attempt >= 4) {
      const e = new Error('rate limited by data.gov.sg after several waits — try again in a few minutes');
      e.status = 429; e.rateLimited = true;
      throw e;
    }
    const hinted = Number((text.match(/try again in (\d+) second/i) || [])[1]);
    const waitMs = (Number(res.headers.get('retry-after')) || hinted || 12) * 1000 * (attempt + 1);
    console.log(`    rate limited — waiting ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
    return get(url, { json, attempt: attempt + 1 });
  }
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} — ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }
  if (!json) return text;
  try { return JSON.parse(text); }
  catch { throw new Error(`not JSON — ${text.replace(/\s+/g, ' ').slice(0, 200)}`); }
}

/* ----------------------------------------------------------------- tables */

/**
 * Every row of a tabular dataset.
 *
 * The page size ADAPTS. A fixed 5,000 works for the MOE school directory,
 * whose rows are short, and fails outright on the ECDA preschool listing with
 * "Size of row data too large" — because the cap is on bytes returned, not on
 * row count, and ECDA rows are fat. Guessing a number that happens to suit one
 * dataset is how you get a pipeline that works until it meets a wider table.
 *
 * So: start optimistic, halve on a 413, and carry on at whatever size the
 * endpoint will actually serve.
 */
export async function fetchTable(id, { max = 100000, pageSize = 2000 } = {}) {
  const rows = [];
  let offset = 0;
  let limit = pageSize;
  for (;;) {
    const url = `https://data.gov.sg/api/action/datastore_search?resource_id=${encodeURIComponent(id)}&limit=${limit}&offset=${offset}`;
    let j;
    try {
      j = await get(url);
    } catch (e) {
      if (e.status === 413 && limit > 50) {
        limit = Math.max(50, Math.floor(limit / 4));
        console.log(`    rows too wide for that page size — retrying at ${limit} per page`);
        continue;
      }
      throw e;
    }
    const batch = j?.result?.records;
    if (!Array.isArray(batch)) throw new Error(`no records array (keys: ${Object.keys(j?.result || j || {}).join(', ')})`);
    rows.push(...batch);
    if (batch.length < limit || rows.length >= max) break;
    offset += batch.length;
  }
  return rows;
}

/* ------------------------------------------------------------- geospatial */

/**
 * Resolve a geospatial dataset to its signed download URL. data.gov.sg
 * prepares the file asynchronously, so this polls until the URL appears.
 */
export async function resolveDownload(id, { tries = 8, waitMs = 2000 } = {}) {
  const url = `https://api-open.data.gov.sg/v1/public/api/datasets/${encodeURIComponent(id)}/poll-download`;
  for (let i = 0; i < tries; i++) {
    const j = await get(url);
    const link = j?.data?.url || j?.url;
    if (link) return link;
    const code = j?.code ?? j?.data?.code;
    if (code != null && code !== 0 && code !== 3) {
      throw new Error(`poll-download returned code ${code}: ${j?.errorMsg || j?.data?.errorMsg || 'no url'}`);
    }
    await new Promise(r => setTimeout(r, waitMs));
  }
  throw new Error('poll-download never returned a url');
}

/** Points from a geospatial dataset, whether it arrives as GeoJSON or KML. */
export async function fetchGeo(id) {
  const link = await resolveDownload(id);
  const body = await get(link, { json: false });
  const trimmed = body.trimStart();
  if (trimmed.startsWith('{')) return featuresFromGeoJson(JSON.parse(body));
  if (/^<\?xml|<kml/i.test(trimmed)) return featuresFromKml(body);
  throw new Error(`downloaded file is neither GeoJSON nor KML (starts "${trimmed.slice(0, 60)}")`);
}

/* -------------------------------------------------------------- geometry */

/**
 * A representative point for any geometry. A hawker centre is a point; a park
 * is a polygon. For a polygon we take the centroid of its outer ring, which
 * for a park is roughly "the park" — good enough to say a park is nearby, and
 * deliberately not presented as a distance to a specific gate.
 */
export function representativePoint(geom) {
  if (!geom) return null;
  const t = geom.type;
  const c = geom.coordinates;
  if (t === 'Point') return { lon: +c[0], lat: +c[1] };
  if (t === 'MultiPoint' || t === 'LineString') return ringCentre(c);
  if (t === 'Polygon') return ringCentre(c[0]);
  if (t === 'MultiPolygon') return ringCentre(c[0]?.[0]);
  if (t === 'MultiLineString') return ringCentre(c[0]);
  if (t === 'GeometryCollection') {
    for (const g of geom.geometries || []) { const p = representativePoint(g); if (p) return p; }
  }
  return null;
}

function ringCentre(ring) {
  if (!Array.isArray(ring) || !ring.length) return null;
  let lon = 0, lat = 0, n = 0;
  for (const p of ring) {
    if (!Array.isArray(p) || !Number.isFinite(+p[0]) || !Number.isFinite(+p[1])) continue;
    lon += +p[0]; lat += +p[1]; n++;
  }
  return n ? { lon: lon / n, lat: lat / n } : null;
}

/* -------------------------------------------------------------- GeoJSON */

function featuresFromGeoJson(j) {
  const feats = j?.features;
  if (!Array.isArray(feats)) throw new Error('GeoJSON has no features array');
  return feats.map(f => {
    const pt = representativePoint(f.geometry);
    const props = { ...(f.properties || {}) };
    // Master Plan and several NParks layers hide their real attributes in an
    // HTML table inside Description. Unpack it, but never let it clobber a
    // real top-level property.
    if (props.Description || props.description) {
      const inner = parseHtmlAttrs(props.Description || props.description);
      for (const [k, v] of Object.entries(inner)) if (!(k in props)) props[k] = v;
    }
    return pt ? { ...props, lat: pt.lat, lon: pt.lon } : null;
  }).filter(Boolean);
}

/**
 * data.gov.sg wraps attributes in a little HTML table:
 *   <th>NAME</th> <td>BISHAN MRT STATION</td>
 * Regex is the right tool here — it is a machine-generated fragment with a
 * fixed shape, not arbitrary HTML.
 */
export function parseHtmlAttrs(html) {
  const out = {};
  const s = String(html || '');
  const re = /<th[^>]*>\s*([^<]+?)\s*<\/th>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>/gi;
  let m;
  while ((m = re.exec(s))) {
    const k = m[1].trim();
    const v = m[2].replace(/<[^>]*>/g, '').trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ KML */

function featuresFromKml(xml) {
  const out = [];
  const re = /<Placemark\b[\s\S]*?<\/Placemark>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const pm = m[0];
    const props = parseKmlData(pm);
    const nameTag = /<name[^>]*>([\s\S]*?)<\/name>/i.exec(pm);
    if (nameTag && !props.NAME) props.NAME = stripCdata(nameTag[1]).trim();
    const desc = /<description[^>]*>([\s\S]*?)<\/description>/i.exec(pm);
    if (desc) for (const [k, v] of Object.entries(parseHtmlAttrs(stripCdata(desc[1])))) if (!(k in props)) props[k] = v;
    const pt = kmlPoint(pm);
    if (pt) out.push({ ...props, lat: pt.lat, lon: pt.lon });
  }
  if (!out.length) throw new Error('KML had no placemarks with coordinates');
  return out;
}

const stripCdata = s => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

function parseKmlData(pm) {
  const out = {};
  const re = /<(?:SimpleData|Data)\b[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:SimpleData|Data)>/gi;
  let m;
  while ((m = re.exec(pm))) {
    const v = stripCdata(m[2]).replace(/<[^>]*>/g, '').trim();
    if (v) out[m[1]] = v;
  }
  return out;
}

function kmlPoint(pm) {
  const c = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i.exec(pm);
  if (!c) return null;
  const pairs = c[1].trim().split(/\s+/).map(p => p.split(',')).filter(p => p.length >= 2);
  if (!pairs.length) return null;
  let lon = 0, lat = 0, n = 0;
  for (const p of pairs) {
    const x = +p[0], y = +p[1];
    if (Number.isFinite(x) && Number.isFinite(y)) { lon += x; lat += y; n++; }
  }
  return n ? { lon: lon / n, lat: lat / n } : null;
}
