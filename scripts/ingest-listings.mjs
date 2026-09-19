/**
 * Fold new listings exports into the store, from the command line.
 *
 *   drop CSVs into data/listings/, then ONE of:
 *     npm run ingest:listings -- --full      they cover everything you watch
 *     npm run ingest:listings -- --partial   one town, one saved search, a subset
 *
 * The panel's Data page does the same thing with a preview first, and is the
 * easier door. Both call lib/consult/imports.js, so they cannot disagree.
 *
 * ── THERE IS NO DEFAULT, ON PURPOSE ────────────────────────────────────────
 * Full or partial decides whether anything absent is marked gone. It used to
 * default to full, which is the dangerous direction: a filtered export run as
 * full retires every listing it did not cover, and that looks exactly like a
 * market signal.
 *
 * Only files not yet imported are read; each is moved to data/listings/
 * imported/ afterwards. See the header of lib/consult/imports.js for the bug
 * that makes this necessary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { importListings, pendingListingFiles, archiveListingFiles, paths } from '../lib/consult/imports.js';

const full = process.argv.includes('--full');
const partialFlag = process.argv.includes('--partial');
if (full === partialFlag) {
  console.error('Say which: --full (covers everything you watch) or --partial (a subset).\n'
    + 'Only a full sweep marks listings gone, and guessing wrong looks like a market signal.');
  process.exit(1);
}

const { listingsDir } = paths();
const names = pendingListingFiles();
if (!names.length) {
  console.error(`No new CSVs in ${listingsDir}/ — already-imported files live in imported/.\n`
    + 'The three columns it cannot work without: an address, an asking price, a floor area.');
  process.exit(1);
}

const at = new Date().toISOString();
const files = names.map(n => ({ name: n, text: fs.readFileSync(path.join(listingsDir, n), 'utf8') }));
const r = importListings({ files, partial: partialFlag, at });
if (!r.ok) { console.error(`Not imported. ${r.reason}`); process.exit(1); }

archiveListingFiles(names, { at });
console.log(`Imported ${names.length} file(s) as one ${partialFlag ? 'partial' : 'full'} snapshot, and archived them.`);
console.log(`  ${r.added} new · ${r.cut} cut · ${r.raised} raised · ${partialFlag ? 'nothing marked gone (partial)' : `${r.gone} gone`}`);
console.log(`  ${r.active.toLocaleString()} active of ${r.known.toLocaleString()} known · ${r.snapshots} snapshot(s)`);
if (!partialFlag && r.goneShare > 0.5) {
  console.log(`\n  ${(100 * r.goneShare).toFixed(0)}% of what was active is now gone. That is more likely a narrower`);
  console.log('  export than a market that emptied in a week — check it was a full sweep.');
}
if (r.first) {
  console.log('\n  First snapshot. Days on market starts from today for everything in it, until a feed');
  console.log('  supplies each listing\'s own listed date.');
}
