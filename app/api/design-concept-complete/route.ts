import {NextResponse} from 'next/server';
import {validConceptCallback} from '@/lib/design-concept-webhook';
import {conceptStore} from '@/lib/design-concept-store';
import {conceptProvider} from '@/lib/design-concept-provider';
import {pollConcept} from '@/lib/design-concepts';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(req:Request){
 const url=new URL(req.url),id=url.searchParams.get('id'),signature=url.searchParams.get('signature');
 if(!validConceptCallback(id,signature))return NextResponse.json({error:'Unauthorized'},{status:401});
 // A signed callback is only a wake-up. Ignore its payload and fetch the result
 // from the provider using our own saved handle; incoming data cannot forge an
 // image, failure, request ID, or business observation.
 try{const task=await pollConcept(conceptStore(),conceptProvider(),id!,'callback');if(!task||!['done','failed'].includes(task.status))return NextResponse.json({retry:true},{status:503});return NextResponse.json({ok:true})}
 catch{return NextResponse.json({retry:true},{status:503})}
}
