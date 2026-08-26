/**
 * WHERE EVERY AMENITY LAYER COMES FROM.
 *
 * This is the amenities equivalent of lib/calc/constants.js: one file, so a
 * dataset id that has moved is a one-line fix instead of a hunt through an
 * ingest script. Nothing else in the repo may hardcode a dataset id.
 *
 * Two things to understand before editing:
 *
 * 1. data.gov.sg serves TABULAR and GEOSPATIAL datasets through different
 *    APIs. Tabular ("datastore") datasets answer datastore_search and give
 *    you rows — usually with a postal code and no coordinates, so they need
 *    geocoding. Geospatial datasets answer a poll-download endpoint that
 *    hands back a signed URL to a GeoJSON or KML file, which already carries
 *    coordinates. `mode` picks which path a layer takes.
 *
 * 2. THE IDS BELOW ARE UNVERIFIED FROM THIS MACHINE. They were written
 *    without a network connection to data.gov.sg. Run
 *
 *        npm run probe:amenities
 *
 *    before trusting any of them. The probe reports, per layer, what the
 *    endpoint actually returned and which columns came back — the same
 *    diagnostic loop that sorted out SORA. Fix the id here, re-probe, move on.
 *    An id that turns out to be wrong is a five-minute problem; a layer that
 *    silently publishes the wrong coordinates is not, which is why the ingest
 *    refuses a layer whose shape it does not recognise rather than guessing.
 */

/** Bare-name search terms are useless to geocode; these get the layer appended. */
export const LAYERS = {
  /* ------------------------------------------------------------------ rail */
  rail: {
    label: 'MRT / LRT stations',
    mode: 'geo',
    // LTA MRT Station Exit. Probed 22 Aug 2026: 613 features, keys
    // OBJECTID / STATION_NA / EXIT_CODE / INC_CRC / FMEL_UPD_D / lat / lon.
    //
    // These are EXITS, not stations — a big interchange contributes a dozen
    // points. That is better raw material than a station centroid, because
    // the exit is the thing you actually walk to, but it means the join has
    // to collapse them: see `dedupe` below, without which a Bishan block
    // would list Bishan three times and no other station.
    //
    // The cost is that this layer carries no line code and no planned
    // stations. An earlier guess at a URA Master Plan layer, which would have
    // had both, 404s — it was an invented id and is gone. Planned lines
    // therefore come only from data/sources/rail-future.json.
    id: 'd_b39d3a0871985372d7e1637193335da5',
    name: ['STATION_NA', 'STN_NAM_DE', 'STN_NAME', 'NAME', 'Name'],
    extra: { exit: ['EXIT_CODE'], line: ['RAIL_LINE', 'LINE'], status: ['STATUS'],
             opening: ['OPENING', 'OPENING_YEAR', 'YEAR'] },
    attribution: 'Station exit locations — LTA (data.gov.sg), under the Singapore Open Data Licence.',
    within: 2000,
    dedupe: 'station',      // collapse exits to one entry per station, nearest wins
    curated: 'rail-future.json',
  },

  /* --------------------------------------------------------------- schools */
  schools: {
    label: 'Schools',
    mode: 'table',
    // MOE School Directory and Information. Rows carry postal_code but no
    // coordinates, so every school is geocoded through OneMap once.
    id: 'd_688b934f82c1059ed0a6993d2a829089',
    name: ['school_name'],
    postal: ['postal_code'],
    extra: { level: ['mainlevel_code'], type: ['type_code'], nature: ['nature_code'], url: ['url_address'] },
    attribution: 'School addresses — MOE School Directory and Information (data.gov.sg), under the Singapore Open Data Licence.',
    within: 2000,
  },

  /* -------------------------------------------------------------- hawker */
  hawker: {
    label: 'Hawker centres',
    mode: 'geo',
    id: 'd_4a086da0a5553be1d89383cd90d07ecd',
    name: ['NAME', 'Name', 'ADDRESSBUILDINGNAME'],
    extra: { stalls: ['NO_OF_FOOD_STALLS'], status: ['STATUS'] },
    attribution: 'Hawker centre locations — NEA (data.gov.sg), under the Singapore Open Data Licence.',
    within: 1500,
  },

  /* ---------------------------------------------------------------- parks */
  parks: {
    label: 'Parks',
    mode: 'geo',
    id: 'd_0542d48f0991541706b58059381a6eca',
    name: ['NAME', 'Name', 'PARK_NAME'],
    // The NParks layer is 461 entries, of which 137 are playgrounds ("PG",
    // "PLAYGROUND") and 17 are open space ("OS"). Every HDB block has a
    // playground within a two-minute walk, so telling someone their nearest
    // park is a playground 80m away is not information — it is the absence of
    // it dressed up as a row. An amenity everybody has is not an amenity.
    //
    // "INTERIM" marks temporary green space pending development, which is
    // exactly the thing not to put on a page about where to live.
    exclude: /\b(PG|PLAYGROUND|OS|INTERIM)\b/i,
    attribution: 'Park locations — NParks (data.gov.sg), under the Singapore Open Data Licence.',
    within: 1500,
  },

  /* ------------------------------------------------------------ childcare */
  childcare: {
    label: 'Preschools',
    mode: 'table',
    // ECDA listing of centres. Postal code present, coordinates not.
    id: 'd_696c994c50745b079b3684f0e90ffc53',
    name: ['centre_name', 'name'],
    postal: ['postal_code', 'centre_postal_code'],
    extra: { type: ['centre_type', 'service_model'] },
    attribution: 'Preschool locations — ECDA (data.gov.sg), under the Singapore Open Data Licence.',
    within: 1000,
  },

  /* ---------------------------------------------------------------- malls */
  malls: {
    label: 'Malls',
    // No agency publishes a shopping-mall register, so there is no dataset id
    // to be right or wrong about. This layer is curated by hand or it is
    // absent — and absent is a perfectly good state. See the curated file's
    // header for the schema; names alone are enough, the geocoder resolves
    // the coordinates.
    mode: 'curated',
    curated: 'malls.json',
    attribution: 'Mall locations — compiled by hand, geocoded through OneMap.',
    within: 1500,
  },
};

/** Layers shown on a record page, in the order they appear. */
export const ORDER = ['rail', 'schools', 'hawker', 'parks', 'childcare', 'malls'];

/** Read a value from a row, trying each candidate column in turn. */
export function pick(row, keys) {
  if (!keys) return null;
  for (const k of keys) {
    for (const actual of Object.keys(row)) {
      if (actual.toLowerCase() === k.toLowerCase()) {
        const v = row[actual];
        if (v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'na') {
          return String(v).trim();
        }
      }
    }
  }
  return null;
}
