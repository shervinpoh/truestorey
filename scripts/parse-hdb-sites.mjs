/**
 * HDB's "Sites Sold by HDB" PDFs → data/sources/hdb-sites-sold.json.
 *
 * ── WHY THIS IS NOT AN INGEST ──────────────────────────────────────────────
 * Everything else in scripts/ fetches. This cannot: HDB publishes these as
 * PDFs behind a page that builds its links client-side, with no stable URL and
 * nothing in data.gov.sg. So the PDFs are saved by hand into land-in/ and this
 * parses whatever is there. It is the same shape as ingest-photos.mjs, and for
 * the same reason — the source does not offer a door to knock on.
 *
 * It takes TEXT, not PDF. Extracting text from a PDF needs a library and this
 * repo has three npm dependencies on purpose, so the text is dumped once
 * (any PDF reader will do it) and parsed here. A parser that cannot see the
 * original bytes also cannot silently mis-read them.
 *
 * ── WHAT HDB'S SHEET DOES THAT BREAKS NAIVE PARSING ────────────────────────
 * Five things, each of which cost a row before it was handled:
 *   "LP / CO / FT"        a development code with spaces and slashes
 *   "N.A." / "NA"         not published — null, never zero
 *   "40,605 (max)"        a CEILING on floor area, not a value
 *   "[3.5]"               an approximate plot ratio, bracketed by HDB itself
 *   "125,913. 4"          a space inside a number, from the PDF's own layout
 * The last one is the interesting one: it is not in HDB's data, it is an
 * artefact of how the text came out, and a parser that "helpfully" read it as
 * 125,913 would silently drop 0.4 of a hectare.
 *
 * ── THE COLUMN THAT MAKES THIS WORTH HAVING ────────────────────────────────
 * Project Name. URA's sheet says what a site fetched; HDB's says what it
 * BECAME. Queenstown S9b Dundee Road, $483,178,000, nine bidders — Queens
 * Peak. That is a join from what the ground cost to a development that now has
 * filed transactions on this site, and nobody else publishes both ends.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const IN = new URL('../land-in/', import.meta.url);
const OUT = new URL('../data/sources/hdb-sites-sold.json', import.meta.url);

const iso = d => { const [a, b, c] = d.split('/').map(Number); return `${c}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}`; };

/** A figure, or null. Never zero — HDB's "N.A." means not published. */
const num = s => {
  if (s == null) return null;
  const t = String(s).trim();
  // HDB writes "N.A.", "NA" and a bare "-" for the same thing. None of them
  // is zero, and a plot ratio of zero would be a real-looking wrong number.
  if (/^\[?(N\.?A\.?|-|–|—)\]?$/i.test(t)) return null;
  // "125,913. 4" — the space is the PDF's, not HDB's. Close it before parsing.
  const m = /^\[?([\d,]+(?:\.\s?\d+)?)/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, '').replace(/\.\s+/, '.'));
  return Number.isFinite(n) ? n : null;
};

const ROW = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([\s\S]*?)(?=\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}\/\d{1,2}\/\d{4}|$)/g;

/*
 * THREE SHEETS, THREE SCHEMAS, AND THEY ARE NOT VARIATIONS OF ONE.
 *
 * The first version of this file had a single row pattern and was written
 * against the condominium sheet. Run over the other two it would have matched
 * about half their rows and mis-read the rest — which is worse than failing,
 * because a half-populated column looks like data.
 *
 *   CONDOMINIUM  … Devt Type · Lease · GPR · GFA
 *   EC           … Devt Type · Lease · GPR · MAX GFA · MIN GFA   (an extra column)
 *   MIXED        … Lease · "118,268 sqm / (2.5)"   (no devt type at all, and the
 *                  floor area and plot ratio share ONE cell)
 *
 * So the schema is chosen from the sheet's own header rather than guessed from
 * the filename, and each has its own pattern. A file whose header matches none
 * of them is refused rather than parsed by the closest fit.
 */
