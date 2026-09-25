/**
 * When the price check cannot find five comparables, it reaches further back
 * — and restates what it finds — before it gives up; and when it does give up,
 * it shows what it found.
 *
 * Shervin, 25 Sep: a report without enough information should pick up
 * something instead of only saying it cannot be determined. Measured over 1,000
 * real addresses, the price check could not run on 2% of HDB blocks, 9% of
 * condos and 27% of landed streets. With two further rungs — nearby sales over
 * 24 and 36 months, each restated to today's level by the matching official
 * index — and the thin cohort shown when even those fall short, the share with
 * nothing to show fell to about 1%, 2% and 4%.
 *
 * The failures these guard:
 *  · an older sale compared AS FILED, which puts two years of market movement
 *    into the percentile as though it were about this home;
 *  · a restated figure that hides the filed one;
 *  · the thin cohort being SCORED — "a check that cannot run scores nothing"
 *    still holds; the fallback adds evidence, not points;
 *  · a currency written as "$" on a Singapore site.
 *
 * Swept over real records, so the rules hold on tomorrow's data. A case the
 * data stops producing is skipped, not failed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { analyse } from '../lib/blindspot/analyse.js';
import { indexAdjuster } from '../lib/blindspot/measure.js';
import { renderBlindspotReport } from '../lib/report/blindspot.js';

const root = process.cwd();
const code = (...p) => readFileSync(path.join(root, ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

function sweep(perKind = 120) {
  const out = [];
  for (const ns of ['landed', 'condo', 'hdb']) {
    const dir = path.join(root, 'data', 'records', ns);
    const walk = d => readdirSync(d, { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const recs = walk(dir).flatMap(f => Object.values(JSON.parse(readFileSync(f, 'utf8'))));
    const step = Math.max(1, Math.floor(recs.length / perKind));
    for (const r of recs.filter((_, i) => i % step === 0).slice(0, perKind)) {
      const types = Object.entries(r.byType || {}).sort((a, b) => (b[1].n || 0) - (a[1].n || 0));
      const flatType = r.kind === 'HDB' ? types[0]?.[0] : null;
      const areas = (r.recent || []).filter(x => r.kind !== 'HDB' || x.flatType === flatType)
        .map(x => x.areaSqm).filter(Boolean).sort((a, b) => a - b);
      const sqft = Math.round((areas[areas.length >> 1] || 93) * 10.7639);
      const psf = types[0]?.[1]?.medianPsf || r.medianPsf || 800;
      const rep = analyse({ href: r.href, askPrice: Math.round(psf * sqft), areaSqft: sqft,
        flatType, bedrooms: r.kind === 'HDB' ? null : 3 });
      if (!rep.error) out.push(rep);
    }
  }
  return out;
}
const SAMPLE = sweep();
const restated = SAMPLE.filter(r => r.detail.price?.scored?.restated);
const thin = SAMPLE.filter(r => r.detail.price?.thin);

test('an index restates to the latest published quarter, and never guesses', () => {
  for (const [kind, landed] of [['HDB', false], ['PRIVATE', true], ['PRIVATE', false]]) {
    const a = indexAdjuster(kind, landed);
    assert.ok(a, `no index loaded for ${kind}${landed ? ' landed' : ''}`);
    const [y, q] = a.to.split('-Q').map(Number);
    const monthInLatest = `${y}-${String(q * 3).padStart(2, '0')}`;
    assert.equal(a.factor(monthInLatest), 1, 'a sale in the latest published quarter was moved');
    assert.equal(a.factor('2099-01'), 1, 'a sale after the last published quarter was moved on a guess');
    assert.equal(a.factor('1066-10'), null, 'a quarter the index does not hold was given a factor');
    assert.equal(a.factor('not a month'), null);
    const older = a.factor(`${y - 2}-06`);
    assert.ok(Number.isFinite(older) && older > 0, `${a.name}: no factor two years back`);
    assert.match(a.name, /Price Index/);
  }
});

test('an older cohort is restated, keeps each filed figure, and says which index did it', (t) => {
  if (!restated.length) return t.skip('no address in the sweep needed the older rungs today');
  for (const r of restated) {
    const s = r.detail.price.scored;
    assert.ok([24, 36].includes(s.months), `${r.record.href}: restated at ${s.months} months`);
    assert.match(s.restated.index, /Price Index/);
    assert.match(s.restated.to, /^\d{4}-Q[1-4]$/);
    /* Every sale before the index's latest quarter must actually have been
       moved, and by the index's own factor. An earlier draft checked only the
       rows that carried a filed figure — so with no restatement at all there
       were none, and the test passed checking nothing. */
    const kind = r.record.kind;
    const landed = /terrace|semi|detached/i.test(String(r.detail.price.flatType));
    const a = indexAdjuster(kind, landed);
    const older = s.comparisons.filter(c => a.factor(c.month) !== 1);
    assert.ok(older.length > 0, `${r.record.href}: a ${s.months}-month cohort with no sale older than ${a.to}`);
    for (const c of older) {
      assert.ok(Number.isFinite(c.psfFiled) && c.psfFiled > 0,
        `${r.record.href}: a sale from ${c.month} was compared as filed, or lost its filed figure`);
      if (s.adjusted) continue;   // a floor restatement moves it again; the index step is checked unadjusted
      const want = Math.round(c.psfFiled * a.factor(c.month));
      assert.ok(Math.abs(c.psf - want) <= 2,
        `${r.record.href}: ${c.month} restated to ${c.psf}, the ${a.name} gives ${want}`);
    }
  }
});

