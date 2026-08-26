import { NextResponse } from "next/server";
import sharp from "sharp";
import { erpFetchBytes } from "@/lib/erp-category";
import { fetchGalleryUrls } from "@/lib/erp-gallery";
import {
  UNTAGGED_GROUP,
  groupForDisplay,
  namedForStyle,
  parseErpPhoto,
  type ErpPhoto,
} from "@/lib/erp-photos";
import {
  edgeStdDev,
  pickSquareHero,
  regularizeStyle,
  scoreSquareCandidate,
  squareReasons,
  squareThumbnailName,
} from "@/lib/erp-square";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Matches po_watch.kit_gallery_paths' own cap on one style's gallery. */
const MAX_FRAMES = 24;

/** The browser can only reach ERP images through our own proxy. */
function proxied(url: string): string {
  return `/api/erp/photo?src=${encodeURIComponent(url)}`;
}

/**
 * Measure the two things the square-thumbnail heuristic needs from the pixels.
 *
 * Read off the 32 KB thumbnail rather than the 4.8 MB original: the aspect is
 * identical and the edge-column flatness survives the downscale, which is why
 * prerender.py scores thumbnails too.
 */
async function measure(url: string): Promise<{ aspect: number; edgeStdDev: number } | null> {
  const bytes = await erpFetchBytes(url);
  if (!bytes) return null;
  try {
    // Raw greyscale pixels, because sharp's stats() ignores .extract() and
    // would report the whole photo's spread instead of its edges'.
    const { data, info } = await sharp(bytes)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) return null;
    return {
      aspect: info.width / info.height,
      edgeStdDev: edgeStdDev(data, info.width, info.height, info.channels),
    };
  } catch {
    return null;
  }
}

/**
 * Every photo the ERP holds for a style, grouped by colourway, with the frame
 * the Faire square thumbnail would be built from marked.
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

  const measured = await Promise.all(photos.map((photo) => measure(photo.thumbUrl)));
  const scored = photos.map((photo, position) => {
    const shape = measured[position];
    const candidate = {
      hasStyleToken: namedForStyle(photo, style),
      aspect: shape?.aspect ?? 1,
      edgeStdDev: shape?.edgeStdDev ?? Number.POSITIVE_INFINITY,
      position,
    };
    return {
      photo,
      score: shape ? scoreSquareCandidate(candidate) : Number.NEGATIVE_INFINITY,
      reasons: shape ? squareReasons(candidate) : { strengths: [], warnings: [] },
    };
  });

  const heroIndex = pickSquareHero(scored.map((s) => s.score));
  const hero = heroIndex !== null && scored[heroIndex].score > Number.NEGATIVE_INFINITY
    ? scored[heroIndex].photo
    : null;

  return NextResponse.json({
    ok: true,
    style,
    /** Set when the asked-for code was a Plus twin, so the UI can say so. */
    regularizedFrom: style === asked.toUpperCase() ? null : asked.toUpperCase(),
    squareThumbnail: hero
      ? {
          name: squareThumbnailName(style),
          colorway: hero.colorway ?? UNTAGGED_GROUP,
          index: hero.index,
          strengths: scored[heroIndex!].reasons.strengths,
          warnings: scored[heroIndex!].reasons.warnings,
        }
      : null,
    groups: groupForDisplay(scored.map((s) => s.photo), style).map((group) => ({
      colorway: group.colorway,
      foreign: group.foreign,
      photos: group.photos.map((photo) => {
        const entry = scored.find((s) => s.photo === photo)!;
        return {
          index: photo.index,
          label: photo.index === null ? "—" : String(photo.index),
          thumb: proxied(photo.thumbUrl),
          /** The original, for generating from — not fetched until picked. */
          full: photo.fullUrl,
          isSquareHero: photo === hero,
          strengths: entry.reasons.strengths,
          warnings: entry.reasons.warnings,
        };
      }),
    })),
  });
}
