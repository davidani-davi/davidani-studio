import { NextResponse } from "next/server";
import { erpFetchBytes } from "@/lib/erp-category";
import { isErpPhotoUrl } from "@/lib/erp-photos";

export const runtime = "nodejs";

/**
 * Serve one ERP style photo to the browser.
 *
 * ERP images are behind the ERP's own session, so the browser cannot load them
 * directly — only the server holds the cookie. This is the narrowest possible
 * window onto that session: style photos only, checked before the fetch, never
 * a redirect and never another path.
 */
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src");
  if (!isErpPhotoUrl(src)) {
    return NextResponse.json({ ok: false, error: "Not an ERP style photo." }, { status: 400 });
  }
  const bytes = await erpFetchBytes(src!);
  if (!bytes) {
    return NextResponse.json(
      { ok: false, error: "Could not read that photo from the ERP." },
      { status: 502 }
    );
  }
  const png = /\.png$/i.test(src!);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": png ? "image/png" : "image/jpeg",
      "Content-Length": String(bytes.length),
      // Private: this is authenticated ERP content and must not sit in a
      // shared cache. Long max-age because a style photo does not change.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
