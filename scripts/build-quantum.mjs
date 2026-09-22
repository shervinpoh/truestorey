import fs from 'node:fs';
import path from 'node:path';
import { buildQuantum } from '../lib/quantum.js';

const root = process.cwd();
const read = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const hdb = read('hdb.json');
const privateSales = read('private.json');
const cohorts = buildQuantum({ hdbRows: hdb.rows, privateRows: privateSales.rows });
const out = {
  builtAt: new Date().toISOString(),
  ...cohorts,
  source: {
    hdb: hdb.source,
    private: privateSales.source,
  },
  note: 'Filed transaction prices, grouped by place, 20 sqm floor-area band and calendar year. '
    + 'Each row is [place, band start sqm, year, sales, 25th percentile, median, 75th percentile]. '
    + 'Cohorts below 20 sales are withheld. A change between years may still reflect a different '
    + 'mix of homes within the band; these are not repeat sales, a valuation or a forecast.',
};
fs.writeFileSync(path.join(root, 'data', 'quantum.json'), JSON.stringify(out));
console.log(`Wrote data/quantum.json — ${out.hdb.rows.length} HDB and ${out.private.rows.length} private cohorts`);
