import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authorized, unauthorized } from "@/lib/request-auth";
import { INCOMING_PREFIX, INCOMING_TYPES, MAX_INCOMING_BYTES, localIncomingFile, validIncomingPath } from "@/lib/user-model-upload";

export const runtime = "nodejs";

/** Tells the Add model form whether photos go straight to Blob (production) or through this route (local dev). */
export async function GET(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  return NextResponse.json({ cloud: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}

/**
 * Production: hands the browser a one-time token to upload one original photo straight to Blob (up to 20 MB),
 * so it never passes through a function and its 4.5 MB request cap. Local dev: stores the posted file on disk.
 */
export async function POST(req: Request) {
  if (!(await authorized(req))) return unauthorized();
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const body = await req.json();
      if (body?.type !== "blob.generate-client-token") throw Error("Invalid upload request.");
      return NextResponse.json(await handleUpload({
        request: req,
        body,
        onBeforeGenerateToken: async (pathname) => {
          if (!validIncomingPath(pathname)) throw Error("Invalid photo destination.");
          return { allowedContentTypes: INCOMING_TYPES, maximumSizeInBytes: MAX_INCOMING_BYTES, allowOverwrite: false, addRandomSuffix: false };
        },
      }));
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !INCOMING_TYPES.includes(file.type) || !file.size || file.size > MAX_INCOMING_BYTES) {
      throw Error("Use a PNG, JPEG or WebP up to 20 MB.");
    }
    const key = `${INCOMING_PREFIX}${randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
    const dest = localIncomingFile(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url: `/user-assets/${key}` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed." }, { status: 400 });
  }
}
