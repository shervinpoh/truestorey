import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const url = new URL('../data/gls-awards.json', import.meta.url);
const has = { skip: existsSync(url) ? false : 'gls-awards.json not ingested here' };
const d = existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : null;

test('every awarded site has a date, a price and a winner', has, () => {
  assert.ok(d.sites.length > 300, `only ${d.sites.length} sites`);
  for (const s of d.sites) {
    assert.match(s.award, /^\d{4}-\d{2}-\d{2}$/, `${s.site} has no award date`);
    assert.ok(s.price > 0, `${s.site} has no price`);
    assert.ok(s.site.length > 0);
  }
});

test('sites run newest first and span three decades', has, () => {
  for (let i = 1; i < d.sites.length; i++) {
    assert.ok(d.sites[i - 1].award >= d.sites[i].award, 'award order broke');
  }
  assert.ok(Number(d.counts.fromYear) <= 1995);
  assert.ok(Number(d.counts.toYear) >= 2025);
});

/*
 * URA heads the rate column "$psm per GFA or $psm per GPR" and the sheet does
 * not say which applies per row. If that caveat is ever dropped, the charts
 * start silently mixing two measures — so the note travels with the data, not
 * only with the page.
 */
test('the rate carries its own ambiguity', has, () => {
  assert.match(d.rateNote, /per GFA or \$psm per GPR/);
  assert.match(d.rateNote, /not comparable/);
  assert.match(d.rateNote, /nominal/);
  // The field is named after the ambiguity so nothing downstream can forget it.
  assert.ok('psmGfaOrGpr' in d.sites[0]);
});

/* CEA PG 02-11 s3.1 — the figures need their source and the date they were
 * taken, and this one is a spreadsheet that URA republishes as tenders close. */
