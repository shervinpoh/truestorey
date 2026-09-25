/**
 * URA Government Land Sales — every site ever awarded, with what it fetched.
 *
 * WHY THIS EXISTS. data/gls.json is the CURRENT programme: what is on offer.
 * It carries no price, because a site that has not closed has not got one, and
 * only three of its twenty-four sites are awarded. So it can say what is
 * coming and nothing about what land costs.
 *
 * This is the other half: 441 awarded sites from 1993 to now, each with the
 * winning tender, the number of bids, who won it, and the rate per square
 * metre. It is the only published measure of what a developer paid for the
 * ground before anything was built on it.
 *
 * ── WHERE IT COMES FROM, AND WHY THAT TOOK FINDING ─────────────────────────
 * URA's Past Sales Sites page is a client-rendered app with no table in its
 * HTML and no API behind it that could be found. The data is in a spreadsheet
 * linked from that page and served from isomer-user-content.by.gov.sg, which
 * is the government's static asset host. That is a real published URL and it
 * is what this downloads.
 *
 * NO SPREADSHEET LIBRARY. An .xlsx is a zip of XML, and the two things needed
 * here — the shared string table and one sheet — are about forty lines of
 * parsing. Adding a fourth npm dependency to read two files, on a repo whose
 * whole architecture is three, would be the wrong trade.
 *
 * ── THE RATE COLUMN IS TWO DIFFERENT THINGS ────────────────────────────────
 * URA heads it "$psm per GFA or $psm per GPR" and means it: some sites are
 * tendered on gross floor area and some on plot ratio, and the sheet does not
 * say which per row. They are NOT comparable to each other. Every rate here
 * therefore carries `basis: 'GFA-or-GPR'` and the page says so — a chart that
 * silently mixes the two would be inventing a series.
 *
 * Prices are nominal. 1993 dollars are not 2026 dollars and nothing here
 * pretends otherwise.
 *
 * Licence: URA publishes these for reference and research.
 */
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { markAwarded } from '../lib/gls-status.js';

const SOURCE = {
  name: 'URA Government Land Sales — past sale sites',
  page: 'https://www.ura.gov.sg/land-sales/past-sales-sites/',
};

/* ── THE LINK MOVES EVERY TIME URA UPDATES THE SHEET ───────────────────────
   This downloaded one fixed URL, .../243b544e-.../06 URA Vacant Sites (online
   version).xlsx. URA's asset host gives every upload a new folder, so when
   URA added the September awards the new sheet went to .../033342db-.../ and
   the old URL went on serving the 8 September copy. The refresh ran every
   three days, rewrote gls-awards.json from the stale file, and reported
   success: the New Upper Changi Road and Lorong Puntong awards never arrived.
   Shervin noticed and downloaded the sheet by hand.

   So the link is read from URA's page on every run. The page is otherwise a
   client-rendered app, but its download links are in the HTML. If the link
   cannot be found, the ingest FAILS — falling back to a remembered URL is
   exactly how it went stale without anyone knowing. */
export function currentFileUrl(html) {
  const links = [...String(html).matchAll(/href="(https:\/\/isomer-user-content\.by\.gov\.sg\/[^"]+\.xlsx)"/gi)].map(m => m[1]);
  const hit = links.find(u => /vacant%20sites|vacant sites/i.test(u) && !/infill/i.test(u));
  return { url: hit ? encodeURI(decodeURI(hit)) : null, links };
}

/* A file given by hand: `npm run ingest:gls-awards -- --file=path.xlsx`, for
   the day URA's page changes shape and the link cannot be found. */
const FILE_ARG = (process.argv.find(a => a.startsWith('--file=')) || '').slice(7);
const FORCE = process.argv.includes('--force');

/* Excel counts days from 1899-12-30 — the famous off-by-one that keeps the
 * 1900 leap-year bug compatible. Getting this wrong shifts every award by a
 * day or two, which nobody would notice and everybody would inherit. */
const EPOCH = Date.UTC(1899, 11, 30);
const excelDate = n => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return new Date(EPOCH + Math.round(v) * 86400000).toISOString().slice(0, 10);
};

