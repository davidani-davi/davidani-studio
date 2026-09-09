import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { conceptStore } from '@/lib/design-concept-store';
import { conceptProvider } from '@/lib/design-concept-provider';
import { submitConcept,pollConcept,validConceptId } from '@/lib/design-concepts';
export const runtime='nodejs';
export const maxDuration=180;
function authorized(req:Request){const expected=process.env.MODEL_SHOTS_TOKEN||process.env.APP_PASSWORD,got=req.headers.get('x-ddto-token')||'';return !!expected&&Buffer.byteLength(expected)===Buffer.byteLength(got)&&timingSafeEqual(Buffer.from(expected),Buffer.from(got))}
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})}
export async function POST(req:Request){
  if(!authorized(req))return json({error:'Unauthorized'},401);
  try{return json({task:await submitConcept(conceptStore(),conceptProvider(new URL(req.url).hostname==='davidani-studio.vercel.app'),await req.json())},202)}
  catch(e:any){return json({error:e.status?e.message:'Concept request could not be confirmed. Recheck the saved request before generating again.'},e.status||503)}
}
export async function GET(req:Request){
  if(!authorized(req))return json({error:'Unauthorized'},401);
  const id=new URL(req.url).searchParams.get('id');if(!validConceptId(id))return json({error:'Valid concept ID required'},400);
  try{const task=await pollConcept(conceptStore(),conceptProvider(),id);return task?json({task}):json({error:'Concept not found'},404)}
  catch{return json({error:'Could not check this concept. Its saved request remains available; retry the status check.'},503)}
}
