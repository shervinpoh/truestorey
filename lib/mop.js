import { hdbHref, slug, titleCase } from './name.js';

const isMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const isYear = value => Number.isInteger(value) && value >= 1900 && value <= 2200;
const hasAddress = row => ['town', 'block', 'street'].every(k => typeof row?.[k] === 'string' && row[k].trim());
const sourceOf = data => data?.source && data?.resourceId && data?.accessedAt ? {
  name: data.source,
  url: `https://data.gov.sg/datasets/${encodeURIComponent(data.resourceId)}/view`,
  accessedAt: data.accessedAt.slice(0, 10),
} : null;

/**
 * Count the full download, never rec.recent (which stops at twenty).
 * Only this small annual index reaches the server bundle; hdb.json stays a
 * build input. Months with no national rows are not assumed to be covered.
 * A gap disables that year's comparison rather than turning a lost page of
 * the ingest into apparent inactivity at a block.
 */
export function buildMopFilings(hdb) {
  const source = sourceOf(hdb);
  if (!source || !Array.isArray(hdb?.rows) || !hdb.rows.length
      || hdb.count !== hdb.rows.length
      || hdb.rows.some(r => !hasAddress(r) || !isMonth(r.month))) return null;

  const blocks = {}, towns = {}, months = new Set();
  for (const row of hdb.rows) {
    months.add(row.month);
    const year = row.month.slice(0, 4);
    const href = hdbHref(row.town, row.block, row.street);
    const block = blocks[href] ||= { firstMonth: row.month, years: {} };
    block.firstMonth = row.month < block.firstMonth ? row.month : block.firstMonth;
    block.years[year] = (block.years[year] || 0) + 1;
    const town = towns[slug(row.town)] ||= {};
    town[year] = (town[year] || 0) + 1;
  }
  const sorted = [...months].sort();
  const period = { from: sorted[0], to: sorted.at(-1) };
  const years = {};
  for (const year of new Set(sorted.map(m => m.slice(0, 4)))) {
    const held = sorted.filter(m => m.startsWith(year));
    const from = held[0], to = held.at(-1);
    const contiguous = held.length === Number(to.slice(5)) - Number(from.slice(5)) + 1;
    years[year] = { from, to, contiguous, partial: held.length !== 12 };
  }
  return { source, period, years, blocks, towns };
}

/**
 * §8.4's premise was wrong: mop.json has a year, not an MOP month. Neither
 * firstResaleSeen nor lease commencement can supply the missing date.
 * Join on the shared town + block + street href, never the block number alone.
 *
 * The preceding wave is therefore explicitly a FIFTH-YEAR COHORT proxy:
 * the nearest earlier earliestMop year in this town, relative to this block's
 * year. Count the following calendar year, intersected with the held filing
 * window. Do not hunt backwards for a busier or better-covered wave. Older
 * and future comparisons stay unavailable when their period is not held.
 */
export function blockMop(rec, mop, filings) {
  if (rec?.kind !== 'HDB') return null;
  const result = { status: 'unavailable', source: sourceOf(mop), earliestYear: null,
    completedYear: null, previousYear: null, firstMonth: null, comparison: null,
    filingSource: filings?.source || null, heldPeriod: filings?.period || null };
  if (!mop?.towns || !result.source) return result;
  const towns = Object.entries(mop.towns).filter(([name]) => slug(name) === slug(rec.town));
  if (towns.length !== 1 || !hasAddress(rec)
      || rec.href !== hdbHref(rec.town, rec.block, rec.street)) return result;
  const blocks = Object.values(towns[0][1]?.byYear || {}).flatMap(y => Array.isArray(y?.list) ? y.list : []);
  const matches = blocks.filter(b => hasAddress(b) && hdbHref(b.town, b.block, b.street) === rec.href);
  if (matches.length !== 1) return { ...result, status: matches.length ? 'ambiguous' : 'unmatched' };
  const block = matches[0];
  result.status = 'matched';
  if (isYear(block.yearCompleted) && block.earliestMop === block.yearCompleted + 5) {
    result.completedYear = block.yearCompleted;
    result.earliestYear = block.earliestMop;
  }
  result.firstMonth = filings?.blocks?.[rec.href]?.firstMonth || null;
  if (!result.earliestYear) return result;
  const earlier = blocks.filter(b => hasAddress(b) && slug(b.town) === slug(rec.town)
    && isYear(b.yearCompleted) && b.earliestMop === b.yearCompleted + 5
    && b.earliestMop < result.earliestYear).map(b => b.earliestMop);
  if (!earlier.length) return result;
  result.previousYear = Math.max(...earlier);
  const year = result.previousYear + 1;
  const period = filings?.years?.[year];
  const townCounts = filings?.towns?.[slug(rec.town)];
  if (!period?.contiguous || !townCounts || !filings.source) return result;
  result.comparison = { period: { from: period.from, to: period.to }, partial: period.partial,
    block: filings.blocks?.[rec.href]?.years?.[year] || 0, town: townCounts[year] || 0 };
  return result;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
export const namedMonth = month => isMonth(month) ? `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}` : null;
const periodText = period => period ? `${namedMonth(period.from)}–${namedMonth(period.to)}` : null;

/** All the factual copy lives together so the wording guard tests what renders. */
export function mopCopy(data, rec) {
  if (!data) return null;
  const copy = {
    title: 'MOP context', dateLabel: 'MOP month unavailable',
    dateNote: 'The register carries completion years, not key-collection dates or a confirmed MOP month. It cannot establish an individual flat’s eligibility.',
    year: data.earliestYear ? `Earliest possible fifth year: ${data.earliestYear}` : null,
    yearNote: data.completedYear ? `Derived from completion in ${data.completedYear} plus five years; this is not a confirmed MOP date.` : null,
    missing: data.status === 'matched' ? null : data.status === 'ambiguous'
      ? 'More than one register entry matches this address. The block’s MOP context could not be resolved.'
      : data.status === 'unmatched' ? 'This block could not be matched to the MOP register.'
        : 'The MOP register or its source details are unavailable.',
    first: data.firstMonth ? `Earliest filing held at this block: ${namedMonth(data.firstMonth)}` : null,
    firstNote: 'This is the earliest registered month in the held resale window, not the block’s first-ever sale or its MOP month.',
    held: periodText(data.heldPeriod),
    comparisonTitle: 'Filings after the preceding fifth-year cohort',
    wave: data.previousYear ? `The preceding cohort in ${titleCase(rec.town)} has an earliest possible fifth year of ${data.previousYear}.`
      : 'A preceding fifth-year cohort could not be established for this block in this town.',
    method: 'The cohort is the nearest earlier fifth-year group in this town’s register. The comparison covers the following calendar year, limited to months held here. It is a completion-year proxy, not a dated MOP wave.',
    unavailable: data.previousYear ? `The following calendar year (${data.previousYear + 1}) is not covered by a usable filing period here. The comparison is unavailable.`
      : 'The filing comparison is unavailable.',
    scope: 'All flat types. The town total includes this block. These are registered filings, not listings or distinct households; they do not measure the effect of MOP.',
    lag: 'Registration is monthly and can lag a sale. The latest month may be incomplete, and late filings can change these counts.',
    partial: data.comparison?.partial ? 'Partial year: only the displayed months are counted; months outside this period have not been treated as zero.' : null,
    rows: data.comparison ? [
      { label: `At ${titleCase(rec.label)}`, count: data.comparison.block },
      { label: `Across ${titleCase(rec.town)}`, count: data.comparison.town },
    ].map(row => ({ ...row, period: periodText(data.comparison.period) })) : [],
  };
  return copy;
}
