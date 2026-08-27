import { NextResponse } from "next/server";
import { fetchGalleryUrls } from "@/lib/erp-gallery";
import {
  groupForDisplay,
  parseErpPhoto,
  regularizeStyle,
  type ErpPhoto,
} from "@/lib/erp-photos";

export const runtime = "nodejs";
export const maxDuration = 60;

/** One style's gallery is not worth showing more of than this at once. */
const MAX_FRAMES = 24;

/** The browser can only reach ERP images through our own proxy. */
function proxied(url: string): string {
  return `/api/erp/photo?src=${encodeURIComponent(url)}`;
}

/**
 * Every photo the ERP holds for a style, grouped for a picker.
 *
 * Reuses the gallery crawl the analyzer's contact sheet already does, but
 * returns the frames rather than tiling them — the analyzer wants one image to
 * reason over, a picker wants the list.
 */
export async function GET(req: Request) {
  const asked = (new URL(req.url).searchParams.get("style") ?? "").trim();
  if (!asked) {
    return NextResponse.json({ ok: false, error: "A style number is required." }, { status: 400 });
  }
  // A Plus code has no photos of its own — they live on the regular twin.
  const style = regularizeStyle(asked);

  const photos = (await fetchGalleryUrls(style))
    .map((url) => parseErpPhoto(url, style))
    .filter((p): p is ErpPhoto => p !== null)
    .slice(0, MAX_FRAMES);

  return NextResponse.json({
    ok: true,
    style,
    /** Set when the asked-for code was a Plus twin, so the UI can say so. */
    regularizedFrom: style === asked.toUpperCase() ? null : asked.toUpperCase(),
    groups: groupForDisplay(photos, style).map((group) => ({
      colorway: group.colorway,
      foreign: group.foreign,
      photos: group.photos.map((photo) => ({
        index: photo.index,
        label: photo.index === null ? "—" : String(photo.index),
        thumb: proxied(photo.thumbUrl),
        /** The original, for generating from — not fetched until picked. */
        full: photo.fullUrl,
      })),
    })),
  });
}
