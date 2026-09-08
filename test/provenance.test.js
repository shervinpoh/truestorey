/**
 * A note Shervin writes is not less sourced than one a pipeline files.
 *
 * The "What this was written from" panel rendered only for a pipeline article,
 * because only a pipeline article had source_urls. So the audit that flags an
 * unsourced article would have flagged every hand-written note too — and been
 * right to, because the page showed no provenance at all.
 *
 * It is sourced differently and better. A shortcode reads this site's own
 * filed data at build time: {{index}} is the current HDB index with its
 * quarter and its agency, not a number somebody typed. Each embed already
 * printed its own source line; nothing said so at the level of the piece.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { shortcodesIn, datasetsFor, provenanceOf } from '../lib/provenance.js';

test('every shortcode in a body is found once, whatever its argument', () => {
  const body = 'Text {{index}} more {{block:/hdb/a/b}} and {{index}} again {{mop:TAMPINES}} {{ sora }}';
  assert.deepEqual(shortcodesIn(body), ['index', 'block', 'mop', 'sora']);
  assert.deepEqual(shortcodesIn('nothing here'), []);
  assert.deepEqual(shortcodesIn(null), []);
});

test('a dataset is only claimed when it is actually in the build', () => {
  // SORA is absent from data/ on a machine that has not run the ingest. A
  // provenance line naming a dataset the reader cannot see would be worse
  // than none, so it must be omitted rather than asserted.
  for (const d of datasetsFor('{{index}} {{sora}} {{mop}} {{block:/hdb/a/b}}')) {
    assert.ok(d.source && d.source.length > 4, `${d.label} has no source string`);
    assert.ok(d.label, 'a dataset line with no label');
  }
  assert.deepEqual(datasetsFor('no shortcodes'), []);
});

test('one line per dataset, however many times it is quoted', () => {
  const many = datasetsFor('{{block:/hdb/a/b}} {{block:/hdb/c/d}} {{town:bishan}}');
  const sources = many.map(d => d.source);
  assert.equal(new Set(sources).size, sources.length, 'the same dataset is listed twice');
});

test('shortcodes are never run over a pipeline article', () => {
  // Pipeline HTML is sanitised on the way in and rendered as-is; a shortcode
  // that arrived in it would be quoting a figure nobody wrote. Its provenance
  // is its URLs and nothing else.
  const p = provenanceOf({ html: '<p>{{index}}</p>', body: '{{index}}', sources: ['https://www.ura.gov.sg/x'] });
  assert.deepEqual(p.datasets, []);
  assert.deepEqual(p.urls, ['https://www.ura.gov.sg/x']);
  assert.equal(p.any, true);
});

test('a post with neither URLs nor datasets shows no panel', () => {
  const p = provenanceOf({ body: 'Two sentences with no figures in them.', sources: [] });
  assert.equal(p.any, false, 'an unsourced note must not render an empty provenance panel');
});

test('a note with a shortcode counts as sourced', () => {
  const p = provenanceOf({ body: 'The index sits at {{index}} today.', sources: [] });
  assert.ok(p.any, 'a figure read from filed data is provenance and must count as it');
  assert.ok(p.datasets.length > 0);
});

/* ── the wiring, so the panel cannot go back to one branch ─────────────────── */

const insightSrc = readFileSync(path.join(process.cwd(), 'components', 'Insight.jsx'), 'utf8');

test('both kinds of post render the provenance panel', () => {
  const hits = insightSrc.match(/<Provenance post=\{post\} \/>/g) || [];
  assert.equal(hits.length, 2,
    'the panel renders on only one branch again — a hand-written note will show no sources');
});

test('a file note can declare URL sources in its frontmatter', () => {
  const src = readFileSync(path.join(process.cwd(), 'lib', 'insights.js'), 'utf8');
  assert.match(src, /sources:.*Array\.isArray\(data\.sources\)/s,
    'insights.js no longer reads a sources: list, so a note about something published elsewhere cannot name it');
  const scaffold = readFileSync(path.join(process.cwd(), 'scripts', 'new-note.mjs'), 'utf8');
  assert.match(scaffold, /'sources: \[\]'/, 'npm run note stopped offering the field');
});
