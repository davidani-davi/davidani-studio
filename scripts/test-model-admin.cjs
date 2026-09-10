// Local-only integration test: start Studio on :3016 with BLOB_READ_WRITE_TOKEN empty,
// APP_PASSWORD=local-admin-test, AUTH_SECRET=local-admin-test-secret.
// Provide ADMIN_TEST_PHOTO and optionally PLAYWRIGHT_MODULE. Uses only local QA models.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1536,height:1100}});
const origin='http://localhost:3016'; const qaName='QA reference '+Date.now();
const login=await context.request.post(origin+'/api/auth',{data:{password:'local-admin-test'}});assert.equal(login.status(),200);
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.goto(origin+'/admin/models');
await page.getByRole('button',{name:'Add model',exact:true}).click();
let dialog=page.getByRole('dialog');await dialog.getByLabel('Name',{exact:true}).fill(qaName);await dialog.getByLabel('Model group').fill('QA');await dialog.getByRole('button',{name:'Create',exact:true}).click();
await page.getByRole('button',{name:'Add pose set',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Name',{exact:true}).fill('QA pose');await dialog.getByRole('button',{name:'Create',exact:true}).click();
const photo=process.env.ADMIN_TEST_PHOTO; assert(photo && fs.existsSync(photo),'Set ADMIN_TEST_PHOTO to a local PNG/JPEG/WebP reference.');
for(const view of ['front','side','back','full']){
 await page.getByLabel('Upload '+view+' photo',{exact:true}).setInputFiles(photo);
 dialog=page.getByRole('dialog');
 if(view!=='back'){await dialog.getByLabel('I checked that the entire face is above the line.').check();}
 await dialog.getByRole('button',{name:'Save photo',exact:true}).click();await dialog.waitFor({state:'hidden'});
}
const catalog=async()=>await(await context.request.get(origin+'/api/admin/models')).json();
let m=(await catalog()).models.find(m=>m.name===qaName);let old=m.poses[0].views;
assert.deepEqual(Object.keys(old).sort(),['back','front','full','side']);assert(old.front.protection.sha256);assert.equal(old.back.protection,undefined);
await page.getByLabel('Replace side photo',{exact:true}).setInputFiles(photo);dialog=page.getByRole('dialog');await dialog.getByLabel('I checked that the entire face is above the line.').check();await dialog.getByRole('button',{name:'Save photo',exact:true}).click();await dialog.waitFor({state:'hidden'});
m=(await catalog()).models.find(m=>m.name===qaName);assert.notEqual(m.poses[0].views.side.publicPath,old.side.publicPath);assert.deepEqual(m.poses[0].views.front,old.front);
const bad=await context.request.post(origin+'/api/admin/models',{headers:{Origin:origin},data:{action:'setPhoto',modelId:m.id,poseId:m.poses[0].id,view:'front',expectedUrl:old.front.publicPath,url:'http://169.254.169.254/latest/meta-data'}});assert.equal(bad.status(),400);
await page.locator('.ra-photo').filter({has:page.getByRole('heading',{name:'Side',exact:true})}).getByRole('button',{name:'Remove',exact:true}).click();await page.getByLabel('Upload side photo',{exact:true}).waitFor({state:'attached'});
await page.reload();await page.getByRole('button',{name:new RegExp(qaName)}).click();assert(await page.getByLabel('Upload side photo',{exact:true}).count());
await page.getByRole('button',{name:'Delete pose',exact:true}).click();await page.getByRole('button',{name:'Restore pose',exact:true}).click();await page.getByRole('button',{name:'Delete pose',exact:true}).waitFor();
await page.getByRole('button',{name:'Delete model',exact:true}).click();await page.getByRole('button',{name:'Restore model',exact:true}).waitFor();
let pub=await(await context.request.get(origin+'/api/models')).json();assert(!pub.models.some(x=>x.id===m.id));
await page.getByRole('button',{name:'Restore model',exact:true}).click();await page.getByRole('button',{name:'Delete model',exact:true}).waitFor();pub=await(await context.request.get(origin+'/api/models')).json();assert(pub.models.some(x=>x.id===m.id));
await page.getByRole('button',{name:'Delete model',exact:true}).click();await page.getByRole('button',{name:'Restore model',exact:true}).waitFor();
await page.getByRole('button',{name:/Celine 1/}).first().click();
await page.screenshot({path:'/tmp/model-admin-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/model-admin-phone.png',fullPage:true});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');assert.deepEqual(errors,[]);
console.log('PASS: authenticated UI create model/pose, four uploads, independent replacement, invalid URL rejection, remove, reload persistence, trash/restore, catalog propagation, mobile overflow, console.');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
