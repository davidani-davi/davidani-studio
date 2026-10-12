import { NextResponse } from "next/server";
import {
  DIRECT_UPLOAD_MAX_FILES,
  canUploadDirect,
  directUploadFileName,
  type DirectUploadFile,
} from "@/lib/direct-upload";

const FAL_INITIATE_URL = "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

type Target = { name: string; uploadUrl: string; url: string } | null;

/**
 * Hands the browser one signed fal storage URL per photo, so the photo
 * travels straight to fal (lib/upload-images.ts). A `null` target means
 * "send this one to /api/upload": not a PNG/JPEG, too big, or fal didn't
 * answer. Gated by the session cookie like every other /api route.
 */
export async function POST(req: Request) {
  const key = process.env.FAL_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "FAL_KEY is missing" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const files: DirectUploadFile[] = (Array.isArray(body?.files) ? body.files : [])
    .slice(0, DIRECT_UPLOAD_MAX_FILES)
    .map((f: any) => ({
      name: String(f?.name ?? ""),
      type: String(f?.type ?? ""),
      size: Number(f?.size) || 0,
    }));
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "files is required" }, { status: 400 });
  }

  const targets: Target[] = await Promise.all(
    files.map(async (file): Promise<Target> => {
      if (!canUploadDirect(file)) return null;
      const name = directUploadFileName(file.name, file.type);
      try {
        const res = await fetch(FAL_INITIATE_URL, {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content_type: file.type.toLowerCase(), file_name: name }),
        });
        if (!res.ok) {
          console.warn("[upload/direct] fal initiate failed:", res.status);
          return null;
        }
        const data = await res.json();
        return data?.upload_url && data?.file_url
          ? { name, uploadUrl: data.upload_url, url: data.file_url }
          : null;
      } catch (err) {
        console.warn("[upload/direct] fal initiate error:", err);
        return null;
      }
    })
  );

  return NextResponse.json({ ok: true, targets });
}
