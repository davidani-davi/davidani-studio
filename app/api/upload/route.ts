import { NextResponse } from "next/server";
import { uploadCompatibleImageToFal } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("files");
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "No files provided." }, { status: 400 });
    }

    const uploads = await Promise.all(
      files
        .filter((entry): entry is File => entry instanceof File)
        .map((entry) => uploadCompatibleImageToFal(entry))
    );

    return NextResponse.json({ ok: true, uploads });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
