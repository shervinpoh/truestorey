/**
 * Bringing an export in — listings or REALIS — through a drop folder or an
 * upload in the consult panel.
 *
 * ── ONE IMPLEMENTATION, TWO DOORS ─────────────────────────────────────────
 * The ingests began as CLI scripts that read a folder. The panel's upload needs
 * the same parsing, the same address resolution and the same merge, and a
 * second copy inside the server is the failure this repo already has a note
 * about. So everything that decides what a row BECOMES lives here, and
 * scripts/ingest-*.mjs and the panel are both thin doors onto it.
 *
 * ── TWO BUGS THE SECOND DOOR FOUND ────────────────────────────────────────
 * `npm run ingest:listings` read EVERY CSV in data/listings/ on every run and
 * never moved them. Drop week 2's export beside week 1's and week 1 is read
 * again as part of week 2's snapshot: a listing that left the market is seen
 * again and never goes gone, and a listing whose price moved has both prices
 * folded into one snapshot in whatever order the directory lists them.
 * Reproduced before fixing: snapshot 2 read 3 rows where it should have read
 * 1. Processed files are now archived and only new ones are read.
 *
 * The size check compared a listing against the POOLED median of every flat
 * type at the address. 275A Bishan St 24 files 4-room flats at a median of 95
 * sqm and 5-room at 120; a correctly stated 93 sqm 4-room was flagged as a
 * mis-stated size. It now compares like with like or does not run — see
 * sizeCheck().
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, mapColumns, num } from './csv.js';
import { merge, emptyStore } from './listings.js';
import { checkArea } from './listing.js';
import { search, recordByHref } from '../data/query.js';
import { comps } from '../blindspot/measure.js';
import { hdbHref } from '../name.js';

const SQFT_PER_SQM = 10.7639;

export const paths = (root = process.cwd()) => ({
  listingsDir: path.join(root, 'data', 'listings'),
  listingsArchive: path.join(root, 'data', 'listings', 'imported'),
  listingsStore: path.join(root, 'data', '.listings.json'),
  realisDir: path.join(root, 'data', 'realis'),
  realisStore: path.join(root, 'data', '.realis.json'),
});

/**
 * A filename that cannot leave the folder it is written to.
 *
 * The panel has no authentication and binds to the LAN, so an upload's name is
 * whatever the request says it is. `../../app/page.jsx` must become a harmless
 * CSV inside data/, never a path out of it.
 */
export function safeName(name) {
  const base = path.basename(String(name || 'upload.csv'))
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 80) || 'upload';
  return /\.csv$/i.test(base) ? base : `${base}.csv`;
}

const stamp = at => String(at).replace(/[:.]/g, '-');

/* ── column aliases ──────────────────────────────────────────────────────
 * Written in normalised form — lower case, no punctuation — because headers
 * are normalised before comparison, so an alias carrying either can never
 * match. And no alias may appear under two fields: mapColumns gives a header
 * to the FIRST field that claims it, so a shared alias silently files a column
 * under the wrong one. 'area' was listed under both `town` and `areaSqft`, and
 * a column headed "Area" went to town. test/consult.test.js now asserts both. */

export const LISTING_ALIASES = {
  address: ['address', 'propertyname', 'location', 'fulladdress', 'addressline'],
  block:   ['block', 'blk', 'blockno', 'blocknumber'],
  street:  ['street', 'streetname', 'road'],
  project: ['project', 'projectname', 'development'],
  town:    ['town', 'estate', 'planningarea'],
  price:   ['askingprice', 'price', 'listingprice', 'askprice', 'askingpricesgd'],
  areaSqft: ['areasqft', 'floorarea', 'size', 'sizesqft', 'builtup', 'builtuparea', 'area',
             'floorareasqft', 'areasquarefeet', 'builtupsqft'],
  areaSqm: ['areasqm', 'floorareasqm', 'sizesqm'],
  floor:   ['floor', 'storey', 'level'],
  unit:    ['unitno', 'unit', 'unitnumber'],
  flatType: ['flattype', 'propertytype', 'type', 'bedrooms', 'beds', 'roomtype'],
  url:     ['url', 'link', 'listingurl', 'weblink', 'listinglink'],
  listedAt: ['listeddate', 'datelisted', 'listingdate', 'posted', 'dateposted'],
  status:  ['status', 'listingstatus'],
};

