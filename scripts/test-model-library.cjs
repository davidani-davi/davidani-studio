// Read-only browser verification of the reference library against a local server.
// APP_PASSWORD=local-admin-test AUTH_SECRET=local-admin-test-secret npm start -- -p 3016
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const references=require('../lib/pants-references.json');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext({viewport:{width:1536,height:1000}});
 const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3016';
 const login=await context.request.post(origin+'/api/auth',{data:{password:process.env.ADMIN_TEST_PASSWORD||'local-admin-test'}});assert.equal(login.status(),200);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/admin/models');
 const list=page.locator('.ra-model-list'),editor=page.getByRole('region',{name:'Reference editor'});
 await list.locator('.ra-model').first().waitFor();
 assert(!await list.getByRole('button',{name:/DP52083/}).count(),'Pants are not mixed into Tops');
 assert.equal(await editor.locator('.ra-photo').count(),4);
 assert(!await editor.getByRole('button',{name:'Delete model',exact:true}).isVisible());
 const checkRows=async()=>{
  const rows=await list.locator('.ra-model').evaluateAll(rows=>rows.map(e=>{const r=e.getBoundingClientRect();const text=e.querySelector('span:last-child').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,textBottom:text.bottom};}));
  assert(rows.every((r,i)=>r.height>=88&&r.textBottom<=r.bottom&&(!i||r.top>=rows[i-1].bottom)),'Rows and text must not overlap');
 };
 await checkRows();
 const out=process.env.MODEL_LIBRARY_OUT||'/tmp/model-library-qa';fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:out+'/tops-desktop.png',fullPage:true});
 await page.getByRole('button',{name:/^Bottoms/}).click();
 await editor.getByRole('heading',{name:/DP52083/}).waitFor();
 assert.equal(await list.locator('.ra-model').count(),1+references.length);
 for(const reference of references){
  await list.getByRole('button',{name:new RegExp(reference.style+' ·')}).click();
  await editor.getByRole('heading',{name:reference.style+' · '+reference.label,exact:true}).waitFor();
  assert.equal(await editor.locator('.ra-photo').count(),3);
  await editor.locator('.ra-photo img').first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ra-photo img')].length===3&&[...document.querySelectorAll('.ra-photo img')].every(i=>i.complete&&i.naturalWidth>0));
  const sources=await editor.locator('.ra-photo img').evaluateAll(images=>images.map(i=>i.getAttribute('src')));
  for(const view of ['front','side','back'])assert(sources.some(s=>decodeURIComponent(s).includes(reference.views[view].publicPath)),reference.style+' '+view+' image');
 }
 assert.equal(await editor.locator('.ra-photo').count(),3);
 assert(!await editor.getByRole('heading',{name:'Full',exact:true}).count());
 assert(!await list.getByRole('button',{name:/Celine 1/}).count());
 await checkRows();
 await page.getByRole('textbox',{name:'Search models'}).fill('DP67305');
 await editor.getByRole('heading',{name:/DP67305/}).waitFor();
 assert.equal(await list.locator('.ra-model').count(),1);
 await page.getByRole('textbox',{name:'Search models'}).fill('no-such-reference');
 await editor.getByRole('heading',{name:'Choose a model'}).waitFor();
 await page.getByRole('textbox',{name:'Search models'}).fill('');
 await editor.getByRole('heading',{name:/DP52083/}).waitFor();
 await page.screenshot({path:out+'/bottoms-desktop.png',fullPage:true});
 await editor.getByText('Edit model details',{exact:true}).click();
 assert(await editor.getByRole('button',{name:'Save details'}).isVisible());
 await editor.getByText('Edit model details',{exact:true}).click();
 for(const width of [2560,1024,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  await checkRows();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);
  if(width===390){await page.screenshot({path:out+'/bottoms-phone.png',fullPage:true});await editor.scrollIntoViewIfNeeded();assert(await editor.locator('.ra-photo').first().isVisible());}
 }
 assert.deepEqual(errors,[]);console.log('PASS: Tops/Bottoms separation, all shared pants references, three/four views, search and selection, edit disclosure, readable rows at 390/1024/1536/2560, no overflow or console errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