/** The smallest zip reader that can open an .xlsx: stored and deflated only. */
function unzip(buf) {
  const files = new Map();
  // Walk the central directory backwards from the end-of-central-directory.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip — URA may have changed the file format');
  let off = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const method = buf.readUInt16LE(off + 10);
    const size = buf.readUInt32LE(off + 24);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const local = buf.readUInt32LE(off + 42);
    const lnLen = buf.readUInt16LE(local + 26);
    const leLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnLen + leLen;
    const raw = buf.subarray(start, start + buf.readUInt32LE(off + 20));
    files.set(name, method === 0 ? raw : zlib.inflateRawSync(raw, { maxOutputLength: 64 << 20 }));
    off += 46 + nameLen + extraLen + commentLen;
    void size;
  }
  return files;
}

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Shared strings, in order — cells reference them by index. */
function sharedStrings(xml) {
  const out = [];
  for (const si of xml.split('<si>').slice(1)) {
    out.push(decode([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join('')));
  }
  return out;
}

/** One sheet as an array of rows of strings. */
function sheetRows(xml, ss) {
  const rows = [];
  for (const r of xml.split('<row ').slice(1)) {
    const cells = [];
    for (const m of r.matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>|<c\s([^>]*)\/>/g)) {
      const attrs = m[1] || m[3] || '';
      const inner = m[2] || '';
      // Column letter → index, so a blank cell does not shift the row.
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] || '';
      let col = 0;
      for (const ch of ref) col = col * 26 + (ch.charCodeAt(0) - 64);
      col -= 1;
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
      const isStr = /t="s"/.test(attrs);
      const inlineStr = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('');
      while (cells.length <= col) cells.push('');
      cells[col] = isStr ? (ss[Number(v)] ?? '') : (v || decode(inlineStr));
    }
    rows.push(cells);
  }
  return rows;
}

