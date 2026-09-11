// Browser interaction regression. Generation responses are mocked; real uploads use local storage.
// Start Studio :3016 as documented in scripts/test-model-admin.cjs.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1080}});
 const origin='http://localhost:3016';assert.equal((await ctx.request.post(origin+'/api/auth',{data:{password:'local-admin-test'}})).status(),200);
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let run=null,submitted=null,save=null,pollCount=0;
 await page.route('**/api/reference-identity-studio**',async route=>{
  const req=route.request();let data;
  if(req.method()==='POST'){
   const b=req.postDataJSON();
   if(b.action==='save'){save=b;data={ok:true};}
   else{submitted=b;run={id:b.id,name:b.name,inputs:b.inputs,identity:{id:b.identityId,name:'Celine',url:'/identity-masters/celine-loose.png',filename:'celine-loose.png'},prompt:'Exact saved prompt',createdAt:new Date().toISOString(),jobs:Object.fromEntries(Object.keys(b.inputs).map(v=>[v,{id:v,status:'running'}]))};data=run;}
  }else if(req.url().includes('?id=')){
   pollCount++;if(run&&pollCount>=1)for(const [v,j]of Object.entries(run.jobs)){j.status='done';j.result={imageUrl:run.inputs[v].url,requestId:'mock-'+v};}data=run;
  }else data={sets:run?[run]:[],cloudUploads:false};
  await route.fulfill({json:data});
 });
 await page.goto(origin+'/reference-identity-studio');await page.getByLabel('Reference set name').fill('Browser QA');
 const photo=process.env.ADMIN_TEST_PHOTO;assert(photo);
 for(const v of ['front','side','back','full']){await page.getByLabel('Upload '+v,{exact:true}).setInputFiles(photo);await page.getByLabel('Upload '+v,{exact:true}).waitFor();await page.waitForFunction(()=>!document.body.textContent.includes('Uploading…'));}
 await page.getByRole('button',{name:'Generate 4 selected views',exact:true}).click();
 await page.getByRole('button',{name:'Generating…',exact:true}).waitFor();
 assert.equal(Object.keys(submitted.inputs).length,4);assert.equal(submitted.identityId,'celine-loose');
 await page.reload();await page.getByRole('button',{name:'Generate 4 selected again',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Download PNG',exact:true}).count(),4);
 const images=await page.locator('.ri-view .ri-image img').count();assert.equal(images,4);
 await page.locator('.ri-view details').first().locator('summary').click();assert(await page.getByText('Exact saved prompt',{exact:true}).count());
 await page.getByRole('button',{name:'Save 4 selected to models',exact:true}).click();const dialog=page.getByRole('dialog');
 assert(await dialog.getByRole('button',{name:'Save to model library',exact:true}).isDisabled());
 await dialog.getByLabel('I reviewed the selected images and protection lines.').check();await dialog.getByRole('button',{name:'Save to model library',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.deepEqual(save.views,['front','side','back','full']);assert.equal(save.reviewed,true);assert.equal(save.protection.back,25);
 await page.waitForFunction(()=>[...document.querySelectorAll('.ri-image img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:'/tmp/reference-identity-desktop-qa.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.getByRole('button',{name:'New set',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/reference-identity-phone-qa.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Phone overflow');
 await page.getByRole('button',{name:'New set',exact:true}).click();assert.equal(await page.locator('.ri-image img').count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: four real local uploads, generation selection, reload/resume, all four results, provenance, reviewed save, new set, desktop/phone layout; mocked provider.');
})().catch(e=>{console.error(e);process.exit(1)});
