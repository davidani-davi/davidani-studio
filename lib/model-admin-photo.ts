import fs from 'node:fs/promises';
import path from 'node:path';
import { head, list } from '@vercel/blob';
import sharp from 'sharp';
import { referencePixels } from './garment-only';
import { ASSET_PREFIX, MAX_PHOTO_BYTES, type ReferencePhoto, type FaceProtection } from './model-admin';

export function validUploadPath(value: string): boolean {
  return /^model-admin\/photos\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/.test(value);
}
export async function inspectAdminPhoto(url: string, protectedPercent?: number, blendPercent?: number, previous?: FaceProtection): Promise<ReferencePhoto> {
  if (protectedPercent !== undefined && (!Number.isFinite(protectedPercent) || protectedPercent < 1 || protectedPercent > 80)) throw Error('Choose a protection boundary between 1% and 80%.');
  if (blendPercent !== undefined && (protectedPercent === undefined || !Number.isFinite(blendPercent) || blendPercent < .1 || blendPercent > 5 || blendPercent >= protectedPercent)) throw Error('Choose a hair blend between 0.1% and 5%, smaller than the protection boundary.');
  let bytes: Buffer;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(parsed.hostname) || parsed.search || parsed.hash || !validUploadPath(parsed.pathname.slice(1))) throw Error('Choose a photo uploaded through this admin.');
    // head authenticates against THIS store; arbitrary external URLs are never fetched.
    const owned = await list({prefix:parsed.pathname.slice(1),limit:1});
    if (!owned.blobs.some(b => b.url === url)) throw Error('Photo is not in this reference library.');
    const info = await head(url);
    if (info.url !== url || !info.pathname.startsWith(ASSET_PREFIX) || info.size > MAX_PHOTO_BYTES) throw Error('Invalid uploaded photo.');
    const response = await fetch(url, {cache:'no-store', redirect:'error'});
    if (!response.ok) throw Error('Uploaded photo could not be read.');
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    const key = url.replace(/^\/user-assets\//,'');
    if (!url.startsWith('/user-assets/') || !validUploadPath(key)) throw Error('Invalid uploaded photo.');
    bytes = await fs.readFile(path.join(process.cwd(),'public/user-assets',key));
  }
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw Error('Use an image no larger than 20 MB.');
  const meta = await sharp(bytes, {limitInputPixels:20_000_000}).metadata();
  if (!['png','jpeg','webp'].includes(meta.format || '') || (meta.pages || 1) > 1) throw Error('Use a still PNG, JPEG or WebP image.');
  const pixels = await referencePixels(bytes);
  const photo: ReferencePhoto = {filename: new URL(url, 'https://local').pathname.split('/').pop()!, publicPath:url};
  if (protectedPercent !== undefined) {
    const protectedRows=Math.round(pixels.height*protectedPercent/100);
    // Older callers do not send blendPercent. Keep a reviewed width only for
    // the same decoded photo; a replacement gets its own settings.
    const same=previous?.sha256===pixels.sha256 && previous.width===pixels.width && previous.height===pixels.height;
    const transitionRows=blendPercent!==undefined ? Math.max(1,Math.round(pixels.height*blendPercent/100))
      : same ? previous.transitionRows : Math.max(1,Math.round(pixels.height*.005));
    if (!Number.isInteger(transitionRows) || transitionRows<1 || transitionRows>=protectedRows) throw Error('The hair blend must leave a protected area above it. Move the boundary or reduce the blend.');
    photo.protection = {width:pixels.width,height:pixels.height,sha256:pixels.sha256,protectedRows,transitionRows};
  }
  return photo;
}
