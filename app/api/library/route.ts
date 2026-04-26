import { NextResponse } from "next/server";
import {
  filterLibraryStyles,
  readLibraryIndex,
  regenerateLibraryStyleSeo,
  updateLibraryStyle,
  upsertLibraryStyle,
} from "@/lib/style-library";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const index = await readLibraryIndex();
    const styles = filterLibraryStyles(
      index,
      url.searchParams.get("q"),
      url.searchParams.get("styleNumber")
    );
    return NextResponse.json({ ok: true, styles });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Library search failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const style = await upsertLibraryStyle({
      styleNumber: String(body?.styleNumber || ""),
      color: String(body?.color || body?.userStyleName || ""),
      viewLabel: String(body?.viewLabel || ""),
      imageUrl: String(body?.imageUrl || ""),
      prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
    });
    return NextResponse.json({ ok: true, style });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Library upload failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (body?.action === "update") {
      const style = await updateLibraryStyle({
        styleId: String(body?.styleId || ""),
        styleNumber: String(body?.styleNumber || ""),
        color: String(body?.color || ""),
        seoName: String(body?.seoName || ""),
        seoDescription: String(body?.seoDescription || ""),
        views: Array.isArray(body?.views) ? body.views : [],
      });
      return NextResponse.json({ ok: true, style });
    }

    const style = await regenerateLibraryStyleSeo(String(body?.styleId || ""));
    return NextResponse.json({ ok: true, style });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "SEO regeneration failed" },
      { status: 400 }
    );
  }
}
