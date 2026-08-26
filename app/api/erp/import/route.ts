import { NextResponse } from "next/server";
import { erpFetchBytes } from "@/lib/erp-category";
import { uploadToFal } from "@/lib/fal";
import { fullSizeUrl, isErpPhotoUrl, parseErpPhoto } from "@/lib/erp-photos";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Take an ERP style photo into the studio as an intake image.
 *
 * The picker browses thumbnails; this fetches the ORIGINAL — same name without
 * the T_ prefix, measured at 4.8 MB against the thumbnail's 32 KB — because
 * what gets picked is what the model has to read the garment from.
 *
 * Uploaded to fal so it becomes an ordinary intake URL: the generation path
 * hands image URLs to the model, and an ERP URL behind a session cookie is not
 * one it could fetch.
 */
export async function POST(req: Request) {
  let src: string | undefined;
  try {
    ({ src } = (await req.json()) as { src?: string });
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const full = src ? fullSizeUrl(src) : "";
  if (!isErpPhotoUrl(full)) {
    return NextResponse.json({ ok: false, error: "Not an ERP style photo." }, { status: 400 });
  }

  const bytes = await erpFetchBytes(full);
  if (!bytes) {
    return NextResponse.json(
      { ok: false, error: "Could not read that photo from the ERP." },
      { status: 502 }
    );
  }

  // The filename already carries the style and colourway in whatever shape the
  // ERP filed them; keeping it means the intake is traceable to its frame.
  const meta = parseErpPhoto(full);
  const name =
    decodeURIComponent(full.split("/").pop() ?? "").replace(/\s+/g, "-") || "erp-style-photo.png";
  try {
    const url = await uploadToFal(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      name
    );
    return NextResponse.json({
      ok: true,
      url,
      name,
      colorway: meta?.colorway ?? null,
      index: meta?.index ?? null,
    });
  } catch (err: any) {
    console.error("[erp-import] upload failed:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Could not bring that photo in." },
      { status: 500 }
    );
  }
}
