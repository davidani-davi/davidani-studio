/**
 * Rules shared by the browser and /api/upload/direct for sending a photo
 * straight to fal storage instead of through /api/upload. Going direct skips
 * a hop (browser -> Vercel -> fal becomes browser -> fal) and Vercel's 4.5 MB
 * body cap. Only PNG and JPEG qualify: those are exactly the files
 * /api/upload forwards untouched (lib/kie-image-compat.ts); anything else
 * still goes through it to be converted.
 */
export const DIRECT_UPLOAD_MAX_FILES = 12;
export const DIRECT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const DIRECT_TYPES: Record<string, "png" | "jpg"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

export type DirectUploadFile = { name: string; type: string; size: number };

export function canUploadDirect(file: DirectUploadFile): boolean {
  return (
    Boolean(DIRECT_TYPES[file.type.toLowerCase()]) &&
    file.size > 0 &&
    file.size <= DIRECT_UPLOAD_MAX_BYTES
  );
}

/**
 * The stored file name. fal keeps it in the public URL, and the image models
 * downstream judge the format by that URL's extension, so the extension must
 * match the content type.
 */
export function directUploadFileName(name: string, type: string): string {
  const ext = DIRECT_TYPES[type.toLowerCase()] ?? "jpg";
  const base =
    (name || "")
      .replace(/\.[^.]*$/, "")
      .replace(/[\\/\u0000-\u001f]+/g, "-")
      .trim()
      .slice(0, 100) || "upload";
  return `${base}.${ext}`;
}
