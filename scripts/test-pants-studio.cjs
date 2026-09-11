// Read-only browser check. No generation, ERP writes, or model changes.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const origin = process.env.STUDIO_ORIGIN || 'http://localhost:3016';
  const browser = await chromium.launch({headless:true});
  const ctx = await browser.newContext({viewport:{width:1440,height:1080}});
  assert.equal((await ctx.request.post(origin+'/api/auth', {data:{password:process.env.APP_PASSWORD || 'local-admin-test'}})).status(),200);
  const page = await ctx.newPage(), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(origin+'/model-studio-beta');
  await page.getByLabel('Style number',{exact:true}).fill('DP67305');
  await page.getByRole('button',{name:/Generate 3 views/}).first().waitFor();
  await page.getByRole('button',{name:'Setup',exact:true}).click();
  const options=page.locator('[aria-label="Pants references"]>button');
  await options.first().waitFor();
  assert.equal(await options.count(),9);
  assert.equal(await options.first().innerText(),'DP52083 · Donuts');
  for(const view of ['Front','Side','Back']) assert(await page.getByTitle('Preview '+view.toLowerCase()+' reference',{exact:true}).count());
  assert.equal(await page.getByRole('button',{name:'Full',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Full shot',exact:true}).count(),0);
  await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="Pants references"] img')].every(i=>i.complete&&i.naturalWidth>0));
  if(process.env.PANTS_SCREENSHOT) await page.screenshot({path:process.env.PANTS_SCREENSHOT,fullPage:true});
  await page.getByRole('button',{name:'DP67305 · Burgundy dot barrel pants',exact:true}).click();
  await page.getByRole('button',{name:/Generate 3 views/}).first().waitFor();
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: DP style selects nine shared pants options; three views, no full, all reference thumbnails loaded. No paid generation.');
})().catch(e=>{console.error(e);process.exit(1)});
