import { NextResponse } from "next/server";
import {
  deleteUserReference,
  listUserReferences,
  saveUserReference,
} from "@/lib/user-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, references: await listUserReferences() });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to list references" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const label = String(form.get("label") ?? "").trim();
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "An image file is required." }, { status: 400 });
    }
    if (!label) {
      return NextResponse.json({ ok: false, error: "A preset name is required." }, { status: 400 });
    }
    const reference = await saveUserReference(file, label);
    return NextResponse.json({ ok: true, reference });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save reference" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }
    await deleteUserReference(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete reference" },
      { status: 500 }
    );
  }
}
