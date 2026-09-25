/**
 * The long pieces, rebuilt from data this site holds.
 *
 * ── WHY THEY HAD TO BE REBUILT, NOT SOURCED ────────────────────────────────
 * Nine deep dives sat in /studio unable to publish, because none recorded a
 * source. Adding a link would not have fixed them. They were written on 27–29
 * Aug by a model asked for opinion pieces, and their figures came from the
 * model: "new launches demand upwards of $2,600 PSF", "a 15 to 20 percent
 * premium historically", "your helper sleeps in the bomb shelter", "True storey
 * analyzes the raw transaction data" — it had not. A source URL beside those
 * numbers would have been a citation for something the source does not say.
 *
 * So each topic keeps its question and loses its numbers. The figures below
 * are computed here from data/ — URA's and HDB's filed records and indices —
 * or read from IRAS's own page, and the writer writes around them. A topic no
 * dataset here can answer is not rebuilt; it is archived with the reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { median, DATASET } from './packs.js';
import { ABSD, SOURCES, RATES_REVIEWED } from '../calc/constants.js';
import { bsd, absd } from '../calc/stampDuty.js';

const load = f => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', f), 'utf8')); } catch { return null; } };
const round = (n, d = 0) => Number(Number(n).toFixed(d));
const pct = (a, b) => round((a / b - 1) * 100, 1) || 0;   // never "-0.0%"
const URA_TX = 'URA Data Service — private residential transactions';
const URA_API = 'https://www.ura.gov.sg/maps/api/';

/* ── shared readers ──────────────────────────────────────────────────────── */

const monthKey = r => `20${r.contractDate.slice(2)}-${r.contractDate.slice(0, 2)}`;

/** Condo and apartment rows (no ECs, no landed) within the last `months`. */
function privateRows(months) {
  const p = load('private.json');
  if (!p?.rows?.length) return null;
  const latest = p.rows.map(monthKey).sort().at(-1);
  const [y, m] = latest.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 7);
  const rows = p.rows.filter(r => /^(condominium|apartment)$/i.test(r.propertyType) && monthKey(r) >= from);
  return { rows, from, to: latest };
}

const SEGMENTS = { CCR: 'Core Central Region', RCR: 'Rest of Central Region', OCR: 'Outside Central Region' };

/* ── the topics ──────────────────────────────────────────────────────────── */

