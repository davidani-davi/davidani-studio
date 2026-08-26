import { NextResponse } from "next/server";
import { resolveDownloadSource, safeDownloadName } from "@/lib/download-source";

export const runtime = "nodejs";

/**
 * Hand a finished render to the browser as a file.
 *
 * The stage used to do this with `<a download href={renderUrl}>`, which does
 * nothing: renders are served from fal's CDN, and the download attribute is
 * ignored for cross-origin hrefs. The click opened the image in a new tab and
 * left the operator to right-click-save it, under whatever name the CDN chose.
 *
 * Proxying it through here makes the response same-origin AND lets the server
 * set Content-Disposition, so the filename is the studio's convention —
 * styleNumber-runId-variant.jpg — rather than a content hash.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const source = resolveDownloadSource(params.get("url"));
  if (!source.ok) {
    return NextResponse.json(
      { ok: false, error: `Refused to fetch that URL (${source.reason}).` },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    // manual: a redirect is how an allowlisted host would otherwise be used to
    // reach one that is not.
    upstream = await fetch(source.url, { redirect: "manual" });
  } catch (err: any) {
    console.error("[download] fetch failed:", err);
    return NextResponse.json({ ok: false, error: "Could not reach the image." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { ok: false, error: `The image host answered ${upstream.status}.` },
      { status: 502 }
    );
  }

  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  if (!type.startsWith("image/")) {
    return NextResponse.json(
      { ok: false, error: "That URL is not an image." },
      { status: 415 }
    );
  }

  const name = safeDownloadName(params.get("name"), "davidani-render.jpg");
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, max-age=3600",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}
