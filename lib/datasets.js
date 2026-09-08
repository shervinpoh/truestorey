/**
 * Every dataset this site is built from, how often its SOURCE publishes, and
 * why that interval is what it is.
 *
 * ── WHY THIS IS NOT IN scripts/ ────────────────────────────────────────────
 * It was, next to the loop that runs it. /methodology publishes the refresh
 * schedule, and a page that carries a hand-written copy of this table drifts
 * from the job that actually runs — which is the exact failure the site exists
 * to refuse. It lives here so the page and the scheduler read one list.
 *
 * scripts/sync.mjs is top-level executable code with no main(), so a page
 * cannot import from it without running a sync. Moving the data was the small
 * change; wrapping a working scheduler was not.
 */
export const JOBS = [
  { key: 'sora', file: 'sora.json', every: 1, cmd: 'npm run ingest:sora',
    why: 'MAS publishes SORA every business day' },
  /*
   * A REFRESH THAT LEAVES A DERIVED FILE BEHIND IS A REFRESH THAT MAKES THE
   * SITE DISAGREE WITH ITSELF.
   *
   * This ran ingest → index and stopped, while map.json and storey.json are
   * both built FROM index.json and were rebuilt by nothing on this schedule:
   * map.json only by the `boundaries` job, every 365 days, and storey.json by
   * no job at all. build-map.mjs says in its own header that the psf beside a
   * label is "read straight out of index.json, so the map and the tables can
   * never disagree" — true of one build, false across two schedules.
   *
   * test/map.test.js caught it at one dollar: BISHAN read $731 on the map and
   * $732 on /hdb. That gap only ever grows, and a map that quietly drifts from
   * the tables beside it is the exact failure this site exists not to commit.
   */
  /* EVERYTHING DERIVED FROM THE TRANSACTIONS REBUILDS HERE. comps, trend and
   * budget all read hdb.json and private.json — the two files this job
   * replaces — so leaving them out is the same bug the note above records,
   * with four more files in it: Blindspot would score against last month's
   * comparables, the size trend would stop at last month's year, and a budget
   * would be measured against prices that had moved. Silently, and passing
   * every test, because each file on its own is still valid. */
  /* WAS 7. Both feeds carry current-month rows — on 8 September the file held
     14 URA contracts and 422 HDB resales already filed for September, about 53
     HDB filings a day. A weekly pull therefore hid roughly 370 real
     transactions between runs, on a site whose whole position is that every
     figure carries its period. Daily is not theatre here: it moves the data.

     It is the expensive job — the chain below rebuilds index, shards, storey,
     map, comps, trend and budget — but the workflow commits only when data/
     actually changed, so a day the sources did not move costs CI minutes and
     nothing else. */
  { key: 'transactions', file: 'index.json', every: 1,
    cmd: 'npm run ingest:hdb && npm run ingest:ura && npm run index'
       + ' && npm run build:storey && npm run build:map'
       + ' && npm run build:comps && npm run build:trend && npm run build:budget',
    why: 'HDB and URA file new transactions continuously, with a lag of weeks' },
  { key: 'price-index', file: 'hdb-index.json', every: 80, cmd: 'npm run ingest:index',
    why: 'the resale price index is quarterly' },
  // URA's index is quarterly too, and it is the series /cost stress-tests a
  // private purchase against. Same 80 days as HDB's for the same reason: a
  // quarter is 91, and 80 catches the republication without asking twice.
  { key: 'ppi', file: 'ppi.json', every: 80, cmd: 'npm run ingest:ppi',
    why: 'URA\'s private residential price index is quarterly' },
  // build:map reads mop.json for HDB's published storey counts — the heights
  // the 3D blocks are extruded from — so refreshing the register without
  // rebuilding the map leaves the towers standing at last quarter's heights.
  { key: 'mop', file: 'mop.json', every: 80, cmd: 'npm run ingest:mop && npm run build:map',
    why: 'HDB Property Information changes a few times a year' },
  { key: 'amenities', file: 'amenities.json', every: 180, cmd: 'npm run ingest:amenities && npm run build:nearby',
    why: 'stations, schools and hawker centres barely move' },
  // build:rents is the other reader of rental.json — /cost compares the cost of
  // owning against what places like it actually let for, and a stale rent
  // would be quoted beside a fresh instalment.
  { key: 'rental', file: 'rental.json', every: 30,
    cmd: 'npm run ingest:rental && npm run build:yield && npm run build:rents',
    why: 'URA files rental contracts quarterly, but in rolling batches' },
  { key: 'boundaries', file: 'boundaries.json', every: 365, cmd: 'npm run ingest:boundaries && npm run build:map',
    why: 'the Master Plan is redrawn about every five years — this is a formality, not a refresh' },
  // URA awards a handful of sites a month and the sheet is republished as they
  // close. Fortnightly is faster than the source moves and slow enough not to
  // hammer a static file host.
  /* WAS 14. An award is an event, not a series: URA publishes a tender result
     within days of the close, and a fortnight's delay means the site is silent
     on the one thing an agent is asked about that week. Three days is short
     enough to catch a result while it is still being discussed and long enough
     not to re-download a spreadsheet for nothing. */
  { key: 'gls-awards', file: 'gls-awards.json', every: 3, cmd: 'npm run ingest:gls-awards',
    why: 'URA republishes the past-sites sheet as each tender is awarded' },
  /* WAS 30. Also event-driven — a planning approval matters most in the weeks
     after it is granted. Not daily: this one geocodes through OneMap and is
     rate-limited, which is why the workflow allows 45 minutes. */
  { key: 'planning', file: 'planning.json', every: 7, cmd: 'npm run ingest:planning',
    why: 'URA decides applications continuously and the current year grows all year' },
  { key: 'zoning', file: 'zoning.json', every: 365, cmd: 'npm run ingest:zoning',
    why: 'the Master Plan land use layer changes on the statutory review, not on a feed' },
  // gls is NOT here on purpose. data/sources/gls-programme.json is transcribed
  // by hand from URA's published programme, so there is nothing for a scheduler
  // to fetch — running the ingest would only re-geocode the same list. It goes
  // stale on a calendar and the ingest refuses a programme older than the
  // current half, which is the reminder.
];
