import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { progressive, STAGES } from '../lib/calc/buc.js';
import { CONSTRUCTION, constructionStage } from '../lib/construction.js';

test('the visual stage keeps the exact payment trigger and figures from the calculator', () => {
  for (const price of [0, 1_500_000, 3_200_000]) {
    for (const ltv of [.75, .55, .35]) {
      const {rows} = progressive({price,ltv,rate:.0325,tenureYears:30});
      assert.equal(CONSTRUCTION.length, STAGES.length);
      rows.forEach((row, index) => {
        const stage=constructionStage(rows,index);
        for (const key of ['due','own','loan','drawnAfter','monthly','pct','wording']) assert.equal(stage[key],row[key],key);
        assert.equal(stage.previousMonthly,rows[index-1]?.monthly || 0);
        assert.equal(Math.round(stage.previousMonthly)+stage.monthlyChange,Math.round(stage.monthly));
        assert.equal(stage.cumulativePct,rows.slice(0,index+1).reduce((s,r)=>s+r.pct,0));
      });
      assert.equal(constructionStage(rows,8).cumulativePct,100);
    }
  }
});

test('foundation can include both buyer equity and bank draw; the picture does not assume one payer', () => {
  const result=progressive({price:1_500_000,ltv:.75});
  const foundation=constructionStage(result.rows,1);
  assert.equal(foundation.own,75_000);
  assert.equal(foundation.loan,75_000);
  assert.ok(foundation.monthly>0);
  assert.equal(foundation.previousMonthly,0);
  assert.equal(constructionStage(result.rows,0).monthly,0);
});

test('changing the price cannot leave the selected stage showing the previous purchase', () => {
  const first=constructionStage(progressive({price:1_500_000}).rows,2);
  const changed=constructionStage(progressive({price:3_000_000}).rows,2);
  assert.equal(changed.due,first.due*2);
  assert.equal(changed.drawnAfter,first.drawnAfter*2);
  assert.equal(changed.monthly,first.monthly*2);
});

test('each selectable stage has both image formats within the delivery budget', () => {
  for(let i=0;i<STAGES.length;i++) {
    for(const format of ['avif','webp']) {
      const stat=fs.statSync(new URL(`../public/construction/stage-${i}.${format}`,import.meta.url));
      assert.ok(stat.size>1000);
      assert.ok(stat.size<=160000,`Stage ${i} ${format} too large`);
    }
  }
});

test('the visual explorer is the only full payment-stage presentation', () => {
  const progressive=fs.readFileSync(new URL('../components/Progressive.jsx',import.meta.url),'utf8');
  const study=fs.readFileSync(new URL('../components/ConstructionStudy.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(progressive,/className="ladder"/,
    'the old payment ladder repeats the figures already shown by the construction explorer');
  assert.match(study,/className="construction-stages"/);
  assert.match(study,/rows\[i\]\.pct/,
    'removing the duplicate ladder must not hide the nine-stage percentage overview');
});