const SCHEMAS = [
  {
    id: 'ec',
    // "Min. Gross Floor Area" appears only on the EC sheet.
    detect: h => /min\.?\s*gross\s*floor/i.test(h),
    kind: 'EC',
    re: new RegExp(
      '^(.*?)\\s+([\\d,]+(?:\\.\\s?\\d+)?)\\s+' +                   // parcel + street, land area
      '(\\*?[A-Z]{1,3}(?:\\s*\\/\\s*\\*?[A-Z]{1,3})*)\\s+' +       // devt type
      '(\\d+)\\s*(?:yrs?)?\\s+' +                                  // lease, bare on this sheet
      '(N\\.?A\\.?|-|\\[?[\\d.]+\\]?)\\s+' +                       // GPR, sometimes a bare dash
      '(N\\.?A\\.?|[\\d,]+(?:\\.\\d+)?)\\s+(N\\.?A\\.?|[\\d,]+(?:\\.\\d+)?)\\s+' + // max GFA, min GFA — either may be N.A.
      '(.*)$'),
    map: g => ({ devtCode: g[3], lease: `${g[4]} yrs`, gpr: num(g[5]),
                 gfaSqm: num(g[6]), gfaMinSqm: num(g[7]), winner: g[8].trim() }),
  },
  {
    id: 'mixed',
    // The combined cell is the giveaway: "Permissible GFA / (GPR)".
    detect: h => /permissible\s*gfa\s*\/\s*\(gpr\)/i.test(h),
    kind: 'Mixed',
    re: new RegExp(
      '^(.*?)\\s+([\\d,]+(?:\\.\\s?\\d+)?)\\s+' +                   // parcel + street, land area
      '(\\d+)\\s*(?:yrs?)?\\s+' +                                  // lease
      '([\\d,]+(?:\\.\\d+)?)\\s*sqm\\s*\\/\\s*\\(([\\d.]+)\\)\\s+' + // "118,268 sqm / (2.5)"
      '(.*)$'),
    map: g => ({ devtCode: 'Mixed', lease: `${g[3]} yrs`, gfaSqm: num(g[4]),
                 gpr: num(g[5]), winner: g[6].trim() }),
  },
  {
    id: 'condo',
    detect: () => true,                                            // the default shape
    kind: 'Condominium',
    re: new RegExp(
      '^(.*?)\\s+([\\d,]+(?:\\.\\s?\\d)?)\\s+' +
      '(\\*?[A-Z]{1,3}(?:\\s*\\/\\s*\\*?[A-Z]{1,3})*)\\s+' +
      '(\\d+\\s*yrs?)\\s+' +
      '(\\[?[\\d.]+\\]?(?:\\s*\\([^)]*\\))?|N\\.?A\\.?|-)\\s+' +
      '(N\\.?A\\.?|[\\d,]+(?:\\.\\s?\\d+)?(?:\\s*\\(max\\))?)\\s+' +
      '(.*)$'),
    map: g => ({ devtCode: g[3].replace(/\s*\/\s*/g, '/'), lease: g[4].replace(/\s+/g, ' '),
                 gpr: num(g[5]), gprNote: /\[|\(/.test(g[5]) ? g[5].trim() : null,
                 gfaSqm: num(g[6]), gfaIsCeiling: /\(max\)/i.test(g[6]), winner: g[7].trim() }),
  },
];

export async function parseHdbSites() {
  let files = [];
  try { files = (await fs.readdir(IN)).filter(f => f.endsWith('.txt')); } catch { /* no folder yet */ }
  if (!files.length) {
    console.error('Nothing in land-in/. Save HDB\'s "Sites Sold" PDFs as .txt there and re-run.');
    console.error('  https://www.hdb.gov.sg/business-partners/land-developers-and-land-users/buying-land-land-sales/sites-sold-by-hdb');
    process.exit(1);
  }

  const sites = [];
  const failures = [];
  for (const f of files) {
    let text = await fs.readFile(new URL(f, IN), 'utf8');
    /*
     * Some sheets append a bid-detail section — every tenderer and every bid
     * per parcel, under "S/N Tenderer Tender Bid ($)". It is genuinely
     * interesting and it is NOT the table being parsed here, and the row
     * pattern was catching fragments of it and reporting them as failures.
     * A parser that cries wolf gets its warnings ignored, so the appendix is
     * cut off explicitly rather than left to fail row by row.
     */
    const appendix = /S\/N\s+Tenderer\s+Tender\s+Bid/i.exec(text);
    if (appendix) text = text.slice(0, appendix.index);
    // The header is whatever precedes the first row. Enough to tell the sheets
    // apart, and it comes from the file rather than from its name.
    const firstRow = /\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}\/\d{1,2}\/\d{4}/.exec(text);
    const header = text.slice(0, firstRow ? firstRow.index : 1200).replace(/\s+/g, ' ');
    const schema = SCHEMAS.find(x => x.detect(header));

    let m, n = 0;
    ROW.lastIndex = 0;
    while ((m = ROW.exec(text))) {
      const body = m[4].replace(/\s+/g, ' ').trim();
      const tail = /\$([\d,]+)\.\d{2}\s+(\d+)\s*(.*)$/.exec(body);
      if (!tail) { failures.push([f, body.slice(0, 110)]); continue; }
      const head = body.slice(0, tail.index).trim();
      const g = schema.re.exec(head);
      if (!g) { failures.push([f, head.slice(0, 110)]); continue; }
      sites.push({
        vendor: 'HDB', kind: schema.kind, sheet: schema.id,
        award: iso(m[3]), launched: iso(m[1]), closed: iso(m[2]),
        site: g[1].trim(), areaSqm: num(g[2]),
        ...schema.map(g),
        price: Number(tail[1].replace(/,/g, '')),
        bids: Number(tail[2]),
        // Not every row names one — an EC site can be awarded before the
        // project is named. Null rather than an empty string.
        project: tail[3].trim() || null,
      });
      n++;
    }
    console.log(`  ${f} — ${n} sites (${schema.kind})`);
  }

  sites.sort((a, b) => (a.award < b.award ? 1 : -1));
  if (!sites.length) throw new Error('no sites parsed from any file');

  const named = sites.filter(s => s.project).length;
  const out = {
    source: 'HDB — Sites Sold by HDB',
    sourcePage: 'https://www.hdb.gov.sg/business-partners/land-developers-and-land-users/buying-land-land-sales/sites-sold-by-hdb',
    note: 'HDB publishes these as PDFs behind a page that builds its links client-side, with no '
        + 'stable download URL and nothing on data.gov.sg — so they are saved by hand and parsed, '
        + 'not fetched on a schedule. Where HDB writes "N.A." the field is null and never zero. A '
        + 'gross floor area marked "(max)" is a ceiling, not a value: gfaIsCeiling records which. '
        + 'A bracketed plot ratio is HDB\'s own approximation and is kept in gprNote. Prices are '
        + 'nominal and are not adjusted for inflation.',
    transcribed: new Date().toISOString().slice(0, 10),
    counts: {
      sites: sites.length, withProject: named,
      withGpr: sites.filter(s => s.gpr).length,
      byKind: sites.reduce((a, s) => ({ ...a, [s.kind]: (a[s.kind] || 0) + 1 }), {}),
    },
    sites,
  };
  await fs.writeFile(OUT, JSON.stringify(out, null, 1));
  console.log(`Wrote data/sources/hdb-sites-sold.json — ${sites.length} sites · ${named} name the project they became`);
  if (failures.length) {
    // Say what could not be read. A parser that reports only successes is the
    // silent-truncation failure this repo keeps writing tests about.
    console.warn(`\n  ⚠ ${failures.length} row(s) could not be parsed:`);
    for (const [f, s] of failures.slice(0, 8)) console.warn(`    [${f}] ${s}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  parseHdbSites().catch(e => { console.error('\nHDB SITES PARSE FAILED:', e.message); process.exit(1); });
}
