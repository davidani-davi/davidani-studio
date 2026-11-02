import { upload } from "@vercel/blob/client";

// Browser half of lib/user-model-upload.ts: the Add model form sends each original photo straight to storage,
// untouched, and posts only its link, so a set of full-size photos is no longer held to Vercel's 4.5 MB request cap.
const ROUTE = "/api/user-models/upload";
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;
export type UploadMode = "cloud" | "local";

/** PNG, JPEG or WebP up to 20 MB goes up as it is; anything else (HEIC, larger files) takes the shrink path. */
export function canSendOriginal(file: File): boolean {
  return TYPES.includes(file.type) && file.size > 0 && file.size <= MAX_BYTES;
}

/** Whether photos go to Blob (production) or through the route (local dev); null when the route can't be reached. */
export async function originalUploadMode(): Promise<UploadMode | null> {
  try {
    const res = await fetch(ROUTE, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json())?.cloud ? "cloud" : "local";
  } catch {
    return null;
  }
}

/** Uploads the file exactly as chosen and returns the link to send as `<view>Url`. */
export async function uploadOriginal(file: File, mode: UploadMode, onProgress?: (percent: number) => void): Promise<string> {
  if (mode === "cloud") {
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const blob = await upload(`user-models/incoming/${crypto.randomUUID()}.${ext}`, file, {
      access: "public",
      handleUploadUrl: ROUTE,
      contentType: file.type,
      onUploadProgress: (e) => onProgress?.(e.percentage),
    });
    return blob.url;
  }
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(ROUTE, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) throw new Error(data?.error || `upload failed (${res.status})`);
  return data.url;
}
