import { NextResponse } from "next/server";
import { uploadToFal } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("files");
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "No files provided." }, { status: 400 });
    }

    const uploads: { name: string; url: string }[] = [];
    for (const entry of files) {
      if (!(entry instanceof File)) continue;
      const url = await uploadToFal(entry, entry.name || "upload.png");
      uploads.push({ name: entry.name, url });
    }

    return NextResponse.json({ ok: true, uploads });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
