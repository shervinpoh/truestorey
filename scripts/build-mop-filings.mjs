/** Annual filing counts for block-page MOP context. Rebuilt with transactions.
 * No network; hdb.json is read here and stays excluded from runtime bundles. */
import fs from 'node:fs/promises';
import { buildMopFilings } from '../lib/mop.js';

let hdb = null;
try { hdb = JSON.parse(await fs.readFile(new URL('../data/hdb.json', import.meta.url), 'utf8')); }
catch (error) { console.warn(`MOP filing input unavailable: ${error.message}`); }
const data = buildMopFilings(hdb);
// Replace even on failure: keeping old counts would hide a missing input.
await fs.writeFile(new URL('../data/mop-filings.json', import.meta.url), JSON.stringify(data));
console.log(data ? `MOP filings: ${Object.keys(data.blocks).length} blocks · ${data.period.from}–${data.period.to}`
  : 'MOP filings unavailable — no counts published.');
