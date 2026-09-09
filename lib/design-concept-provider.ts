import { CONCEPT_MODEL, type ConceptProvider } from './design-concepts';
import {conceptCallbackUrl} from './design-concept-webhook';
const BASE='https://queue.fal.run/'+CONCEPT_MODEL;
export function conceptProvider(webhook=false):ConceptProvider {
  const key=process.env.FAL_KEY;if(!key)throw Error('Concept generation is not configured.');
  async function request(url:string,body?:unknown){
    const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Key '+key,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(40000)});
    if(!r.ok)throw Object.assign(Error('Concept provider could not be reached'),{providerStatus:r.status});
    return r.json();
  }
  return {
    async submit(prompt,id){
      // Raw fetch deliberately performs no submission retry; SDK retries could
      // re-submit after an ambiguous 5xx response from a paid generation.
      const r=await request(BASE+(webhook?'?fal_webhook='+encodeURIComponent(conceptCallbackUrl(id)):''),{prompt,num_images:1,aspect_ratio:'2:3',resolution:'2K',
        output_format:'png',limit_generations:true,enable_web_search:false});
      if(typeof r.request_id!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(r.request_id))throw Error('Missing provider request ID');
      return r.request_id;
    },
    async poll(id){
      if(!/^[a-zA-Z0-9-]{8,100}$/.test(id))throw Error('Invalid provider ID');
      const url=BASE+'/requests/'+id,status=await request(url+'/status');
      if(['IN_QUEUE','IN_PROGRESS'].includes(status.status))return {status:'running'};
      if(status.status==='FAILED')return {status:'failed',error:'The image provider reported a failed generation.'};
      if(status.status!=='COMPLETED')throw Error('Unknown provider state');
      let result;
      try{result=await request(url)}catch(e:any){
        if(e.providerStatus===422)return {status:'failed',error:'The image provider could not generate this concept. Revise the brief before a new attempt.'};
        throw e;
      }
      const image=result.images?.[0];if(!image?.url)throw Error('Completed request has no image');
      return {status:'done',image:{url:image.url,width:image.width,height:image.height}};
    },
  };
}
