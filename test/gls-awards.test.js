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

/* The column URA does not have, and the reason this source is worth the manual
 * step: it says what each site BECAME. */
test('every HDB site names the project it became', hHas, () => {
  assert.ok(h.sites.length > 100, `only ${h.sites.length} sites`);
  assert.equal(h.counts.withProject, h.sites.length,
    'a site without a project name has appeared — check the parse');
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
