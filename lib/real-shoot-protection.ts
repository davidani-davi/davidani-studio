import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import { generate, type GenerateParams } from './fal';

export function recolorParams(base: GenerateParams): GenerateParams {
  const urls = base.imageUrls!;
  return {...base, imageUrls: [urls[0], urls[1], ...(urls[4] ? [urls[4]] : [])], prompt: `Recolor IMAGE 1, the actual photographed garment. IMAGE 2 controls ONLY the new garment colors. Preserve IMAGE 1's original person, face, hair, pose, body, framing, background and other clothing exactly. Map colors to corresponding stripes/pattern regions without changing pattern geometry. Preserve every stripe as continuous dyed yarn, with no pale streaks, ghost stripes, erased patches or added distress. Retain fine natural knit fuzz and real folds; do not confuse highlights or hair with a faded print. Preserve exact photographed construction, button count and placement, neckline, thin edges, sleeve length and hem. ${urls[4] ? 'IMAGE 3 is the same garment close-up for construction and textile only; ignore its colors.' : ''} This pass changes garment color only, never model identity. One photographic image. ${base.prompt.includes('Operator correction:') ? 'Operator garment correction: '+base.prompt.split('Operator correction:')[1] : ''}`};
}
export function identityParams(base: GenerateParams, recoloredUrl: string): GenerateParams {
  return {...base, imageUrls: [recoloredUrl, base.imageUrls![2], base.imageUrls![3]], prompt: `Edit IMAGE 1 only in the model's face and hair. IMAGES 2 and 3 provide the approved identity. Match that face and hair color, preserving IMAGE 1's head position, angle and head-to-body scale. Keep the existing hair silhouette, length, parting and placement over the garment, changing hair color/identity within that silhouette. Do not move hair away and invent new garment beneath it. Keep the neck natural. A rear-facing head stays rear-facing without any face. Every garment pixel is protected: do not repaint or change stripes, knit, colors, buttons, silhouette, fit, sleeves or hems. Keep pose, hands, accessories, other clothing, lighting and background. No horizontal neck seam. One photograph.`};
}
export async function garmentMask(url: string, width: number, height: number, prompt = 'clothing'): Promise<Buffer> {
  if (!process.env.FAL_KEY) throw Error('Garment protection credentials missing.');
  fal.config({credentials: process.env.FAL_KEY});
  const res: any = await fal.subscribe('fal-ai/sam-3/image', {input: {image_url:url,prompt,apply_mask:false,output_format:'png',return_multiple_masks:true,max_masks:8}, logs:false});
  const masks = res.data?.masks;
  if (!Array.isArray(masks) || !masks.length) throw Error(`Could not locate ${prompt} for garment protection; use a clear model photograph.`);
  const decoded = await Promise.all(masks.map(async (m: {url:string}) => {
    const r=await fetch(m.url);if(!r.ok)throw Error('Could not read garment mask.');
    return sharp(Buffer.from(await r.arrayBuffer())).resize(width,height,{fit:'fill'}).removeAlpha().greyscale().raw().toBuffer();
  }));
  const mask=Buffer.alloc(width*height);
  for(const data of decoded) for(let i=0;i<mask.length;i++)mask[i]=Math.max(mask[i],data[i]);
  const coverage=mask.reduce((n,v)=>n+(v>=128?1:0),0)/mask.length;
  if(coverage<(prompt==='hair'?0.001:0.03) || coverage>(prompt==='hair'?0.4:0.85))throw Error(`${prompt} mask coverage is unsafe; use a clear model photograph.`);
  return mask;
}
/** Restore only mutually visible clothing; newly occluding hair is never pasted over. */
export async function protectGarment(base: Buffer, edited: Buffer, sourceMask: Buffer, editedMask: Buffer, hairMask?: Buffer) {
  const a=await sharp(base).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b=await sharp(edited).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=a.info;
  if(b.info.width!==width || b.info.height!==height || sourceMask.length!==width*height || editedMask.length!==width*height)throw Error('Garment protection dimensions do not match.');
  if(hairMask && hairMask.length!==width*height)throw Error('Hair mask dimensions do not match.');
  const hairExclusion=hairMask ? await sharp(hairMask,{raw:{width,height,channels:1}}).erode(8).greyscale().raw().toBuffer() : undefined;
  const common=Buffer.alloc(width*height);let sourceCount=0, editedCount=0, commonCount=0;
  for(let i=0;i<common.length;i++){if(editedMask[i]>=128 && (!hairExclusion || hairExclusion[i]<128))editedCount++;if(sourceMask[i]>=128 && (!hairExclusion || hairExclusion[i]<128)){sourceCount++;if(editedMask[i]>=128){common[i]=255;commonCount++;}}}
  if(!sourceCount || !editedCount || Math.min(commonCount/sourceCount,commonCount/editedCount)<0.90)throw Error('Identity edit moved too much clothing; result rejected.');
  // Sharp morphology treats black as foreground: dilate shrinks our white clothing.
  // Feather stays inside the clothing contour.
  const core=await sharp(common,{raw:{width,height,channels:1}}).dilate(3).greyscale().raw().toBuffer();
  const feather=await sharp(core,{raw:{width,height,channels:1}}).blur(1).greyscale().raw().toBuffer();
  const out=Buffer.from(b.data);let protectedPixels=0;
  for(let i=0;i<common.length;i++){
    const alpha=common[i]!==255?0:core[i]===255?1:feather[i]/255;
    if(alpha===1)protectedPixels++;
    for(let c=0;c<4;c++)out[i*4+c]=Math.round(a.data[i*4+c]*alpha+b.data[i*4+c]*(1-alpha));
  }
  const png=await sharp(out,{raw:{width,height,channels:4}}).png().toBuffer();
  const decoded=await sharp(png).ensureAlpha().raw().toBuffer();
  let changedProtectedPixels=0;
  for(let i=0;i<common.length;i++)if(core[i]===255 && common[i]===255 && [0,1,2,3].some(c=>decoded[i*4+c]!==a.data[i*4+c]))changedProtectedPixels++;
  if(changedProtectedPixels)throw Error('Protected garment pixel verification failed.');
  return {png,mask:core,report:{method:'two-pass-garment-contour',protectedPixels,changedProtectedPixels,visibleGarmentOverlap:Math.min(commonCount/sourceCount,commonCount/editedCount)}};
}
export async function generatePng(params: GenerateParams) {
  const result=await generate(params);const url=result.images[0]?.url;if(!url)throw Error('Generator returned no image.');
  const response=await fetch(url);if(!response.ok)throw Error('Could not read generated image.');
  const bytes=Buffer.from(await response.arrayBuffer());const meta=await sharp(bytes).metadata();
  if(meta.format!=='png'||!meta.width||!meta.height)throw Error('Real shoot requires native PNG.');
  return {url,bytes,meta,requestId:result.requestId};
}

export async function renderProtectedRealShoot(base: GenerateParams) {
  const recolor=await generatePng(recolorParams(base));
  const width=recolor.meta.width!,height=recolor.meta.height!;
  const [identity,sourceMask,sourceHair]=await Promise.all([
    generatePng(identityParams(base,recolor.url)),
    garmentMask(recolor.url,width,height),garmentMask(recolor.url,width,height,'hair'),
  ]);
  const [editedMask,editedHair]=await Promise.all([garmentMask(identity.url,width,height),garmentMask(identity.url,width,height,'hair')]);
  for(let i=0;i<sourceHair.length;i++)sourceHair[i]=Math.max(sourceHair[i],editedHair[i]);
  const final=await protectGarment(recolor.bytes,identity.bytes,sourceMask,editedMask,sourceHair);
  return {bytes:final.png,providerUrl:identity.url,requestId:identity.requestId,
    protection:{...final.report,recoloredUrl:recolor.url,identityUrl:identity.url,recolorRequestId:recolor.requestId},
    stagePrompts:{recolor:recolorParams(base).prompt,identity:identityParams(base,recolor.url).prompt}};
}
