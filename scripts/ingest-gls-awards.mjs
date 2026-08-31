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

const SOURCE = {
  name: 'URA Government Land Sales — past sale sites',
  page: 'https://www.ura.gov.sg/land-sales/past-sales-sites/',
  file: 'https://isomer-user-content.by.gov.sg/467/243b544e-2b84-4c73-8d41-ae9d63ae9c4c/06%20URA%20Vacant%20Sites%20(online%20version).xlsx',
};

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
  const res = await fetch(SOURCE.file, { headers: { 'User-Agent': 'truestorey-ingest' } });
  if (!res.ok) throw new Error(`URA returned ${res.status} for the past-sites spreadsheet`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  downloaded ${(buf.length / 1024).toFixed(0)} KB`);

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

  const years = [...new Set(sites.map(s => s.award.slice(0, 4)))].sort();
  const out = {
    source: SOURCE.name,
    sourcePage: SOURCE.page,
    sourceFile: SOURCE.file,
    licence: 'URA publishes past sale sites for reference and research.',
    accessedAt,
    rateNote: 'URA heads the rate column "$psm per GFA or $psm per GPR". The sheet does not say '
            + 'which basis applies to a given site, so the two are not comparable to each other. '
            + 'Prices are nominal and are not adjusted for inflation.',
    counts: { awarded: sites.length, fromYear: years[0], toYear: years.at(-1) },
    sites,
  };
  await fs.writeFile(new URL('../data/gls-awards.json', import.meta.url), JSON.stringify(out));
  const kb = ((await fs.stat(new URL('../data/gls-awards.json', import.meta.url))).size / 1024).toFixed(0);
  console.log(`Wrote data/gls-awards.json — ${kb} KB · ${sites.length} awarded sites · ${years[0]}–${years.at(-1)}`);
  const res_ = sites.filter(s => /^Residential|^Condominium/i.test(s.use)).length;
  console.log(`  ${res_} residential · ${sites.length - res_} other use`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestGlsAwards().catch(e => { console.error('\nGLS AWARDS INGEST FAILED:', e.message); process.exit(1); });
}