export const REALIS_ALIASES = {
  project:   ['projectname', 'project', 'development', 'projectdevelopment'],
  street:    ['streetname', 'street', 'address', 'addressofproperty'],
  unit:      ['unitno', 'unitnumber', 'unit', 'stackunit', 'floorunit'],
  areaSqm:   ['areasqm', 'area', 'floorareasqm', 'strataareasqm', 'areasquaremetres'],
  areaSqft:  ['areasqft', 'floorareasqft', 'areasquarefeet'],
  price:     ['transactedprice', 'price', 'saleprice', 'transactionprice'],
  date:      ['saledate', 'contractdate', 'dateofsale', 'transactiondate'],
  propertyType: ['propertytype', 'type'],
  tenure:    ['tenure', 'typeoflease'],
  district:  ['postaldistrict', 'district'],
  postal:    ['postalcode', 'postcode'],
  typeOfSale: ['typeofsale', 'saletype'],
  completion: ['completiondate', 'topdate', 'yearofcompletion'],
  marketSegment: ['marketsegment', 'segment'],
};

const describeMapping = (head, col) =>
  head.map((h, i) => ({ header: h, field: Object.keys(col).find(k => col[k] === i) || null }));

/**
 * "#08-123" → floor 8, stack 123. Units sharing a stack share orientation,
 * corner-or-corridor position, outlook and noise, so a stack captures all four
 * at once and none has to be estimated.
 */
