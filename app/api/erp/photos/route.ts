import { NextResponse } from "next/server";
import { fetchGalleryUrls } from "@/lib/erp-gallery";
import { searchStyles, type StyleCandidate } from "@/lib/erp-style-search";
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

async function crawl(style: string): Promise<ErpPhoto[]> {
  return (await fetchGalleryUrls(style))
    .map((url) => parseErpPhoto(url, style))
    .filter((p): p is ErpPhoto => p !== null)
    .slice(0, MAX_FRAMES);
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
  let style = regularizeStyle(asked);
  let resolvedFrom: string | null = null;
  let candidates: StyleCandidate[] = [];

  let photos = await crawl(style);

  /*
   * Nothing under what was typed? Ask the ERP what it could have meant.
   *
   * Operators type the number off a tag — "52056" — not the whole code, and
   * the gallery crawl needs the exact one. Before this, a style the ERP has
   * four codes for reported that it held no photos at all.
   *
   * Only on the empty path, so an exact code still costs one request.
   */
  if (photos.length === 0) {
    candidates = await searchStyles(asked);
    if (candidates.length === 1) {
      resolvedFrom = asked.toUpperCase();
      style = candidates[0].style;
      candidates = [];
      photos = await crawl(style);
    }
  }

  return NextResponse.json({
    ok: true,
    style,
    /** Set when the typed code was a Plus twin or a fragment we resolved. */
    regularizedFrom: style === asked.toUpperCase() ? null : asked.toUpperCase(),
    resolvedFrom,
    /** More than one style matched; the UI offers them rather than guessing. */
    candidates,
    groups: groupForDisplay(photos, style).map((group) => ({
      label: group.label,
      kind: group.kind,
      styledWith: group.styledWith,
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