const num = v => { const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

export async function ingestGlsAwards() {
  const accessedAt = new Date().toISOString();
  let buf, fileUrl, pageHtml = null;
  if (FILE_ARG) {
    buf = await fs.readFile(FILE_ARG);
    fileUrl = `local file: ${FILE_ARG.split('/').pop()}`;
    console.log(`  read ${(buf.length / 1024).toFixed(0)} KB from ${FILE_ARG}`);
  } else {
    const page = await fetch(SOURCE.page, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Truestorey/1.0; +https://truestorey.vercel.app)' } });
    if (!page.ok) throw new Error(`URA's past-sales page returned ${page.status}`);
    pageHtml = await page.text();
    const { url, links } = currentFileUrl(pageHtml);
    if (!url) {
      throw new Error('could not find the past-sites spreadsheet link on URA\'s page. '
        + `Spreadsheet links found: ${links.length ? links.join(' · ') : 'none'}. `
        + 'Download it from ' + SOURCE.page + ' and run: npm run ingest:gls-awards -- --file=<path>');
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'truestorey-ingest' } });
    if (!res.ok) throw new Error(`URA returned ${res.status} for ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
    fileUrl = url;
    console.log(`  downloaded ${(buf.length / 1024).toFixed(0)} KB from ${url}`);
  }

  // Saved so a parse failure can be read back rather than guessed at — the
  // lesson from the boundaries ingest, which failed silently on a markup
  // difference and reported "the source schema may have changed".
  await fs.writeFile(new URL('../data/.gls-awards-raw.xlsx', import.meta.url), buf);

  const files = unzip(buf);
  const ss = sharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') || '');
  const sheetName = [...files.keys()].find(n => /^xl\/worksheets\/sheet1\.xml$/.test(n));
  if (!sheetName) throw new Error('no sheet1 in the workbook');
  const rows = sheetRows(files.get(sheetName).toString('utf8'), ss);
  if (rows.length < 10) throw new Error(`only ${rows.length} rows parsed — the sheet layout has changed`);

  const H = rows[0].map(clean);
  const at = re => H.findIndex(h => re.test(h));
  const col = {
    launch: at(/date of launch/i), close: at(/tender closing/i), award: at(/date of award/i),
    where: at(/^location/i), use: at(/type of development/i), lease: at(/^lease/i),
    area: at(/site area/i), gpr: at(/^gpr/i), gfa: at(/^gfa/i), bids: at(/no\. of bids/i),
    who: at(/successful tenderer/i), price: at(/successful tender price/i),
    rate: at(/\$psm/i), area2: at(/planning area/i),
  };
  for (const [k, v] of Object.entries(col)) {
    if (v < 0) throw new Error(`column "${k}" is gone from the sheet — URA changed the layout. Header was: ${H.join(' | ')}`);
  }

  const sites = [];
  for (const r of rows.slice(1)) {
    const award = excelDate(r[col.award]);
    const price = num(r[col.price]);
    if (!award || !price) continue;           // not awarded, or no price published
    sites.push({
      award,
      launched: excelDate(r[col.launch]),
      closed: excelDate(r[col.close]),
      site: clean(r[col.where]),
      use: clean(r[col.use]).replace(/\s*\(.*$/, ''),
      useFull: clean(r[col.use]),
      lease: clean(r[col.lease]),
      areaSqm: num(r[col.area]),
      gpr: num(r[col.gpr]),
      gfaSqm: num(r[col.gfa]),
      bids: num(r[col.bids]),
      winner: clean(r[col.who]),
      price,
      /* URA's own heading is "$psm per GFA or $psm per GPR" and the sheet does
         not say which applies per row. Carried with that name so nothing
         downstream can mistake it for one basis. */
      psmGfaOrGpr: num(r[col.rate]),
      planningArea: clean(r[col.area2]),
    });
  }
  sites.sort((a, b) => (a.award < b.award ? 1 : -1));
  if (!sites.length) throw new Error('parsed the sheet but found no awarded sites');

  /* ── WHAT CHANGED, AND A WRONG FILE REFUSED ─────────────────────────────
     URA only ever adds awards. A sheet with fewer than the last one is the
     wrong sheet — the landed-housing list sits beside this one on URA's page,
     and a column check alone would not catch every mix-up — so it is refused
     rather than allowed to delete history. --force overrides, deliberately. */
  const OUT = new URL('../data/gls-awards.json', import.meta.url);
  let before = null;
  try { before = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* first run */ }
  if (before?.sites?.length && sites.length < before.sites.length && !FORCE) {
    throw new Error(`this sheet has ${sites.length} awarded sites and the current data has ${before.sites.length}. `
      + 'URA only adds awards, so this is probably the wrong file. Nothing was written. Re-run with --force if it is right.');
  }
  const key = s => `${s.site}|${s.award}`;
  const known = new Set((before?.sites || []).map(key));
  const added = sites.filter(s => !known.has(key(s)));

  const years = [...new Set(sites.map(s => s.award.slice(0, 4)))].sort();
  const out = {
    source: SOURCE.name,
    sourcePage: SOURCE.page,
    sourceFile: fileUrl,
    latestAward: sites[0].award,
    licence: 'URA publishes past sale sites for reference and research.',
    accessedAt,
    rateNote: 'URA heads the rate column "$psm per GFA or $psm per GPR". The sheet does not say '
            + 'which basis applies to a given site, so the two are not comparable to each other. '
            + 'Prices are nominal and are not adjusted for inflation.',
    counts: { awarded: sites.length, fromYear: years[0], toYear: years.at(-1) },
    sites,
  };
  await fs.writeFile(OUT, JSON.stringify(out));
  const kb = ((await fs.stat(OUT)).size / 1024).toFixed(0);
  console.log(`Wrote data/gls-awards.json — ${kb} KB · ${sites.length} awarded sites · ${years[0]}–${years.at(-1)} · latest award ${out.latestAward}`);
  const res_ = sites.filter(s => /^Residential|^Condominium/i.test(s.use)).length;
  console.log(`  ${res_} residential · ${sites.length - res_} other use`);
  console.log(added.length
    ? `  ${added.length} new since the last run:\n${added.map(s => `    ${s.award}  ${s.site} — ${s.bids ?? '?'} bids, S$${Number(s.price).toLocaleString('en-SG')}`).join('\n')}`
    : '  nothing new since the last run');

  /* The current programme's statuses follow the awards (lib/gls-status.js),
     so a site awarded this week stops reading "Open for tender". */
  const glsFile = new URL('../data/gls.json', import.meta.url);
  try {
    const gls = JSON.parse(await fs.readFile(glsFile, 'utf8'));
    const { sites: marked, changed } = markAwarded(gls, out);
    if (changed.length) {
      await fs.writeFile(glsFile, JSON.stringify({ ...gls, sites: marked }, null, 1));   // as ingest-gls writes it
      console.log(`  programme updated — now awarded: ${changed.join(', ')}`);
    }
  } catch (e) { console.warn(`  programme statuses not updated: ${e.message}`); }

  /* The landed-housing sheet sits beside this one on the same page. It is a
     closed history — URA's last separate landed award was in 2017 — but it
     is read the same way so the day URA adds one, it arrives. Its failure
     never fails the awards: it is the lesser dataset. */
  if (pageHtml) {
    try { await ingestLanded(pageHtml); }
    catch (e) { console.warn(`  landed housing sites not updated: ${e.message}`); }
  }
  return out;
}

/**
 * URA's landed housing sites, 1993 onwards: plots sold for terraces,
 * semi-detached houses and bungalows. Its rate is per square metre of SITE
 * area, not of floor area, so it is kept in its own file and never joins the
 * rate column above — the two are different measures of different things.
 */
export function landedFileUrl(html) {
  const links = [...String(html).matchAll(/href="(https:\/\/isomer-user-content\.by\.gov\.sg\/[^"]+\.xlsx)"/gi)].map(m => m[1]);
  const hit = links.find(u => /landed-housing-sites/i.test(u));
  return hit ? encodeURI(decodeURI(hit)) : null;
}

async function ingestLanded(html) {
  const url = landedFileUrl(html);
  if (!url) throw new Error('no landed-housing spreadsheet linked on URA\'s page');
  const res = await fetch(url, { headers: { 'User-Agent': 'truestorey-ingest' } });
  if (!res.ok) throw new Error(`URA returned ${res.status} for ${url}`);
  const files = unzip(Buffer.from(await res.arrayBuffer()));
  const ss = sharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') || '');
  const rows = sheetRows(files.get('xl/worksheets/sheet1.xml').toString('utf8'), ss);
  const H = rows[0].map(clean);
  const at = re => H.findIndex(h => re.test(h));
  const col = { launch: at(/date of launch/i), close: at(/tender closing/i), award: at(/date of award/i),
    where: at(/^location/i), use: at(/type of development/i), lease: at(/^lease/i), area: at(/site area/i),
    bids: at(/no\. of bids/i), who: at(/successful tenderer/i), price: at(/successful tender price/i),
    rate: at(/\$psm per site area/i), area2: at(/planning area/i) };
  for (const [k, v] of Object.entries(col)) if (v < 0) throw new Error(`landed sheet: column "${k}" is gone. Header was: ${H.join(' | ')}`);
  const sites = [];
  for (const r of rows.slice(1)) {
    const award = excelDate(r[col.award]);
    const price = num(r[col.price]);
    if (!award || !price) continue;
    sites.push({
      award, launched: excelDate(r[col.launch]), closed: excelDate(r[col.close]),
      site: clean(r[col.where]), use: 'Landed', useFull: clean(r[col.use]), lease: clean(r[col.lease]),
      areaSqm: num(r[col.area]), bids: num(r[col.bids]), winner: clean(r[col.who]), price,
      psmSite: num(r[col.rate]), planningArea: clean(r[col.area2]),
    });
  }
  sites.sort((a, b) => (a.award < b.award ? 1 : -1));
  const OUT = new URL('../data/gls-landed.json', import.meta.url);
  let before = null;
  try { before = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* first run */ }
  if (before?.sites?.length && sites.length < before.sites.length && !FORCE) {
    throw new Error(`landed sheet has ${sites.length} awarded plots against ${before.sites.length} on file; not written`);
  }
  const years = [...new Set(sites.map(s => s.award.slice(0, 4)))].sort();
  await fs.writeFile(OUT, JSON.stringify({
    source: 'URA landed housing sites — past sales', sourcePage: SOURCE.page, sourceFile: url,
    licence: 'URA publishes past sale sites for reference and research.',
    accessedAt: new Date().toISOString(), latestAward: sites[0]?.award || null,
    rateNote: 'The rate is per square metre of SITE area. It is not comparable to the per-GFA rates of the main awards list.',
    counts: { awarded: sites.length, fromYear: years[0], toYear: years.at(-1) },
    sites,
  }));
  console.log(`Wrote data/gls-landed.json — ${sites.length} landed plots · ${years[0]}–${years.at(-1)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestGlsAwards().catch(e => { console.error('\nGLS AWARDS INGEST FAILED:', e.message); process.exit(1); });
}
