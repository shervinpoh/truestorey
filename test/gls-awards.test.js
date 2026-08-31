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
