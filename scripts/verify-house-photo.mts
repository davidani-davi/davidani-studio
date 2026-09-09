// Paid visual regression: persists requests/results; never silently resubmits.
import fs from 'node:fs';
import path from 'node:path';
if (process.env.TEST_ENV_FILE) process.loadEnvFile(process.env.TEST_ENV_FILE);
process.env.VERCEL = '1';
const root = process.env.HOUSE_PHOTO_EVIDENCE;
if (!root) throw Error('Set HOUSE_PHOTO_EVIDENCE to the directory containing baseline.json');
const { POST } = await import('../app/api/model-shots/route');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'baseline.json'), 'utf8'));
const views = process.argv.slice(2).filter(v => ['front','side','back','full'].includes(v));
if (!views.length) throw Error('Specify front, side, back or full');
for (const view of views) {
  const dir = path.join(root, 'pipeline-' + view); fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, 'result.json'))) { console.log(view + ' already complete'); continue; }
  if (fs.existsSync(path.join(dir, 'started.json'))) throw Error(view + ' already submitted; inspect before retrying');
  const body = { ...baseline.request, async: false, view, requestId: undefined,
    ...(view !== 'front' ? { anchorImageUrl: JSON.parse(fs.readFileSync(path.join(root,'pipeline-front/result.json'),'utf8')).url } : {}) };
  fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify(body,null,2));
  fs.writeFileSync(path.join(dir, 'started.json'), JSON.stringify({started:new Date().toISOString()}));
  console.log(view + ' rendering through Model Studio route');
  const response = await POST(new Request('https://davidani-studio.vercel.app/api/model-shots', {
    method:'POST', headers:{'Content-Type':'application/json','X-DDTO-TOKEN':process.env.MODEL_SHOTS_TOKEN||process.env.APP_PASSWORD!},body:JSON.stringify(body),
  }));
  const result = await response.json(); fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));
  if (!result.ok) throw Error(result.error);
  for (const [name,url] of [['render.jpg',result.url],['raw.png',result.rawUrl]]) if(url) {
    const r=await fetch(url); if(!r.ok) throw Error('download '+r.status); fs.writeFileSync(path.join(dir,name),Buffer.from(await r.arrayBuffer()));
  }
  console.log(view+' complete '+result.photoFinish);
}
