import { NextResponse } from "next/server";
import {
  addInspirationSource,
  deleteInspirationSource,
  readInspirationIndex,
} from "@/lib/inspiration-library";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const index = await readInspirationIndex();
    return NextResponse.json({ ok: true, sources: index.sources });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load inspirations" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const source = await addInspirationSource({
      title: String(body?.title || ""),
      url: String(body?.url || ""),
      imageUrl: body?.imageUrl ? String(body.imageUrl) : undefined,
      category: String(body?.category || ""),
      tags: Array.isArray(body?.tags)
        ? body.tags.map((tag: unknown) => String(tag || "")).filter(Boolean)
        : typeof body?.tags === "string"
        ? body.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)
        : [],
      note: String(body?.note || ""),
    });
    return NextResponse.json({ ok: true, source });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to save inspiration" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    await deleteInspirationSource(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to delete inspiration" },
      { status: 400 }
    );
  }
}