export const TOPICS = {

  /* HDB and private prices, on their own indices, over the same years. */
  'hdb-vs-private': {
    replaces: ['hdb-private-decoupling-2026-analysis'],
    build({ site }) {
      const h = load('hdb-index.json'), p = load('ppi.json');
      if (!h?.points?.length || !p?.series?.all?.points?.length) return { none: 'the price indices are not on file' };
      const at = (pts, q) => pts.find(x => x.quarter === q)?.index;
      const q = h.latest.quarter;
      if (p.latest.quarter !== q) return { none: `the two indices end in different quarters (${q}, ${p.latest.quarter})` };
      const base = '2019-Q4';
      const H = h.points, P = p.series.all.points;
      const hBase = at(H, base), pBase = at(P, base);
      const [y, qq] = q.split('-Q').map(Number);
      const yearAgo = `${y - 1}-Q${qq}`;
      const figures = [
        { id: 'f1', what: 'HDB Resale Price Index (1Q2009 = 100)', value: h.latest.index, format: 'index', period: q, source: h.source, url: DATASET(h.resourceId) },
        { id: 'f2', what: 'URA Private Residential Property Price Index, all residential (1Q2009 = 100)', value: p.latest.index, format: 'index', period: q, source: p.source, url: p.href },
        { id: 'f3', what: `change in the HDB Resale Price Index since ${base}`, value: pct(h.latest.index, hBase), format: 'pct', period: `${base} to ${q}`, source: h.source },
        { id: 'f4', what: `change in the URA private price index since ${base}`, value: pct(p.latest.index, pBase), format: 'pct', period: `${base} to ${q}`, source: p.source },
        { id: 'f5', what: 'change in the HDB Resale Price Index over four quarters', value: pct(h.latest.index, at(H, yearAgo)), format: 'pct', period: `${yearAgo} to ${q}`, source: h.source },
        { id: 'f6', what: 'change in the URA private price index over four quarters', value: pct(p.latest.index, at(P, yearAgo)), format: 'pct', period: `${yearAgo} to ${q}`, source: p.source },
        { id: 'f7', what: `HDB Resale Price Index in ${base}`, value: hBase, format: 'index', period: base, source: h.source },
        { id: 'f8', what: `URA private price index in ${base}`, value: pBase, format: 'index', period: base, source: p.source },
      ];
      return {
        category: 'deep_dive', kindLabel: 'analysis — two official indices set side by side',
        subject: 'HDB resale and private prices since 2019',
        brief: `Set the HDB Resale Price Index beside URA's private residential price index, both based at 1Q2009 = 100, and show what each has done since ${base} and over the last four quarters. The question the reader has: are HDB and private prices moving apart, and what does that mean if they plan to upgrade from HDB to private?`,
        angle: 'If you are planning to sell an HDB flat and buy private, which way has the gap been moving?',
        figures, headline: ['f3', 'f4', 'f5', 'f6'],
        caveats: [
          'The two indices measure different things: HDB resale flats against every kind of private home, landed included. They share a base quarter, which lets them sit side by side, but a gap between them is not the price gap between any two homes.',
          `${p.excludes} ${p.footnote}`.trim(),
        ],
        links: [{ label: 'Truestorey market page', href: `${site}/market` }],
        sources: [DATASET(h.resourceId), p.href],
        chart: chart(site, `Change since ${base}, to ${q}`, [['HDB resale', figures[2].value], ['Private', figures[3].value]], '%', `${h.source}; ${p.source}`),
        tags: ['hdb', 'private', 'price index'],
      };
    },
  },

  /* What a new launch costs against a resale home in the same region. */
  'new-launch-vs-resale': {
    replaces: ['new-launch-vs-resale-price-gap-2026', 'ocr-new-launch-mathematical-trap-2026'],
    build({ site }) {
      const d = privateRows(12);
      if (!d) return { none: 'URA transactions are not on file' };
      const period = `${d.from} to ${d.to}`;
      const figures = [];
      let n = 0;
      for (const seg of ['CCR', 'RCR', 'OCR']) {
        const fresh = d.rows.filter(r => r.marketSegment === seg && r.typeOfSale === '1').map(r => r.psf);
        const resale = d.rows.filter(r => r.marketSegment === seg && r.typeOfSale === '3').map(r => r.psf);
        if (fresh.length < 50 || resale.length < 50) continue;
        const a = median(fresh), b = median(resale);
        figures.push(
          { id: `f${++n}`, what: `median new-sale price, condominiums and apartments, ${SEGMENTS[seg]}`, value: Math.round(a), format: 'psf', period, source: URA_TX, url: URA_API },
          { id: `f${++n}`, what: `median resale price, condominiums and apartments, ${SEGMENTS[seg]}`, value: Math.round(b), format: 'psf', period, source: URA_TX, url: URA_API },
          { id: `f${++n}`, what: `how far the new-sale median sits above the resale median, ${SEGMENTS[seg]}`, value: pct(a, b), format: 'pct', period, source: `Truestorey, from ${URA_TX}` },
          { id: `f${++n}`, what: `new sales and resales behind those medians, ${SEGMENTS[seg]}`, value: `${fresh.length.toLocaleString('en-SG')} new, ${resale.length.toLocaleString('en-SG')} resale`, format: 'text', period, source: URA_TX },
        );
      }
      if (figures.length < 8) return { none: 'too few new sales in the last twelve months to compare regions' };
      const be = load('breakeven.json');
      return {
        category: 'deep_dive', kindLabel: 'analysis — new sales against resales, from URA filed transactions',
        subject: 'New launch against resale, by region',
        brief: 'Using the last twelve months of URA filed transactions, set the median price of a new-sale condominium or apartment against a resale one in each region. The question the reader has: what does the premium for buying new actually look like, region by region, and what is inside it that the median cannot show?',
        angle: 'Is the new-launch premium the same everywhere, and what explains the part of it that is not the building being new?',
        /* The site's own documented note on the 2022 harmonisation, not a
           sentence written here: it is what breakeven.json already publishes. */
        facts: be?.harmonisation ? [`${be.harmonisation.source}. Applies to sites by ${be.harmonisation.basis.toLowerCase()} from ${be.harmonisation.from}. ${be.harmonisation.effect}`] : [],
        figures,
        headline: figures.filter(f => /how far/.test(f.what)).map(f => f.id),
        caveats: [
          'A median new sale and a median resale are different homes: newer, often smaller, in different streets. The gap between the medians is not the premium on any one home.',
          'New-sale prices are what developers achieved at launch; resale prices are filed after completion, often years later.',
        ],
        links: [{ label: 'Truestorey condo prices by project', href: `${site}/condo` }],
        sources: [URA_API],
        chart: chart(site, `New sale above resale, median psf, ${period}`,
          figures.filter(f => /how far/.test(f.what)).map(f => [f.what.split(', ').pop(), f.value]), '%', URA_TX),
        tags: ['new launch', 'resale', 'condo'],
      };
    },
  },

  /* Freehold against 99-year, as filed, with what a raw median cannot control. */
  'freehold-vs-leasehold': {
    replaces: ['freehold-vs-99-year-leasehold-debunking-premium'],
    build({ site }) {
      const d = privateRows(24);
      if (!d) return { none: 'URA transactions are not on file' };
      const period = `${d.from} to ${d.to}`;
      const resale = d.rows.filter(r => r.typeOfSale === '3');
      const fh = r => /freehold/i.test(r.tenure), ly = r => /^99 yrs/i.test(r.tenure);
      const figures = [];
      let n = 0;
      for (const seg of ['CCR', 'RCR', 'OCR']) {
        const a = resale.filter(r => r.marketSegment === seg && fh(r)).map(r => r.psf);
        const b = resale.filter(r => r.marketSegment === seg && ly(r)).map(r => r.psf);
        if (a.length < 50 || b.length < 50) continue;
        figures.push(
          { id: `f${++n}`, what: `median resale price, freehold condominiums and apartments, ${SEGMENTS[seg]}`, value: Math.round(median(a)), format: 'psf', period, source: URA_TX, url: URA_API },
          { id: `f${++n}`, what: `median resale price, 99-year leasehold, ${SEGMENTS[seg]}`, value: Math.round(median(b)), format: 'psf', period, source: URA_TX, url: URA_API },
          { id: `f${++n}`, what: `freehold median against 99-year median, ${SEGMENTS[seg]}`, value: pct(median(a), median(b)), format: 'pct', period, source: `Truestorey, from ${URA_TX}` },
          { id: `f${++n}`, what: `resales behind those medians, ${SEGMENTS[seg]}`, value: `${a.length.toLocaleString('en-SG')} freehold, ${b.length.toLocaleString('en-SG')} leasehold`, format: 'text', period, source: URA_TX },
        );
      }
      if (figures.length < 8) return { none: 'too few resales to compare tenure by region' };
      return {
        category: 'deep_dive', kindLabel: 'analysis — tenure, from URA filed resale transactions',
        subject: 'Freehold against 99-year leasehold, by region',
        brief: 'Using two years of URA filed resale transactions, set the median freehold price against the median 99-year price in each region. The question the reader has: how much more does freehold cost in practice, and why can a raw median mislead — in either direction?',
        angle: 'Is freehold worth what it costs, or is the gap mostly about location and age?',
        figures,
        headline: figures.filter(f => /against 99-year/.test(f.what)).map(f => f.id),
        caveats: [
          'These are raw medians. Freehold projects cluster in older districts and are often older buildings; 99-year projects are often newer. A raw median cannot separate tenure from location, age and size, so the gap is not the value of freehold on any one home.',
        ],
        links: [{ label: 'Truestorey leasehold relativity table', href: `${site}/lease` }],
        sources: [URA_API],
        chart: chart(site, `Freehold median against 99-year, resale, ${period}`,
          figures.filter(f => /against 99-year/.test(f.what)).map(f => [f.what.split(', ').pop(), f.value]), '%', URA_TX),
        tags: ['freehold', 'leasehold', 'tenure'],
      };
    },
  },

  /* Rents, from filed tenancy contracts. */
  'rents': {
    replaces: ['rent-normalization-2026-leveraged-landlords'],
    build({ site }) {
      const r = load('rental.json');
      if (!r?.rows?.length || !r.periods?.length) return { none: 'URA rental contracts are not on file' };
      const q = s => `20${s.slice(0, 2)}-Q${s.slice(3)}`;
      const quarterOf = lease => { const m = Number(lease.slice(0, 2)), y = lease.slice(2); return `20${y}-Q${Math.ceil(m / 3)}`; };
      const nonLanded = r.rows.filter(x => /non-landed|apartment|condominium/i.test(x.propertyType) && Number.isFinite(x.rent));
      const by = {};
      for (const x of nonLanded) (by[quarterOf(String(x.leaseDate))] ||= []).push(x.rent);
      const quarters = r.periods.map(q).filter(k => by[k]?.length >= 200);
      if (quarters.length < 2) return { none: 'fewer than two quarters of rental contracts on file' };
      const first = quarters[0], last = quarters.at(-1);
      const figures = quarters.map((k, i) => ({ id: `f${i + 1}`, what: `median monthly rent, non-landed private homes`, value: Math.round(median(by[k])), format: 'money', period: k, source: r.source, url: URA_API }));
      figures.push({ id: `f${figures.length + 1}`, what: 'change in that median', value: pct(median(by[last]), median(by[first])), format: 'pct', period: `${first} to ${last}`, source: `Truestorey, from ${r.source}` });
      figures.push({ id: `f${figures.length + 1}`, what: 'tenancy contracts behind the latest median', value: by[last].length, format: 'count', period: last, source: r.source });
      const beds = {};
      for (const x of nonLanded.filter(x => quarterOf(String(x.leaseDate)) === last && x.noOfBedRoom)) (beds[x.noOfBedRoom] ||= []).push(x.rent);
      for (const b of ['1', '2', '3']) if (beds[b]?.length >= 100) figures.push({ id: `f${figures.length + 1}`, what: `median monthly rent, ${b}-bedroom non-landed homes`, value: Math.round(median(beds[b])), format: 'money', period: last, source: r.source });
      return {
        /* A note, not a deep dive: three quarters of contracts will not carry
           twelve hundred words honestly. */
        category: 'note', kindLabel: 'analysis — rents from filed tenancy contracts',
        subject: 'Private rents, quarter by quarter',
        brief: `Using URA's filed tenancy contracts for non-landed private homes, show what the median monthly rent has done from ${first} to ${last}, and what a one-, two- and three-bedroom home rents for now. The question the reader has — whether they are a landlord with a loan, a tenant renewing, or a buyer counting on rent — is what the contracts actually show, and what they cannot.`,
        angle: 'If you are counting on rent to cover a mortgage, what are tenants actually signing for?',
        figures, headline: [figures[quarters.length - 1].id, figures[quarters.length].id,
          ...figures.filter(f => /2-bedroom/.test(f.what)).map(f => f.id)],
        caveats: [
          `Only ${quarters.length} quarters of contracts are on file, so this shows direction over a short period, not a cycle.`,
          'URA records a floor area range, not the exact size, and a median across all sizes moves when the mix of homes let changes.',
        ],
        links: [{ label: 'Truestorey rental yields by project', href: `${site}/yield` }],
        sources: [URA_API],
        tags: ['rent', 'rental', 'landlord'],
      };
    },
  },

  /* The second home, in stamp duty, from IRAS's rates and the site's calculator. */
  'second-property-duty': {
    replaces: ['decoupling-mirage-99-to-1-loophole-math'],
    async build({ site, fetchFacts }) {
      const price = 2_000_000;
      const b = bsd(price).total, a2 = absd(price, 'SC', 2).total, a3 = absd(price, 'SC', 3).total;
      /* IRAS's own words on joint and partial ownership: the rules a
         one-name purchase has to be read against. Questions from its FAQ
         are left out; the answers stay. */
      const facts = fetchFacts ? await fetchFacts('https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer%27s-stamp-duty-(absd)',
        l => /joint|partial|share|count of properties|highest applicable|purchase price|market value/i.test(l) && !/\?$/.test(l)) : [];
      const figures = [
        { id: 'f1', what: 'ABSD rate, Singapore Citizen buying a second residential property', value: ABSD.SC[2] * 100, format: 'pct', dp: 0, period: `effective ${SOURCES.absd.effective}`, source: SOURCES.absd.name },
        { id: 'f2', what: 'ABSD rate, Singapore Citizen buying a third or subsequent property', value: ABSD.SC[3] * 100, format: 'pct', dp: 0, period: `effective ${SOURCES.absd.effective}`, source: SOURCES.absd.name },
        { id: 'f3', what: 'ABSD rate, Singapore Permanent Resident buying a first property', value: ABSD.SPR[1] * 100, format: 'pct', dp: 0, period: `effective ${SOURCES.absd.effective}`, source: SOURCES.absd.name },
        { id: 'f4', what: 'example purchase price', value: price, format: 'money', period: 'worked example', source: 'Truestorey calculator' },
        { id: 'f5', what: 'Buyer’s Stamp Duty on that price', value: b, format: 'money', period: `rates effective ${SOURCES.bsd.effective}`, source: `${SOURCES.bsd.name}, computed by the Truestorey calculator` },
        { id: 'f6', what: 'ABSD on that price as a second property (Singapore Citizen)', value: a2, format: 'money', period: `rates effective ${SOURCES.absd.effective}`, source: `${SOURCES.absd.name}, computed by the Truestorey calculator` },
        { id: 'f7', what: 'ABSD on that price as a third property (Singapore Citizen)', value: a3, format: 'money', period: `rates effective ${SOURCES.absd.effective}`, source: `${SOURCES.absd.name}, computed by the Truestorey calculator` },
        { id: 'f8', what: 'Buyer’s Stamp Duty and second-property ABSD together', value: b + a2, format: 'money', period: 'worked example', source: 'Truestorey calculator' },
      ];
      return {
        category: 'deep_dive', kindLabel: 'analysis — the cost of a second home in stamp duty',
        subject: 'Stamp duty on a second property',
        brief: `Work through what stamp duty costs a Singapore Citizen household that already owns a home and buys a second at S$2,000,000, using IRAS's rates as computed by the Truestorey calculator. Explain why that cost is why some couples consider buying in one name, and what IRAS's own page says about how it assesses the purchase. Rates reviewed ${RATES_REVIEWED}.`,
        angle: 'If you own a home and want a second, what does the duty actually come to, and what does IRAS say about ways around it?',
        facts,
        figures, headline: ['f6', 'f5', 'f8'],
        caveats: ['This is a worked example at one price for Singapore Citizens. The duty on any real purchase depends on the price or market value, whichever is higher, and on every buyer’s residency and property count. It is not tax advice.'],
        links: [{ label: 'Truestorey cost calculator', href: `${site}/cost` }],
        sources: ['https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer%27s-stamp-duty-(absd)',
          'https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer%27s-stamp-duty-(bsd)'],
        tags: ['absd', 'stamp duty', 'second property'],
      };
    },
  },

  /* Topics no dataset here can answer. Archived, with the reason recorded. */
  'dual-key': { replaces: ['dual-key-delusion-rental-yields-capital-growth'],
    build: () => ({ none: 'URA records do not mark dual-key units, so nothing on file can compare them' }) },
  'en-bloc': { replaces: ['en-bloc-fatigue-mega-developments-strata-prisons'],
    build: () => ({ none: 'collective sales are not in any dataset this site ingests' }) },
  'prime-plus-standard': { replaces: ['bto-prime-plus-standard-resale-premium-2026'],
    build: () => ({ none: 'no Plus or Prime flat has reached its ten-year MOP, so there is no resale to measure, and the policy page is not readable to a fetch' }) },
};

/** A /chart URL for bars, fixed to the pack's own values. */
function chart(site, t, rows, unit, source) {
  const p = new URLSearchParams();
  p.set('t', t.slice(0, 90));
  p.set('d', rows.map(([k, v]) => `${String(k).slice(0, 28)}:${v}`).join(','));
  if (unit) p.set('u', unit);
  p.set('s', String(source).slice(0, 160));
  return { src: `${site}/chart?${p}`, alt: t, caption: source };
}
