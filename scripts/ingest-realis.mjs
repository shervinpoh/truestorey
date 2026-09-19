/**
 * Rebuild the REALIS index from every export in data/realis/.
 *
 *   npm run ingest:realis
 *
 * The panel's Data page saves an upload into the same folder and runs the same
 * rebuild. Both call lib/consult/imports.js.
 *
 * LICENSED DATA NEVER ENTERS THE REPOSITORY: the folder and the index are
 * gitignored and in outputFileTracingExcludes, and every row carries
 * `source: 'realis'`. Nothing under app/ may import the layer that reads it.
 */
import { rebuildRealis } from '../lib/consult/imports.js';

const r = rebuildRealis();
if (!r.ok) {
  console.error(`${r.reason}\n\nExport from REALIS and drop the CSV into data/realis/. The folder and the\n`
    + 'index are gitignored — licensed data never enters the repository.');
  process.exit(1);
}
for (const p of r.perFile) {
  console.log(p.ok ? `  ${p.file}: ${p.read} rows, ${p.kept} kept` : `  ! ${p.file}: ${p.reason}`);
}
console.log(`\nWrote data/.realis.json — ${r.count.toLocaleString()} transactions from ${r.files} file(s)`);
console.log(`  ${r.withUnitNumber.toLocaleString()} carry a unit number · ${r.stacks.toLocaleString()} distinct stacks`);
if (r.duplicates) console.log(`  ${r.duplicates.toLocaleString()} duplicate transaction(s) across overlapping exports were counted once`);
if (r.unmappedColumns.length) {
  console.log('\n  COLUMNS NOT MAPPED — add an alias in lib/consult/imports.js if one matters:');
  for (const h of r.unmappedColumns) console.log(`    ${h}`);
}
if (!r.withUnitNumber) {
  console.log('\n  No unit numbers found. The stack is the reason for this ingest — without it this is');
  console.log('  the free URA feed with extra steps. Check the export included "Unit No".');
}
