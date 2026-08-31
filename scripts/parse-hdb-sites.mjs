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
  if (/^\[?N\.?A\.?\]?$/i.test(t)) return null;
  // "125,913. 4" — the space is the PDF's, not HDB's. Close it before parsing.
  const m = /^\[?([\d,]+(?:\.\s?\d+)?)/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, '').replace(/\.\s+/, '.'));
  return Number.isFinite(n) ? n : null;
};

const ROW = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([\s\S]*?)(?=\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}\/\d{1,2}\/\d{4}|$)/g;
const HEAD = new RegExp(
  '^(.*?)\\s+([\\d,]+\\.\\s?\\d)\\s+' +                  // parcel + street, land area
  '(\\*?[A-Z]{1,3}(?:\\s*/\\s*\\*?[A-Z]{1,3})*)\\s+' +   // devt code, possibly "LP / CO / FT"
  '(\\d+\\s*yrs?)\\s+' +                                 // lease
  '(\\[?[\\d.]+\\]?(?:\\s*\\([^)]*\\))?|N\\.?A\\.?)\\s+' + // GPR, maybe [bracketed] or qualified
  '(N\\.?A\\.?|[\\d,]+(?:\\.\\s?\\d+)?(?:\\s*\\(max\\))?)\\s+' + // GFA, maybe a ceiling
  '(.*)$');

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
    const text = await fs.readFile(new URL(f, IN), 'utf8');
    const kind = /ec/i.test(f) ? 'EC' : /mix/i.test(f) ? 'Mixed' : 'Condominium';
    let m, n = 0;
    ROW.lastIndex = 0;
    while ((m = ROW.exec(text))) {
      const body = m[4].replace(/\s+/g, ' ').trim();
      const tail = /\$([\d,]+)\.\d{2}\s+(\d+)\s*(.*)$/.exec(body);
      if (!tail) { failures.push([f, body.slice(0, 110)]); continue; }
      const head = body.slice(0, tail.index).trim();
      const g = HEAD.exec(head);
      if (!g) { failures.push([f, head.slice(0, 110)]); continue; }
      sites.push({
        vendor: 'HDB', kind,
        award: iso(m[3]), launched: iso(m[1]), closed: iso(m[2]),
        site: g[1].trim(),
        areaSqm: num(g[2]),
        devtCode: g[3].replace(/\s*\/\s*/g, '/'),
        lease: g[4].replace(/\s+/g, ' '),
        gpr: num(g[5]),
        /* HDB brackets a plot ratio it considers approximate, and qualifies
           some with "(for CO only)". Both are recorded rather than flattened,
           because a reader comparing rates needs to know. */
        gprNote: /\[|\(/.test(g[5]) ? g[5].trim() : null,
        gfaSqm: num(g[6]),
        gfaIsCeiling: /\(max\)/i.test(g[6]),
        winner: g[7].trim(),
        price: Number(tail[1].replace(/,/g, '')),
        bids: Number(tail[2]),
        project: tail[3].trim() || null,
      });
      n++;
    }
    console.log(`  ${f} — ${n} sites (${kind})`);
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
    counts: { sites: sites.length, withProject: named, withGpr: sites.filter(s => s.gpr).length },
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
