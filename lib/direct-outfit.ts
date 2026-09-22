import fs from 'node:fs/promises';
import { renderProtectedRealShoot } from './real-shoot-protection';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { generate, uploadToFal, type GenerateParams } from './fal';
import type { PresetView } from './models-registry';

export const DIRECT_IDENTITIES = {
  vision: { label: 'Vision', face: '/identity-masters/vision-approved.png', profile: '/identity-masters/vision-approved-three-quarter.png' },
  celine: { label: 'Celine', face: '/identity-masters/celine-loose.png', profile: '/identity-masters/celine-profile-left.png' },
} as const;
export type DirectIdentity = keyof typeof DIRECT_IDENTITIES;
export function directOutfitInput(body: any) {
  if (!['front','side','back','full'].includes(body.view)) throw Error('Choose a valid outfit view.');
  if (!Object.hasOwn(DIRECT_IDENTITIES, body.identityId)) throw Error('Choose Vision or Celine for Direct outfit edit.');
  const realShoot = body.editMode === 'real-shoot';
  const poseMode = realShoot ? 'source' : body.poseMode ?? 'source';
  if (!['source','reference'].includes(poseMode)) throw Error('Choose a valid pose source.');
  if (poseMode === 'reference' && (typeof body.humanModelId !== 'string' || !body.humanModelId || body.humanModelId === 'auto' || typeof body.poseId !== 'string' || !body.poseId)) throw Error('Choose a pose reference set.');
  const sources = body.outfitSources;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) throw Error('Choose matching ERP outfit photos.');
  const valid = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u) && u.length < 4096;
  const shootReferences = realShoot ? body.shootReferences : undefined;
  if (realShoot && (!shootReferences || !valid(shootReferences.color) || (shootReferences.detail && !valid(shootReferences.detail)))) throw Error('Choose a new-color photo and a valid optional fabric close-up.');
  for (const [view,url] of Object.entries(sources)) {
    if (!['front','side','back','full'].includes(view) || !valid(url)) throw Error('Invalid ERP outfit photo.');
  }
  if (poseMode === 'reference' && !valid(sources.front)) throw Error('Choose a front garment photo.');
  if (body.anchorImageUrl && !valid(body.anchorImageUrl)) throw Error('Invalid approved front image.');
  if (poseMode === 'source' && !valid(sources[body.view])) throw Error(`Choose the original ERP ${body.view} outfit photo, or use Simple garment swap.`);
  const modelId = body.modelId || ({gpt2:'gpt-image',gpt25:'gpt-image-25',nano:'nano-banana-pro'} as Record<string,string>)[body.engine || 'gpt25'];
  if (!['gpt-image','gpt-image-25','nano-banana-pro'].includes(modelId) || body.engine === 'tryon') throw Error('Choose GPT or Nano for Direct outfit edit.');
  const expected = ({gpt2:'gpt-image',gpt25:'gpt-image-25',nano:'nano-banana-pro'} as Record<string,string>)[body.engine];
  if (body.engine && (!expected || expected !== modelId)) throw Error('Engine and model selections conflict.');
  return { realShoot, shootReferences: shootReferences as {color:string;detail?:string} | undefined, poseMode: poseMode as 'source'|'reference', humanModelId: body.humanModelId as string, poseId: body.poseId as string, poseReference: undefined as string | undefined, framing: 'full' as string, garmentName: String(body.known?.title || '').slice(0,300), anchorImageUrl: body.view !== 'front' ? body.anchorImageUrl as string | undefined : undefined, view: body.view as PresetView, identityId: body.identityId as DirectIdentity, sources: sources as Partial<Record<PresetView,string>>, modelId };
}
export function directOutfitParams(input: ReturnType<typeof directOutfitInput>, identities: string[], note = ''): GenerateParams {
  const {view,sources,modelId}=input;
  if (input.realShoot) {
    const refs = input.shootReferences!;
    const imageUrls = [sources[view]!, refs.color, ...identities, ...(refs.detail ? [refs.detail] : [])];
    const prompt = `Edit IMAGE 1, the actual photographed ${view} view of ${input.garmentName || 'this garment'}. IMAGE 1 is the sole authority for garment construction, photographed fit, silhouette, sleeve and hem lengths, stripe/pattern scale, drape, pose, body proportions, framing, other clothing and background. Preserve these faithfully; do not reconstruct the garment around an identity portrait. IMAGE 2 is the NEW COLORWAY reference ONLY: transfer its garment colors to the corresponding fabric/pattern regions of image 1. Ignore image 2's fit, pose, body and styling. Do not transfer the old colorway from image 1. IMAGES 3 and 4 are ${DIRECT_IDENTITIES[input.identityId].label}'s face and hair identity only; ignore their clothing and pose. Match that person's facial proportions and natural hair while retaining image 1's head orientation and realistic head-to-body scale. ${view === 'back' ? 'Keep a rear-facing head face-free; do not add a face to the back.' : 'Keep identity recognizable without distorting the neck or head.'} ${refs.detail ? 'IMAGE 5 is a close-up of this same garment: use it for fabric texture, fine construction, buttons and edge finishing ONLY, never its colors or framing.' : ''} Retain photographed fabric thickness, fuzz, texture and natural folds. Preserve closures and button count, avoid duplicate buttons. Preserve exact garment length and volume, including long sleeves and long pants. Preserve other clothing and accessories from image 1. Seamless natural skin and hair boundaries; no pasted head, horizontal neck seam, collage or added text. One finished photographic image. ${note ? 'Operator correction: '+note : ''}`;
    return {modelId,prompt,imageUrls,useDefaultReference:false,verbatimPrompt:true,outputSize:null,imageSize:{width:1024,height:1536},resolution:'1K',format:'png',numImages:1};
  }
  if (input.poseMode === 'reference') {
    if (!input.poseReference) throw Error('Missing matching pose reference.');
    const garment = sources[view] || (view === 'back' ? sources.back : undefined) || sources.front!;
    const support = Object.values(sources).filter((u): u is string => Boolean(u) && u !== garment);
    const imageUrls = [garment, ...identities, input.poseReference, ...new Set(support)];
    if (input.anchorImageUrl) imageUrls.push(input.anchorImageUrl);
    const framing = input.framing === 'full' ? 'head to toe with both complete shoes visible' : input.framing === 'low' ? 'waist to shoes' : input.framing === 'knee' ? 'head to knee' : 'head to mid-thigh';
    const prompt = `Create one photorealistic ${view} clothing photograph. Image 1 and any additional original garment photographs are the authority for the garment: ${input.garmentName || 'the supplied garment'}. Images 2 and 3 are ${DIRECT_IDENTITIES[input.identityId].label}'s approved face and hair identity only, never clothing or pose instructions. Image 4 is the requested ${view} pose reference: it is the SOLE authority for body stance, individual arm/hand positions, individual leg positions and camera angle. Match each visible limb position specifically, including any bent knee, lifted foot or relaxed arm. Do not copy body pose from the garment photographs, identity portraits or approved front result. Replace its face with the approved identity and its clothing with the supplied garment. Never copy the pose reference's garment, accessories, pattern or hem length into the product. Preserve the product's exact colors, pattern scale and placement, cut, neckline, seams, sleeves and hem proportions from the garment photos. Frame ${framing}; if the pose reference is cropped, extend the composition naturally to include the entire garment and required framing. Use a natural upright head and relaxed neck, retaining the approved face's proportions, eyes, nose, mouth, jaw and blonde or brown hair from images 2 and 3. ${view === 'back' ? 'Show a true rear view with no visible face.' : 'Keep the face recognizably the approved person at this angle.'} ${!sources[view] ? 'An exact garment photo for this angle is unavailable: infer only necessary unseen construction conservatively, without inventing graphics, trims or pockets.' : ''} ${input.anchorImageUrl ? 'The LAST image is the approved front result: match its garment color, design, fit and identity across this set but ignore its posture, framing and limb positions completely: image 4 alone controls those.' : ''} Use one continuous neutral studio background, realistic skin, no added grain or sharpening. No head-paste seams or collage. ${note ? 'Operator instructions: '+note : ''}`;
    return {modelId,prompt,imageUrls,useDefaultReference:false,verbatimPrompt:true,outputSize:null,imageSize:{width:1024,height:1536},resolution:'1K',format:'png',numImages:1};
  }
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
  const protectedResult=input.realShoot ? await renderProtectedRealShoot(params) : undefined;
  const result=protectedResult ? undefined : await generate(params);
  const providerUrl=protectedResult?.providerUrl || result?.images[0]?.url;
  if(!providerUrl)throw Error('The generator returned no image.');
  let bytes=protectedResult?.bytes;
  if(!bytes){
    const response=await fetch(providerUrl);
    if(!response.ok)throw Error('Could not read generated image.');
    bytes=Buffer.from(await response.arrayBuffer());
  }
  const metadata=await sharp(bytes,{limitInputPixels:20_000_000}).metadata();
  if(metadata.format!=='png')throw Error('Direct outfit edit requires native PNG output.');
  const url=await uploadToFal(new Blob([Uint8Array.from(bytes)],{type:'image/png'}),'direct-outfit.png');
  const hosted=await fetch(url);
  if(!hosted.ok || !Buffer.from(await hosted.arrayBuffer()).equals(bytes))throw Error('Original output verification failed.');
  return {ok:true,view:input.view,url,providerUrl,requestId:protectedResult?.requestId || result?.requestId,editMode:input.realShoot?'real-shoot':'direct',
    modelId:input.modelId,engine:input.modelId==='gpt-image'?'gpt2':input.modelId==='gpt-image-25'?'gpt25':'nano',
    humanModelId:input.poseMode === 'reference' ? input.humanModelId : `face:${input.identityId}`,identityId:input.identityId,poseMode:input.poseMode,poseId:input.poseId,
    resolution:`${metadata.width}×${metadata.height}`,nativeDimensions:{width:metadata.width,height:metadata.height},
    prompt:params.prompt,inputImageUrls:params.imageUrls,sourceImageUrl:input.sources[input.view],
    outputSha256:createHash('sha256').update(bytes).digest('hex'),anchored:input.poseMode === 'reference' && Boolean(input.anchorImageUrl),garmentBackInferred:input.poseMode === 'reference' && input.view === 'back' && !input.sources.back,garmentViewInferred:input.poseMode === 'reference' && !input.sources[input.view],
    garmentProtection:protectedResult?.protection,stagePrompts:protectedResult?.stagePrompts,
    restore:{applied:false},photoFinish:{method:input.realShoot?'garment-protected':'native',applied:input.realShoot},corrections:[]};
}
