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
  /* ── WHAT "AFTER THE PREVIOUS WAVE" COUNTS ─────────────────────────────
   * It first counted THIS block and the whole town in the year after the
   * previous wave's fifth year. Neither is the previous wave. On 26 of the 278
   * pages with a comparison, that year fell before this block's own fifth
   * year, so its row was zero by construction — "0 filings" beside the town's
   * 364, for flats that could not yet have been resold. On the other 252 it was
   * the block's own fifth year under a heading that said otherwise.
   *
   * So the wave is counted as itself: filings at the blocks whose earliest
   * possible fifth year WAS the previous one. The town stays as the total
   * those sit inside. This block is counted only when its own fifth year had
   * arrived by then; otherwise `block` is null, which the copy explains,
   * rather than a zero that reads as a measurement. */
  const cohort = [...new Set(blocks.filter(b => hasAddress(b) && slug(b.town) === slug(rec.town)
    && isYear(b.yearCompleted) && b.earliestMop === b.yearCompleted + 5
    && b.earliestMop === result.previousYear).map(b => hdbHref(b.town, b.block, b.street)))];
  result.comparison = { period: { from: period.from, to: period.to }, partial: period.partial,
    year, cohortBlocks: cohort.length,
    cohort: cohort.reduce((t, href) => t + (filings.blocks?.[href]?.years?.[year] || 0), 0),
    block: result.earliestYear <= year ? (filings.blocks?.[rec.href]?.years?.[year] || 0) : null,
    town: townCounts[year] || 0 };
  return result;
}

/**
 * Whether a block page should carry the section at all.
 *
 * It rendered on all 9,483 HDB block pages, and on 9,205 of them there was
 * nothing to compare: Blk 314 Ang Mo Kio Ave 3 read "Earliest possible fifth
 * year: 1981 … the comparison is unavailable". MOP context is about a block whose
 * five years are ending or have just ended, so the section shows when the
 * fifth year falls inside the held filing window or later.
 *
 * When the register gives no year, the record's own lease commencement decides
 * — an unmatched 1978 block is still a 1978 block. When neither is known the
 * section shows, because then its "could not be matched" note is the honest
 * thing to say rather than a silence.
 */
export function mopRelevant(data, rec) {
  if (!data) return false;
  const fifth = data.earliestYear
    ?? (isYear(Number(rec?.leaseCommence)) ? Number(rec.leaseCommence) + 5 : null);
  if (fifth == null) return true;
  const held = Number(String(data.heldPeriod?.from || '').slice(0, 4));
  const asOf = Number(String(data.source?.accessedAt || rec?.accessedAt || '').slice(0, 4));
  const from = isYear(held) ? held : isYear(asOf) ? asOf - 3 : null;
  return from == null ? true : fifth >= from;
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
    comparisonTitle: 'Filings after the previous wave in this town',
    wave: data.previousYear
      ? `The previous wave in ${titleCase(rec.town)}: ${data.comparison ? `${data.comparison.cohortBlocks} block${data.comparison.cohortBlocks === 1 ? '' : 's'} ` : 'the blocks '}with an earliest possible fifth year of ${data.previousYear}.`
      : 'A previous fifth-year wave could not be established for this block in this town.',
    method: 'Counts cover the calendar year after that wave’s fifth year, limited to months held here. It is a completion-year proxy, not a dated MOP wave.',
    unavailable: data.previousYear ? `The following calendar year (${data.previousYear + 1}) is not covered by a usable filing period here. The comparison is unavailable.`
      : 'The filing comparison is unavailable.',
    blockNote: data.comparison && data.comparison.block == null
      ? `${titleCase(rec.label)} is not counted for ${data.comparison.year}: its earliest possible fifth year is ${data.earliestYear}, so its flats were not yet in that window.`
      : null,
    scope: 'All flat types. The town total includes the blocks above. These are registered filings, not listings or distinct households; they do not measure the effect of MOP.',
    lag: 'Registration is monthly and can lag a sale. The latest month may be incomplete, and late filings can change these counts.',
    partial: data.comparison?.partial ? 'Partial year: only the displayed months are counted; months outside this period have not been treated as zero.' : null,
    rows: data.comparison ? [
      { label: `The previous wave’s ${data.comparison.cohortBlocks} block${data.comparison.cohortBlocks === 1 ? '' : 's'}`, count: data.comparison.cohort },
      data.comparison.block != null ? { label: `At ${titleCase(rec.label)}`, count: data.comparison.block } : null,
      { label: `Across ${titleCase(rec.town)}, all blocks`, count: data.comparison.town },
    ].filter(Boolean).map(row => ({ ...row, period: periodText(data.comparison.period) })) : [],
  };
  return copy;
}
