export const UPLOAD_PREFIX = 'wording-studio-uploads/';
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_UPLOAD = 25_000_000;
const PATH = /^wording-studio-uploads\/[0-9a-f-]{36}\.(jpe?g|png|webp|heic|heif)$/i;

/** Token policy for a browser upload straight to Blob (never through a function, so iPhone photos over 4.5 MB work). */
export function uploadPolicy(pathname: string) {
  if (!PATH.test(pathname)) throw Error('Invalid photo destination.');
  return { allowedContentTypes: UPLOAD_TYPES, maximumSizeInBytes: MAX_UPLOAD, allowOverwrite: false, addRandomSuffix: false };
}

/** Only photos this page uploaded to our Blob store may start a job. */
export function validPhotoUrl(raw: unknown): raw is string {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com') && u.pathname.startsWith('/' + UPLOAD_PREFIX) && !u.pathname.includes('..');
  } catch { return false; }
}