export function unitParts(u) {
  const m = String(u || '').match(/#?\s*(\d{1,3})\s*-\s*(\w{1,5})/);
  if (!m) return { floor: null, stack: null };
  const f = Number(m[1]);
  return { floor: f >= 1 && f <= 99 ? f : null, stack: m[2].toUpperCase() };
}

/**
 * A listing's flat type in HDB's vocabulary, or null.
 *
 * Only an unambiguous "N room" or "executive". "3 bedroom" is NOT a 3-room
 * flat — a 3-room HDB has two bedrooms — and guessing across the two
 * vocabularies would compare a listing against the wrong type's sizes.
 */
export function typeFromListing(s) {
  const t = String(s || '');
  const m = t.match(/\b([1-5])\s*-?\s*(?:rm|room)\b/i);
  if (m) return `${m[1]} ROOM`;
  if (/\bexec(?:utive)?\b/i.test(t)) return 'EXECUTIVE';
  if (/multi.?gen/i.test(t)) return 'MULTI-GENERATION';
  return null;
}

/**
 * Is the advertised size plausible — compared like with like, or not at all.
 *
 * Runs on HDB only, and only when the comparison is about the right flat: the
 * listing names its type, or the block files a single type. A block with
 * 4-room and 5-room flats has two size norms, and a pooled median calls a
 * correct 4-room a mis-stated 5-room. A condominium never qualifies — one
 * property type there spans studios to penthouses, so its median floor area
 * describes nothing.
 */
export function sizeCheck(rec, areaSqft, statedType = null) {
  if (!rec || !(areaSqft > 0)) return { ran: false, why: 'No record or no floor area to check.' };
  if (rec.kind !== 'HDB') {
    return { ran: false, why: 'Size is not checked on private property — one property type spans studios to penthouses.' };
  }
  const sales = comps().records?.[rec.href]?.sales || [];
  const types = [...new Set(sales.map(s => s[3]))];
  let type = typeFromListing(statedType) || (types.length === 1 ? types[0] : null);
  let inferred = false;
  if (!type) {
    /* No type stated, several filed. If the size sits inside exactly one
       type's filed range it can only be that type — a 1,000 sqft flat in a
       block of 4- and 5-rooms is the 4-room — so check it as one. Inside
       none is itself the finding; inside two is genuinely ambiguous. */
    const fits = types.filter(t => checkArea({ areaSqft, sales, type: t }).plausible);
    if (fits.length === 1) { type = fits[0]; inferred = true; }
    else if (fits.length === 0 && types.length) {
      const all = checkArea({ areaSqft, sales, type: null });
      return { ...all, plausible: false, type: null,
               why: `The listing says ${Math.round(areaSqft).toLocaleString('en-SG')} sqft, which matches none of the ${types.length} flat types this block has filed.` };
    } else {
      return { ran: false, why: `That size fits more than one of this block's flat types; state the type to check it.` };
    }
  }
  return { ...checkArea({ areaSqft, sales, type }), type, inferred };
}

/* ── listings ────────────────────────────────────────────────────────── */

export function parseListings(text) {
  const { head, rows: raw, skippedPreamble, ragged } = parseCsv(text, { known: LISTING_ALIASES, minHits: 2 });
  if (!head) {
    return { ok: false, reason: 'No header row recognised — fewer than two known columns (price, address, size, URL…) in the first twelve lines.' };
  }
  const { col, unmapped } = mapColumns(head, LISTING_ALIASES);
  const rows = [];
  let noPrice = 0, fuzzy = 0;
  const unresolved = [], implausible = [];

  for (const r of raw) {
    const price = num(r[col.price]);
    if (!price) { noPrice++; continue; }
    let areaSqft = num(r[col.areaSqft]);
    const sqm = num(r[col.areaSqm]);
    if (!areaSqft && sqm) areaSqft = Math.round(sqm * SQFT_PER_SQM);

    /* Most explicit first. A fuzzy match is recorded as fuzzy — pricing the
       wrong block silently is the worst thing this pipeline could do. */
    let rec = null, matchedBy = null;
    const town = r[col.town], block = r[col.block], street = r[col.street];
    if (town && block && street) { rec = recordByHref(hdbHref(town, block, street)); if (rec) matchedBy = 'town/block/street'; }
    const q = [r[col.address], r[col.project], [block, street].filter(Boolean).join(' ')].filter(Boolean).join(' ').trim();
    if (!rec && q) {
      const hit = search(q, { limit: 1 })[0];
      if (hit) { rec = recordByHref(hit.href); matchedBy = 'search'; fuzzy++; }
    }
    if (!rec && q && unresolved.length < 8) unresolved.push(q);

    const stated = r[col.flatType] || null;
    if (rec && areaSqft) {
      const chk = sizeCheck(rec, areaSqft, stated);
      if (chk.ran && !chk.plausible && implausible.length < 8) implausible.push({ label: rec.label, why: chk.why });
    }

    const floorFromUnit = unitParts(r[col.unit]).floor;
    rows.push({
      href: rec?.href || null, label: rec?.label || q || null, matchedBy,
      url: r[col.url] || null, unit: r[col.unit] || null,
      price, areaSqft: areaSqft || null,
      floor: num(r[col.floor]) || floorFromUnit || null,
      flatType: stated, listedAt: r[col.listedAt] || null,
    });
  }

  const missingFields = [];
  if (col.price === undefined) missingFields.push('asking price');
  if (col.areaSqft === undefined && col.areaSqm === undefined) missingFields.push('floor area');
  if ([col.address, col.project, col.block, col.url].every(v => v === undefined)) missingFields.push('an address or listing URL');

  return {
    ok: true, mapping: describeMapping(head, col), unmapped, rows, read: raw.length,
    noPrice, fuzzy, unresolvedCount: rows.filter(x => !x.href).length, unresolved, implausible,
    skippedPreamble, ragged, missingFields,
  };
}

/** Top-level CSVs not yet imported. The archive folder is a directory, so it
 *  never matches — which is the whole fix for the re-read bug. */
export function pendingListingFiles(root) {
  const { listingsDir } = paths(root);
  if (!fs.existsSync(listingsDir)) return [];
  return fs.readdirSync(listingsDir, { withFileTypes: true })
    .filter(e => e.isFile() && /\.csv$/i.test(e.name)).map(e => e.name).sort();
}

/** Move imported files out of the drop folder, so the next run cannot read them again. */
export function archiveListingFiles(names, { root, at = new Date().toISOString() } = {}) {
  const { listingsDir, listingsArchive } = paths(root);
  fs.mkdirSync(listingsArchive, { recursive: true });
  for (const n of names) {
    fs.renameSync(path.join(listingsDir, n), path.join(listingsArchive, `${stamp(at)}-${safeName(n)}`));
  }
}

/** Keep an uploaded file with the others it was imported beside. */
export function archiveListingUpload(name, text, { root, at = new Date().toISOString() } = {}) {
  const { listingsArchive } = paths(root);
  fs.mkdirSync(listingsArchive, { recursive: true });
  const file = `${stamp(at)}-${safeName(name)}`;
  fs.writeFileSync(path.join(listingsArchive, file), text);
  return file;
}

/**
 * Fold one or more files into the store as ONE snapshot.
 *
 * Several files at once are one sweep — an HDB export and a condo export
 * pulled the same week are two halves of one look at the market. Importing
 * them one at a time as full sweeps would have the first retire everything in
 * the second.
 *
 * `partial` has no default. It decides whether anything absent is marked gone,
 * and a wrong guess looks exactly like a market signal.
 *
 * A FULL sweep is REFUSED when a file could not be read or when the sweep holds
 * no listings — either would mark real listings gone because of a broken file.
 */
export function importListings({ files = [], parsed = null, partial, at = new Date().toISOString(), root, dryRun = false } = {}) {
  if (partial !== true && partial !== false) {
    return { ok: false, refused: true, reason: 'Say whether this covers everything you watch (full) or a subset (partial). Only a full sweep marks listings gone.' };
  }
  const P = paths(root);
  const done = parsed || files.map(f => ({ name: f.name, ...parseListings(f.text) }));
  const bad = done.filter(p => !p.ok);
  const rows = done.filter(p => p.ok).flatMap(p => p.rows);

  if (!partial && bad.length) {
    return { ok: false, refused: true,
      reason: `${bad.length} file(s) could not be read. A full sweep treats anything missing as gone, so an unreadable file would retire every listing in it. Fix it, or import the rest as partial.` };
  }
  if (!partial && !rows.length) {
    return { ok: false, refused: true, reason: 'This sweep holds no listings. As a full sweep it would mark every active listing gone.' };
  }

  const current = fs.existsSync(P.listingsStore) ? JSON.parse(fs.readFileSync(P.listingsStore, 'utf8')) : emptyStore();
  const activeBefore = Object.values(current.listings).filter(L => L.status === 'active').length;
  const store = dryRun ? structuredClone(current) : current;
  const r = merge(store, rows, { at, label: done.map(p => p.name).join(', '), partial });

  if (!dryRun) {
    fs.mkdirSync(path.dirname(P.listingsStore), { recursive: true });
    fs.writeFileSync(P.listingsStore, JSON.stringify(r.store));
  }
  const all = Object.values(r.store.listings);
  return {
    ok: true, dryRun, partial, rows: rows.length,
    added: r.added, cut: r.cut, raised: r.raised, gone: r.gone,
    /* A full sweep that retires most of what was active is more likely a
       narrower export than a market that emptied in a week. Warned, not
       refused — it can be true. */
    goneShare: activeBefore ? r.gone / activeBefore : 0,
    active: all.filter(L => L.status === 'active').length, known: all.length,
    snapshots: r.store.snapshots.length, first: r.store.snapshots.length === 1,
  };
}

/* ── REALIS ──────────────────────────────────────────────────────────── */

export function parseRealis(text) {
  const { head, rows: raw, skippedPreamble, ragged } = parseCsv(text, { known: REALIS_ALIASES, minHits: 3 });
  if (!head) return { ok: false, reason: 'No header row recognised — fewer than three known REALIS columns in the first twelve lines.' };
  const { col, unmapped } = mapColumns(head, REALIS_ALIASES);
  const rows = [];
  let skippedRows = 0;
  for (const r of raw) {
    const price = num(r[col.price]);
    let areaSqm = num(r[col.areaSqm]);
    const areaSqft = num(r[col.areaSqft]);
    if (!areaSqm && areaSqft) areaSqm = areaSqft / SQFT_PER_SQM;
    if (!(price > 0) || !(areaSqm > 0)) { skippedRows++; continue; }
    const { floor, stack } = unitParts(r[col.unit]);
    rows.push({
      project: r[col.project] || null, street: r[col.street] || null, unit: r[col.unit] || null,
      floor, stack, areaSqm: Math.round(areaSqm * 10) / 10, price,
      psf: price / (areaSqm * SQFT_PER_SQM),
      date: r[col.date] || null, propertyType: r[col.propertyType] || null,
      tenure: r[col.tenure] || null, district: r[col.district] || null,
      typeOfSale: r[col.typeOfSale] || null, marketSegment: r[col.marketSegment] || null,
      source: 'realis',
    });
  }
  return { ok: true, mapping: describeMapping(head, col), unmapped, rows, read: raw.length,
           skippedRows, skippedPreamble, ragged, noUnitColumn: col.unit === undefined };
}

/** What identifies one transaction across exports that overlap. */
export const realisKey = r => (r.unit
  ? `${r.project}|${r.unit}|${r.date}|${r.price}`
  : `${r.project}|${r.street}|${r.areaSqm}|${r.date}|${r.price}`);

/** Save an uploaded export beside the others, never over one. */
export function saveRealisUpload(name, text, { root, at = new Date().toISOString() } = {}) {
  const { realisDir } = paths(root);
  fs.mkdirSync(realisDir, { recursive: true });
  let file = safeName(name);
  if (fs.existsSync(path.join(realisDir, file))) file = `${stamp(at)}-${file}`;
  fs.writeFileSync(path.join(realisDir, file), text);
  return file;
}

/**
 * Rebuild the REALIS index from every export in the folder.
 *
 * Rebuilt rather than merged: a transaction does not change, so the folder IS
 * the record, and re-reading it is correct here in a way it was not for
 * listings. What does need handling is OVERLAP — a January–June export and an
 * April–September one carry the same transactions twice, and a duplicated sale
 * inside a stack is one piece of evidence counted twice.
 */
export function rebuildRealis({ root } = {}) {
  const P = paths(root);
  /* Created here, not only by the panel's upload path. The documented command
     is `cp your-export.csv data/realis/ && npm run ingest:realis`, and on a
     clean checkout — or after anyone removes the folder — the cp fails before
     the ingest ever runs, with an error about a missing directory that says
     nothing about what to do. The folder is gitignored, so it is absent far
     more often than it is present. */
  fs.mkdirSync(P.realisDir, { recursive: true });
  const files = fs.readdirSync(P.realisDir).filter(f => /\.csv$/i.test(f)).sort();
  if (!files.length) return { ok: false, reason: 'No REALIS exports yet — data/realis/ is empty.', dir: P.realisDir };

  const seen = new Set(), rows = [], unmapped = new Set(), perFile = [];
  let duplicates = 0;
  for (const f of files) {
    const p = parseRealis(fs.readFileSync(path.join(P.realisDir, f), 'utf8'));
    if (!p.ok) { perFile.push({ file: f, ok: false, reason: p.reason }); continue; }
    p.unmapped.forEach(h => unmapped.add(h));
    let kept = 0;
    for (const r of p.rows) {
      const k = realisKey(r);
      if (seen.has(k)) { duplicates++; continue; }
      seen.add(k); rows.push(r); kept++;
    }
    perFile.push({ file: f, ok: true, read: p.read, kept, skippedRows: p.skippedRows });
  }
  const out = {
    source: 'URA REALIS (licensed export)',
    licence: 'Subscription terms govern use and redistribution. NOT for the public site — rule 1.',
    ingestedAt: new Date().toISOString(),
    files: perFile.filter(x => x.ok).length, perFile,
    count: rows.length, duplicates,
    withUnitNumber: rows.filter(r => r.stack).length,
    stacks: new Set(rows.filter(r => r.stack).map(r => `${r.project}|${r.stack}`)).size,
    unmappedColumns: [...unmapped],
    rows,
  };
  fs.writeFileSync(P.realisStore, JSON.stringify(out));
  const { rows: _omit, ...summary } = out;
  return { ok: true, ...summary };
}