test('the source and the access date travel with the data', has, () => {
  assert.match(d.source, /URA Government Land Sales/);
  assert.match(d.sourcePage, /^https:\/\/www\.ura\.gov\.sg\//);
  assert.match(d.accessedAt, /^\d{4}-\d{2}-\d{2}T/);
});

/* The whole reason this dataset is worth having: a land price is a FACT, and
 * nothing here may quietly become an estimate of anything else. */
test('nothing in the data is a projection', has, () => {
  const blob = JSON.stringify(d).toLowerCase();
  for (const bad of ['projected', 'estimated launch price', 'breakeven', 'margin', 'forecast']) {
    assert.ok(!blob.includes(bad), `the awards data contains "${bad}"`);
  }
});

/* The raw workbook must be gitignored AND excluded from the serverless trace.
 * Forgetting the second has happened twice in this repo. */
test('the raw download is kept out of the bundle as well as out of git', () => {
  const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  const cfg = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
  assert.match(ignore, /gls-awards-raw\.xlsx/, 'raw workbook is not gitignored');
  assert.match(cfg, /gls-awards-raw\.xlsx/, 'raw workbook is not in outputFileTracingExcludes');
});

/* ── HDB's half ─────────────────────────────────────────────────────────── */
const hUrl = new URL('../data/sources/hdb-sites-sold.json', import.meta.url);
const hHas = { skip: existsSync(hUrl) ? false : 'hdb-sites-sold.json not parsed here' };
const h = existsSync(hUrl) ? JSON.parse(readFileSync(hUrl, 'utf8')) : null;

/*
 * The column URA does not have, and the reason this source is worth the manual
 * step: most rows say what the site BECAME.
 *
 * NOT every row, and the first version of this test wrongly demanded that. It
 * was written when the condominium sheet was the only input, where all 120
 * name a project. The EC sheet does not: a site awarded recently can be named
 * later, and the newest one — Yishun E13, awarded April 2026 — has no project
 * yet. Asserting "all" would have made a true row look like a parse failure.
 */
test('the project a site became is captured wherever HDB publishes one', hHas, () => {
  assert.ok(h.sites.length > 200, `only ${h.sites.length} sites`);
  assert.ok(h.counts.withProject / h.sites.length > 0.9,
    `only ${h.counts.withProject} of ${h.sites.length} name a project — check the parse`);
  // An unnamed site is null, never an empty string: one is a fact, the other
  // is a parse that lost something.
  for (const s of h.sites) assert.ok(s.project === null || s.project.length > 0);
  for (const s of h.sites) {
    assert.match(s.award, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.price > 0);
    assert.equal(s.vendor, 'HDB');
  }
});

/*
 * "N.A." is not zero, and "(max)" is a ceiling not a value. Both were rows the
 * first parser dropped, and both are the kind of thing that becomes a wrong
 * figure rather than a missing one if handled carelessly.
 */
/* Three sheets, three schemas — and the EC one is the only complete market
 * series of its kind published anywhere. */
test('all three sheets are represented', hHas, () => {
  const kinds = h.counts.byKind;
  for (const k of ['Condominium', 'EC', 'Mixed']) {
    assert.ok(kinds[k] > 10, `${k} has only ${kinds[k] ?? 0} sites — a sheet failed to parse`);
  }
});

test('a field HDB does not publish is null, never zero', hHas, () => {
  for (const s of h.sites) {
    for (const k of ['gpr', 'gfaSqm', 'areaSqm']) {
      assert.ok(s[k] === null || s[k] > 0, `${s.site} has ${k} = ${s[k]}`);
    }
  }
  assert.ok(h.sites.some(s => s.gpr === null), 'nothing is null — the N.A. handling has gone');
  assert.match(h.note, /null rather than zero|null and never zero/);
  assert.match(h.note, /ceiling/);
});

/* HDB publishes no rate column. The page must show a dash rather than a figure
 * this site worked out, because URA's own rate column is ambiguous about its
 * basis and a derived one would be silently compared against it. */
test('no rate is invented for a vendor that does not publish one', hHas, () => {
  for (const s of h.sites) assert.ok(!('psmGfaOrGpr' in s) || s.psmGfaOrGpr == null);
  const view = readFileSync(new URL('../components/LandView.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /price\s*\/\s*(s\.)?gfaSqm/, 'a rate is being derived in the view');
});

test('the manual step is explained rather than hidden', hHas, () => {
  assert.match(h.sourcePage, /^https:\/\/www\.hdb\.gov\.sg\//);
  assert.match(h.note, /no stable download URL/);
  assert.match(h.transcribed, /^\d{4}-\d{2}-\d{2}$/);
});

/* ── the bid detail ─────────────────────────────────────────────────────────
 *
 * HDB appends every tenderer and every losing bid to each sheet, and nobody
 * surfaces it. The main table says "9 bidders", which tells you a site was
 * contested; the second bid tells you whether it was contested CLOSELY.
 */
test('every bid list is headed by the price the table already published', hHas, () => {
  const withBids = h.sites.filter(s => s.bidDetail?.length);
  assert.ok(withBids.length > 150, `only ${withBids.length} sites carry bids`);
  for (const s of withBids) {
    assert.equal(s.bidDetail[0].bid, s.price,
      `${s.site}: the top bid (${s.bidDetail[0].bid}) is not the tender price (${s.price})`);
  }
});

/*
 * This assertion found two real bugs before it was a test.
 *
 * ONE — a plain startsWith attached "Bukit Batok E1"'s bids to "Bukit Batok
 * E11". A site whose own parcel has no bid detail will happily match a shorter
 * parcel's, producing a complete and plausible list of bids belonging to a
 * different piece of land.
 *
 * TWO — the parser keyed on the leading rank number, and HDB omits the "1" for
 * Pasir Ris E6. That site appeared to have been won by the second-highest
 * bidder, at a price contradicting its own table.
 *
 * Neither looked wrong on the page. Both were caught only by reconciling
 * against a figure the source had already published twice.
 */
test('bids descend, rank follows the amount, and none is negative', hHas, () => {
  for (const s of h.sites.filter(x => x.bidDetail?.length)) {
    let prev = Infinity;
    s.bidDetail.forEach((b, i) => {
      assert.equal(b.rank, i + 1, `${s.site}: rank ${b.rank} at position ${i + 1}`);
      assert.ok(b.bid > 0 && b.bid <= prev, `${s.site}: bids out of order at rank ${b.rank}`);
      assert.ok(b.tenderer.length > 1, `${s.site}: rank ${b.rank} has no tenderer`);
      prev = b.bid;
    });
  }
});

test('a site with no published bid list carries null, not an empty one', hHas, () => {
  for (const s of h.sites) {
    assert.ok(s.bidDetail === null || s.bidDetail.length > 0,
      `${s.site} has an empty bid list, which means the parse lost something`);
  }
});
