import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { generate, uploadToFal, type GenerateParams } from './fal';
import type { PresetView } from './models-registry';

export const DIRECT_IDENTITIES = {
  vision: { label: 'Vision', face: '/identity-masters/vision.png', profile: '/identity-masters/vision-profile-right.png' },
  celine: { label: 'Celine', face: '/identity-masters/celine-loose.png', profile: '/identity-masters/celine-profile-left.png' },
} as const;
export type DirectIdentity = keyof typeof DIRECT_IDENTITIES;
export function directOutfitInput(body: any) {
  if (!['front','side','back','full'].includes(body.view)) throw Error('Choose a valid outfit view.');
  if (!Object.hasOwn(DIRECT_IDENTITIES, body.identityId)) throw Error('Choose Vision or Celine for Direct outfit edit.');
  const sources = body.outfitSources;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) throw Error('Choose matching ERP outfit photos.');
  const valid = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u) && u.length < 4096;
  for (const [view,url] of Object.entries(sources)) {
    if (!['front','side','back','full'].includes(view) || !valid(url)) throw Error('Invalid ERP outfit photo.');
  }
  if (!valid(sources[body.view])) throw Error(`Choose the original ERP ${body.view} outfit photo, or use Simple garment swap.`);
  const modelId = body.modelId || ({gpt2:'gpt-image',gpt25:'gpt-image-25',nano:'nano-banana-pro'} as Record<string,string>)[body.engine || 'gpt25'];
  if (!['gpt-image','gpt-image-25','nano-banana-pro'].includes(modelId) || body.engine === 'tryon') throw Error('Choose GPT or Nano for Direct outfit edit.');
  const expected = ({gpt2:'gpt-image',gpt25:'gpt-image-25',nano:'nano-banana-pro'} as Record<string,string>)[body.engine];
  if (body.engine && (!expected || expected !== modelId)) throw Error('Engine and model selections conflict.');
  return { view: body.view as PresetView, identityId: body.identityId as DirectIdentity, sources: sources as Partial<Record<PresetView,string>>, modelId };
}
export function directOutfitParams(input: ReturnType<typeof directOutfitInput>, identities: string[], note = ''): GenerateParams {
  const {view,sources,modelId}=input;
  const target=sources[view]!;
  const support = (view==='front'?sources.full:sources.front) || sources.back;
  const imageUrls=[target,...identities,...(support && support!==target?[support]:[])];
  const prompt=`Edit image 1, the original ERP ${view} outfit photograph. Image 1 is the authority for clothing, pose, framing and environment. Image 2 is ${DIRECT_IDENTITIES[input.identityId].label}'s face and hair identity only; ignore its outfit and accessories. Image 3 is the same person's profile anatomy reference, not a pose instruction.${imageUrls.length>3?' Image 4 is another original view of this outfit for garment consistency only.':''} Replace only the source model's face and hair with the identity from images 2 and 3. Match facial proportions, eyes, brows, nose, lips, skin tone, hair color and natural hair texture consistently across views. ${view==='back'?'Preserve the source head orientation and face visibility; a fully rear-facing head must stay face-free.':'Keep the source head orientation, expression and gaze; a profile reference must not reverse the source pose.'} Preserve the exact garment color, pattern placement and scale, fabric texture, neckline, seams, closures, pockets, cuffs, sleeve length, hem shape and length relative to the body. Do not lengthen or shorten the garment. Preserve other clothing, shoes, jewelry, hands, body pose, lighting and continuous background. Keep the original crop, including both shoes when present. Natural photographic skin; no added grain, exaggerated pores, beauty smoothing or sharpening. One finished image, not a collage.${note?' Operator correction: '+note:''}`;
  return {modelId,prompt,imageUrls,useDefaultReference:false,verbatimPrompt:true,outputSize:null,
    imageSize:{width:1024,height:1536},resolution:'1K',format:'png',numImages:1};
}
export async function renderDirectOutfit(input: ReturnType<typeof directOutfitInput>, note: string) {
  const identity=DIRECT_IDENTITIES[input.identityId];
  const refs=await Promise.all([identity.face,identity.profile].map(async file=>{
    const bytes=await fs.readFile(path.join(process.cwd(),'public',file));
    return uploadToFal(new Blob([Uint8Array.from(bytes)],{type:'image/png'}),path.basename(file));
  }));
  const params=directOutfitParams(input,refs,note);
  const result=await generate(params);
  const providerUrl=result.images[0]?.url;
  if(!providerUrl)throw Error('The generator returned no image.');
  const response=await fetch(providerUrl);
  if(!response.ok)throw Error('Could not read generated image.');
  const bytes=Buffer.from(await response.arrayBuffer());
  const metadata=await sharp(bytes,{limitInputPixels:20_000_000}).metadata();
  if(metadata.format!=='png')throw Error('Direct outfit edit requires native PNG output.');
  const url=await uploadToFal(new Blob([Uint8Array.from(bytes)],{type:'image/png'}),'direct-outfit.png');
  const hosted=await fetch(url);
  if(!hosted.ok || !Buffer.from(await hosted.arrayBuffer()).equals(bytes))throw Error('Original output verification failed.');
  return {ok:true,view:input.view,url,providerUrl,requestId:result.requestId,editMode:'direct',
    modelId:input.modelId,engine:input.modelId==='gpt-image'?'gpt2':input.modelId==='gpt-image-25'?'gpt25':'nano',
    humanModelId:`face:${input.identityId}`,identityId:input.identityId,
    resolution:`${metadata.width}×${metadata.height}`,nativeDimensions:{width:metadata.width,height:metadata.height},
    prompt:params.prompt,inputImageUrls:params.imageUrls,sourceImageUrl:input.sources[input.view],
    outputSha256:createHash('sha256').update(bytes).digest('hex'),anchored:false,garmentBackInferred:false,
    restore:{applied:false},photoFinish:{method:'native',applied:false},corrections:[]};
}
