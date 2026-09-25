/**
 * The paragraph under a Blindspot score may say nothing the score does not.
 *
 * It was written by a language model until 25 Sep, when a check that scored
 * 3 of 15 (lease 1, resale activity 2) was explained as "the lease adds one
 * point and the remaining four come from transaction thinness". lib/blindspot/
 * summary.js assembles it from the report instead.
 *
 * Swept over real records rather than pinned to one address: a test that
 * freezes one property's numbers fails the nightly refresh the day the data
 * moves (CLAUDE.md, 18–23 Sep). These assert rules that hold on any day.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { analyse } from '../lib/blindspot/analyse.js';
import { summarise } from '../lib/blindspot/summary.js';

const root = process.cwd();
const code = (...p) => readFileSync(path.join(root, ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

/** A spread of real records with realistic listing inputs taken from their own sales. */
function reports(n = 60) {
  const out = [];
  for (const ns of ['hdb', 'condo', 'landed']) {
    const dir = path.join(root, 'data', 'records', ns);
    const walk = d => readdirSync(d, { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const recs = walk(dir).flatMap(f => Object.values(JSON.parse(readFileSync(f, 'utf8'))));
    const step = Math.max(1, Math.floor(recs.length / (n / 3)));
    for (const r of recs.filter((_, i) => i % step === 0).slice(0, n / 3)) {
      const types = Object.entries(r.byType || {}).sort((a, b) => (b[1].n || 0) - (a[1].n || 0));
      const flatType = r.kind === 'HDB' ? types[0]?.[0] : null;
      const areas = (r.recent || []).filter(x => r.kind !== 'HDB' || x.flatType === flatType)
        .map(x => x.areaSqm).filter(Boolean).sort((a, b) => a - b);
      const sqft = Math.round((areas[areas.length >> 1] || 93) * 10.7639);
      const psf = types[0]?.[1]?.medianPsf || r.medianPsf || 800;
      const rep = analyse({ href: r.href, askPrice: Math.round(psf * sqft * 1.04), areaSqft: sqft,
        flatType, bedrooms: r.kind === 'HDB' ? null : 3 });
      if (!rep.error) out.push(rep);
    }
  }
  return out;
}
const SAMPLE = reports();

const numbers = s => [...String(s).matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]);

test('every number in the paragraph is one the report already published', () => {
  assert.ok(SAMPLE.length > 40, `only ${SAMPLE.length} reports built — the sweep is not finding records`);
  for (const r of SAMPLE) {
    const text = summarise(r);
    const allowed = new Set([
      r.points, r.max, r.checks.length, (r.rubric || []).length,
      ...r.checks.flatMap(c => [c.points, c.max]),
      ...r.checks.flatMap(c => numbers(c.finding)),
      ...numbers(r.record.label),
    ].map(String));
    const stray = numbers(text).filter(x => !allowed.has(x));
    assert.deepEqual(stray, [], `${r.record.href}: the paragraph printed ${stray.join(', ')}, which the report does not contain`);
  }
});

test('the points it attributes add up to the score', () => {
  /* The exact failure: points named in prose that sum to something else. */
  for (const r of SAMPLE) {
    const text = summarise(r);
    const m = /The points come from (.+?)\.(?: |$)/.exec(text);
    if (r.points === 0) { assert.equal(m, null, `${r.record.href}: attributes points to a score of 0`); continue; }
    assert.ok(m, `${r.record.href}: scores ${r.points} and does not say where the points came from`);
    const sum = [...m[1].matchAll(/\((\d+) of \d+\)/g)].reduce((t, x) => t + Number(x[1]), 0);
    assert.equal(sum, r.points, `${r.record.href}: the paragraph attributes ${sum} points to a score of ${r.points}`);
  }
});

test('a check that could not run is named, and never reads as a pass', () => {
  const withSkips = SAMPLE.filter(r => r.skipped.length);
  assert.ok(withSkips.length > 0, 'no report in the sweep had an unmeasured check — the sweep cannot test this');
  for (const r of withSkips) {
    const text = summarise(r);
    for (const s of r.skipped) assert.ok(text.includes(s.title), `${r.record.href}: "${s.title}" did not run and is not named`);
    assert.match(text, /not the same as finding no risk/, `${r.record.href}: an unmeasured check reads as a clean one`);
  }
  for (const r of SAMPLE.filter(x => x.notApplicable.length)) {
    for (const s of r.notApplicable) {
      assert.match(summarise(r), new RegExp(`${s.title}[^.]*not apply`), `${r.record.href}: "${s.title}" is inapplicable and not said so`);
    }
  }
});

test('no model writes the paragraph any more, and the page stops saying one does', () => {
  const route = code('app', 'api', 'ai', 'blindspot', 'route.js');
  assert.doesNotMatch(route, /from '[^']*lib\/ai\/providers\.js'|\bclaude\(/,
    'the Blindspot route calls a model again — the paragraph it wrote printed figures the score did not contain');
  assert.match(route, /const summary = summarise\(report\);/);
  assert.doesNotMatch(code('components', 'BlindspotReport.jsx'), /written by a model/,
    'the page still tells readers a model wrote the paragraph');
});
