/** Browser regression check. Uses the workspace's existing external test
 * runtime, so the site's three-dependency architecture stays intact. */
const { chromium } = require('/Users/shervinpoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
async function main() {
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',msg=>{ if(msg.type()==='error' && !msg.text().includes('Failed to load resource')) errors.push(msg.text()); });
    // A cold local compile can deliver HTML well before the client bundle.
    // Wait for those requests before exercising a control, or the first click
    // tests an unhydrated server render rather than the interaction.
    await page.goto('http://127.0.0.1:3000/progressive',{waitUntil:'networkidle',timeout:60000});
    await page.locator('.construction-stages button').first().waitFor();
    const stages=page.locator('.construction-stages button');
    // Wait for a real React state update before taking screenshots: Playwright
    // temporarily touches input styles to hide carets, which otherwise races
    // hydration and produces an attribute mismatch of its own.
    await stages.nth(1).click();
    await page.waitForFunction(()=>document.querySelectorAll('.construction-stages button')[1].getAttribute('aria-pressed')==='true');
    await stages.nth(2).click();
    if(process.argv.includes('--layout')) {
      await page.locator('.construction').screenshot({path:'/tmp/construction-layout.png'});
      console.log('Layout captured');
      return;
    }
    await page.locator('.construction img').evaluate(img=>img.decode());
    await page.locator('.construction').screenshot({path:'/tmp/construction-desktop.png'});
    assert.equal(await stages.count(),9);
    for (let i=0;i<9;i++) {
      await stages.nth(i).click();
      await page.locator('.construction img').evaluate(img=>img.decode());
      assert.equal(await stages.nth(i).getAttribute('aria-pressed'),'true');
      assert.ok((await page.locator('.construction img').getAttribute('src')).includes(`stage-${i}`));
      assert.ok((await page.locator('.construction-stage-heading').textContent()).includes(`Stage ${i+1} of 9`));
    }
    assert.equal(await page.getByRole('button',{name:'Next payment stage'}).isDisabled(),true);
    await stages.nth(0).click();
    assert.equal(await page.getByRole('button',{name:'Previous payment stage'}).isDisabled(),true);
    assert.ok((await page.locator('.construction-mortgage').innerText()).includes('No loan drawn'));
    await stages.nth(1).click();
    assert.ok((await page.locator('.construction-funds').innerText()).includes('75,000'));
    await stages.nth(2).click();
    const input=page.locator('#purchase-assumptions input[inputmode="numeric"]').first();
    const fallback=page.locator('#purchase-assumptions input').first();
    const priceInput=await input.count() ? input : fallback;
    await priceInput.fill('3000000');
    await priceInput.blur();
    assert.ok((await page.locator('.construction-due').innerText()).includes('300,000'));
    assert.ok((await page.locator('.construction-assumptions').innerText()).includes('3,000,000'));
    await priceInput.fill('1500000');
    await priceInput.blur();
    await stages.nth(8).click();
    await page.locator('.construction-notice summary').click();
    assert.ok((await page.locator('.construction-notice blockquote').innerText()).includes('13% to the Singapore Academy of Law'));
    await stages.nth(2).click();
    await stages.nth(2).focus();
    await page.keyboard.press('Tab');
    assert.equal(await stages.nth(3).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Enter');
    assert.equal(await stages.nth(3).getAttribute('aria-pressed'),'true');
    await stages.nth(2).click();
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Horizontal overflow at ${width}`);
      for(let i=0;i<9;i++) assert.ok((await stages.nth(i).boundingBox()).height>=44);
      await stages.nth(2).scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.planbar')).display==='none');
      if(width===390) await page.locator('.construction').screenshot({path:'/tmp/construction-mobile.png'});
      await page.locator('#purchase-assumptions input[type="number"]').last().scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>!document.querySelector('.planbar').hidden);
    }
    await page.setViewportSize({width:1440,height:1100});
    await page.emulateMedia({reducedMotion:'reduce'});
    await stages.nth(7).click();
    assert.ok((await page.locator('.construction-stage-heading').textContent()).includes('Stage 8'));
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');
    await page.locator('.construction').screenshot({path:'/tmp/construction-dark.png'});
    await page.evaluate(()=>delete document.documentElement.dataset.theme);
    // The numbers must survive an unavailable visual.
    await page.route('**/construction/*',route=>route.abort());
    await stages.nth(4).click();
    await page.locator('.construction-missing').waitFor();
    assert.ok((await page.locator('.construction-due').innerText()).includes('75,000'));
    assert.deepEqual(errors,[]);
    const nojs=await browser.newPage({javaScriptEnabled:false});
    await nojs.goto('http://127.0.0.1:3000/progressive');
    assert.equal(await nojs.locator('.construction-stages li').count(),9);
    assert.equal(await nojs.locator('.construction-stages small').count(),9);
    assert.equal(await nojs.locator('.ladder').count(),0);
    assert.ok((await nojs.locator('.construction-due').innerText()).includes('150,000'));
    console.log('PASS: all nine stages, financial updates, notices, keyboard, 320/390px mobile, dark mode, reduced motion, missing image, and no-JS schedule.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