test('whatever the ladder scores, it scored on enough — the fallback never lowers the bar', () => {
  /* Asserted over EVERY report, not only the thin ones. Scoring a thin cohort
     empties the thin list, so a test that only looked at thin reports would
     skip itself in exactly the case it exists to catch. */
  for (const r of SAMPLE) {
    const s = r.detail.price?.scored;
    if (!s) continue;
    assert.ok(s.sufficient && s.sample >= r.detail.price.min,
      `${r.record.href}: the price was scored on ${s.sample} sales; at least ${r.detail.price.min} are needed`);
  }
});

test('the fallback adds evidence, never points: a thin cohort is shown and not scored', (t) => {
  if (!thin.length) return t.skip('no address in the sweep fell back to a thin cohort today');
  for (const r of thin) {
    const p = r.detail.price;
    assert.equal(p.scored, null, `${r.record.href}: a thin cohort was scored`);
    assert.ok(p.thin.sample > 0 && p.thin.sample < p.min, `${r.record.href}: "thin" holds ${p.thin.sample}`);
    assert.ok(r.skipped.some(s => /price/i.test(s.title)), `${r.record.href}: the price check reads as run`);
    assert.ok(!r.checks.some(c => c.key === 'price'), `${r.record.href}: a thin cohort earned the price check a place in the score`);
  }
});

test('the page shows the restatement, the filed figures and the thin cohort — in S$', () => {
  const src = code('components', 'BlindspotReport.jsx');
  assert.match(src, /const psf = v => `S\$\$\{num\(Math\.round\(v\)\)\} psf`;/, 'prices render in "$", not S$');
  assert.doesNotMatch(src, /<td className="mono">\$\$\{num\(c\.psf\)\}/, 'the comparables table renders "$"');
  assert.match(src, /restated each older sale to\{' '\}\s*\{scored\.restated\.to\} prices using the \{scored\.restated\.index\}/,
    'a restated cohort is not explained on the page');
  assert.match(src, /c\.psfFiled != null && c\.psfFiled !== c\.psf/, 'the table hides the filed figure behind the adjusted one');
  assert.match(src, /What the search did find:/, 'an unscored check shows only the word "unavailable" again');
  assert.match(src, /Too few to score the asking price against, so they add no points/);
});

test('the emailed copy says the same thing as the page', (t) => {
  const agent = { name: 'Shervin Poh', cea: 'R066925H', agency: 'Huttons Asia Pte Ltd' };
  const pick = restated[0] || null;
  const thinOne = thin[0] || null;
  if (!pick && !thinOne) return t.skip('nothing in the sweep exercised the fallback today');
  for (const r of [pick, thinOne].filter(Boolean)) {
    /* The renderer re-runs the check from the link's own fields. An earlier
       draft of this test handed it the wrong shape, got { error } back, and
       `continue`d — passing while asserting nothing. So an error now fails. */
    const out = renderBlindspotReport({
      values: { home: r.record.href, price: r.input.askPrice, area: r.input.areaSqft,
        floor: r.input.floor, flatType: r.input.flatType, bedrooms: r.input.bedrooms },
      link: 'https://x/blindspot#v=1', agent, siteUrl: 'https://x',
    });
    assert.ok(out && !out.error, `${r.record.href}: the email could not be rendered — ${out?.error}`);
    if (r.detail.price.scored?.restated) assert.match(out.text, /restated each older sale to \d{4}-Q[1-4] prices using the/);
    if (r.detail.price.thin) assert.match(out.text, /What the search did find:/);
    assert.doesNotMatch(out.text, /(?<!S)\$\d/, 'the email prints a bare "$"');
  }
});
