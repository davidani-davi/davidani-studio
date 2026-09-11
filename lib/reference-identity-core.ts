import type { GenerateParams } from './fal';
export const IDENTITY_VIEWS = ['front', 'side', 'back', 'full'] as const;
export type IdentityView = typeof IDENTITY_VIEWS[number];
export const IDENTITY_PROMPT = "Replace only the face and hair in image 1 with the face and hair from image 2. Keep the hair color, length and texture consistent with image 2, falling naturally for image 1's pose. Use relaxed eyes, a subtle natural smile and an off-camera gaze. Keep image 1's body pose, outfit, exact garment colors and print, lighting, background and framing unchanged. Preserve soft natural photographic texture; no beauty retouching or sharpening.";
export const IDENTITY_MASTERS = [
  {id:'celine-loose', name:'Celine', label:'Celine · loose hair', url:'/identity-masters/celine-loose.png'},
  {id:'celine-half-up', name:'Celine', label:'Celine · half-up hair', url:'/identity-masters/celine-half-up.jpg'},
  {id:'vision', name:'Vision', label:'Vision · blonde', url:'/identity-masters/vision.png'},
] as const;
export type IdentityInput = {url:string; filename:string};
export type IdentitySet = {id:string; name:string; createdAt:string; identity:IdentityInput & {name:string; id:string}; inputs:Partial<Record<IdentityView,IdentityInput>>; prompt:string; modelId:'gpt-image-25'};
export type IdentityResult = {imageUrl?:string; providerUrl?:string; requestId?:string; error?:string; persistenceWarning?:string};
export type IdentityJob = {id:string; status:'running'|'done'|'failed'; result?:IdentityResult};
export type IdentitySetDetail = IdentitySet & {jobs:Partial<Record<IdentityView,IdentityJob>>};
export function identityTaskId(id:string, view:IdentityView) {return `identity-${id}-${view}`;}
export function identityGenerationParams(source:string, identity:string):GenerateParams {
  // raw:true would neutralize the source face and rewrite the prompt in fal.ts.
  // Verbatim bypasses those changes AND the portrait-rejection fallback.
  return {modelId:'gpt-image-25', prompt:IDENTITY_PROMPT, imageUrls:[source,identity],
    useDefaultReference:false, verbatimPrompt:true, outputSize:null,
    resolution:'4K', format:'png', numImages:1};
}
export function validIdentitySetId(id:unknown):id is string {return typeof id==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);}
