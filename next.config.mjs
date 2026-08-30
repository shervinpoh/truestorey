/**
 * Three settings, all load-bearing.
 *
 * largePageDataBytes — the map ships about a megabyte of points to the client
 * on purpose. Next warns below this and the warning is noise here, not a
 * signal.
 *
 * outputFileTracingIncludes — THE ONE THAT BITES ON DEPLOY. Next works out
 * which files a serverless function needs by following imports statically. The
 * data layer reads `path.join(process.cwd(), 'data', f)` with `f` computed at
 * runtime, which the tracer cannot see, so on Vercel the datasets are simply
 * absent from the bundle. Everything works locally, where the whole repo is on
 * disk, and /api/ai/blindspot returns "No record at that address" in
 * production for every input.
 *
 * The globs below say: whatever else you strip, these functions need the data.
 *
 * outputFileTracingExcludes — THE OTHER HALF OF THE SAME PROBLEM. Because the
 * tracer cannot resolve that runtime `f`, @vercel/nft falls back to the safe
 * assumption and pulls in the WHOLE of data/ — 155MB into every function,
 * which is why each route traced an identical file count no matter what the
 * includes above listed. Vercel's uncompressed limit is 250MB, so this shipped,
 * with two thirds of the budget spent on files no request ever opens.
 *
 * Everything excluded below was checked against lib/, app/ and components/
 * first. The three big ones are ingest OUTPUT, not site input: build-index,
 * build-storey and build-yield read them in scripts/ and write the shards the
 * site actually serves. Storey.jsx names hdb.json and private.json in its
 * header comment, which is what makes a plain grep say they are used — it is a
 * 'use client' component and cannot open a file at all.
 *
 * If a runtime reader is ever added for one of these, delete its line here.
 * The symptom would be a feature that works in dev and 404s in production,
 * which is the same failure the includes above exist to prevent.
 */
const nextConfig = {
  experimental: { largePageDataBytes: 512 * 1000 },

  outputFileTracingExcludes: {
    '**': [
      // Raw ingest output. Read only by scripts/, at build time.
      './data/private.json',      // 37.2MB
      './data/hdb.json',          // 19.5MB
      './data/rental.json',       // 15.0MB
      './data/geocache.json',     //  6.0MB — OneMap lookups, replayed by scripts/geocode
      './data/records.json',      // superseded by the per-shard files in records/
      // Diagnostics and scratch. Kept so a parse failure can be read back.
      './data/.boundaries-raw.geojson',
      // 135MB. Gitignoring it does nothing here — the tracer reads the disk,
      // not the index — and leaving it out of this list took the blindspot
      // function from 75.6MB to 222.5MB against a 250MB ceiling.
      './data/.zoning-raw.geojson',
      // Same again for the URA planning download. Gitignoring a raw file and
      // forgetting this list has now happened twice; if you add an ingest that
      // saves its raw download, it belongs here in the same commit.
      './data/.planning-raw.json',
      './data/.onemap-pace.json',
      './data/.brief-state.json',
      './data/brief-latest.md',
      // The analytics log. api/track APPENDS to this and creates it when
      // absent, so excluding it costs nothing — and shipping it would bake
      // real visitor session ids and paths into the deployment artifact.
      './data/events.jsonl',
    ],
  },

  outputFileTracingIncludes: {
    // Blindspot reads records, geocodes and the MOP register at request time.
    '/api/ai/blindspot': [
      './data/records/**',
      './data/geo.json',
      './data/mop.json',
      './data/index.json',
      './data/gls.json',
      './data/zoning.json',
    ],
    // Search, lookup and the record API all read the shards.
    '/api/search': ['./data/search.json', './data/index.json'],
    '/api/lookup': ['./data/index.json'],
    '/api/record': ['./data/records/**', './data/index.json'],
    '/api/catalogue': ['./data/index.json'],
    // A watch is refused unless the block exists, and recordByHref reads a
    // shard by a path built at request time — the exact pattern the tracer
    // cannot follow. Without this the route rejects every real address in
    // production with "not a block this site holds transactions for", and
    // works perfectly in dev.
    '/api/watch': ['./data/records/**', './data/index.json'],
    // /compare resolves its records from ?a=&b=&c= at request time, so it is a
    // dynamic route reading the same shards /api/record does. Without this it
    // renders "could not be found" for every address in production and works
    // perfectly in dev, which is the failure this whole map exists to prevent.
    '/compare': ['./data/records/**', './data/index.json'],
    // An article rendered on demand needs the guides and insights readers.
    '/insights/[slug]': ['./content/**'],
    '/studio': ['./content/**'],
  },
};

export default nextConfig;
