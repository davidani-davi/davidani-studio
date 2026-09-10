import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { adminAllowed } from '@/lib/model-admin-auth';
import { validUploadPath } from '@/lib/model-admin-photo';
import { ASSET_PREFIX, MAX_PHOTO_BYTES } from '@/lib/model-admin';
export const runtime='nodejs';
export async function POST(req: Request) {
  if(!await adminAllowed(req)) return NextResponse.json({error:'Sign in to upload references.'},{status:401});
  try {
    if(process.env.BLOB_READ_WRITE_TOKEN) {
      const body=await req.json();
      if(body.type!=='blob.generate-client-token') throw Error('Invalid upload request.');
      return NextResponse.json(await handleUpload({request:req,body,onBeforeGenerateToken:async pathname=>{
        if(!validUploadPath(pathname)) throw Error('Invalid photo destination.');
        return {allowedContentTypes:['image/png','image/jpeg','image/webp'],maximumSizeInBytes:MAX_PHOTO_BYTES,allowOverwrite:false,addRandomSuffix:false};
      }}));
    }
    const form=await req.formData();
    const file=form.get('file');
    if(!(file instanceof File) || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>MAX_PHOTO_BYTES || !file.size) throw Error('Use a PNG, JPEG or WebP up to 20 MB.');
    const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
    const key=`${ASSET_PREFIX}${randomUUID()}.${ext}`;
    const dest=path.join(process.cwd(),'public/user-assets',key);
    await fs.mkdir(path.dirname(dest),{recursive:true});
    await fs.writeFile(dest,Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({url:`/user-assets/${key}`});
  }catch(e:any){return NextResponse.json({error:e.message || 'Upload failed.'},{status:400});}
}
