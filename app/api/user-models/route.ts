import { NextResponse } from "next/server";
import { deleteUserModel, listUserModels, saveUserModel } from "@/lib/user-assets";

export const runtime = "nodejs";
export const maxDuration = 120;

function asImage(value: FormDataEntryValue | null): File | undefined {
  return value instanceof File && value.type.startsWith("image/") ? value : undefined;
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, models: await listUserModels() });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to list models" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const front = asImage(form.get("front"));
    if (!name) {
      return NextResponse.json({ ok: false, error: "A model name is required." }, { status: 400 });
    }
    if (!front) {
      return NextResponse.json(
        { ok: false, error: "A front photo is required." },
        { status: 400 }
      );
    }
    const model = await saveUserModel(name, {
      front,
      side: asImage(form.get("side")),
      back: asImage(form.get("back")),
      full: asImage(form.get("full")),
    });
    return NextResponse.json({ ok: true, model });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save model" },
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
    await deleteUserModel(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete model" },
      { status: 500 }
    );
  }
}
