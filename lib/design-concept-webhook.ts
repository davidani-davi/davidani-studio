import {createHmac,timingSafeEqual} from 'node:crypto';
import {validConceptId} from './design-concepts';
function secret(){const value=process.env.AUTH_SECRET||process.env.APP_PASSWORD;if(!value)throw Error('Concept callback signing is not configured');return value}
export function conceptCallbackSignature(id:string){if(!validConceptId(id))throw Error('Invalid concept ID');return createHmac('sha256',secret()).update('design-concept-complete-v1:'+id).digest('hex')}
export function conceptCallbackUrl(id:string){return 'https://davidani-studio.vercel.app/api/design-concept-complete?id='+id+'&signature='+conceptCallbackSignature(id)}
export function validConceptCallback(id:unknown,signature:unknown){if(!validConceptId(id)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;try{return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(conceptCallbackSignature(id),'hex'))}catch{return false}}
