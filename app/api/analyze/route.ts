import { NextResponse } from "next/server";
import {
  buildFrontBackContractPrompt,
  buildTwoImagePrompt,
  buildTwoPiecePrompt,
  extractCatalogGarmentFields,
  extractHeroGarmentFields,
  extractTwoPieceFields,
} from "@/lib/fal";
import { inferCategory, resolveCanvas, type GarmentCategory } from "@/lib/canvas-registry";
import { fetchErpCategory, mapErpCategory } from "@/lib/erp-category";
import { decodeStyleCode, reconcileStyleCode } from "@/lib/style-code";
import { buildGalleryContactSheet } from "@/lib/erp-gallery";
import { cachedVision } from "@/lib/vision-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Analyze the uploaded garment photo(s) and return everything the client needs
 * to pick a canvas and generate against it.
 *
 * Two things changed shape here, both for the same reason — the canvas is now
 * chosen from the garment's category, and the category is only known after the
 * vision call:
 *
 *  1. The VISION step is cached on its own, keyed only on the image URLs and
 *     the two-piece flag. Prompt assembly is pure and cheap, so it happens
 *     outside the cache. Previously the cache key included backgroundMode,
 *     which meant the same photo cost a second vision round-trip just to be
 *     described against a different canvas.
 *
 *  2. Both canvas variants of the prompt are returned. A run can need both at
 *     once — a front/back contract run for a category with an approved front
 *     canvas but no approved back one renders the front in "preserve" mode and
 *     the back against the empty sweep in "backdrop" mode. Assembling both is
 *     free; making the client guess is not.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, imageUrls, backgroundColor, twoPiece, styleNumber, styleNumberTrust } =
      body as {
        imageUrl: string;
        imageUrls?: string[];
        backgroundColor?: string;
        twoPiece?: boolean;
        /** Optional. When present, the ERP decides the category — see below. */
        styleNumber?: string;
        /**
         * "asserted" (typed, the default) or "inferred" (read from the upload's
         * filename in batch). An inferred code may not overrule a category the
         * ERP stated — see StyleNumberTrust in lib/style-code.ts.
         */
        styleNumberTrust?: "asserted" | "inferred";
      };

    const selectedImageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    if ((!imageUrl || typeof imageUrl !== "string") && selectedImageUrls.length === 0) {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }

    const primaryImageUrl = selectedImageUrls[0] || imageUrl;
    const isContract = selectedImageUrls.length >= 2;

    // --- ERP category, BEFORE vision ------------------------------------------
    // This needs only the style number, and it decides WHICH extractor runs. A
    // style the ERP calls SET must go through the two-piece extractor, and that
    // has to be settled before extraction rather than after: DETS60234 is a
    // "Two-piece active set" that vision read as a "tennis dress" on three
    // consecutive live runs, so it was being described — and rendered — as one
    // garment. Best effort throughout: no style number, no credentials, or an
    // ERP hiccup all leave this null and fall back to vision.
    const erpRaw = await fetchErpCategory(styleNumber);
    // The style code is reconciled in BEFORE the category is used for anything.
    // The category field is hand-entered and DWTS67099 — Winter Top & Skirt, a
    // set — is filed under JACKETS / OUTWEAR, so it rendered as a lone poncho
    // and its own skirt kept reading as contamination. The code names the
    // garments outright. See lib/style-code.ts for how far it is allowed to
    // push against the ERP (not all the way, and never for free).
    const reconciled = reconcileStyleCode(
      styleNumber,
      mapErpCategory(erpRaw),
      styleNumberTrust === "inferred" ? "inferred" : "asserted"
    );
    const erpMapped = reconciled.category;
    const treatAsSet = Boolean(twoPiece) || erpMapped === "set";

    // --- gallery contact sheet -----------------------------------------------
    // The category settles WHAT the garment is; it cannot settle WHICH garment
    // in a styled photo is the product. DDT9040 is a crochet halter shot under
    // a sheer cardigan, and from the single intake photo the analyzer picked
    // the cardigan. Its own gallery resolves it: the halter is in every frame,
    // the cardigan is not. Only worth building for a single garment — a set
    // uses the four-field extractor, and a front/back contract run already has
    // two views of the same SKU.
    const wantsGallery = Boolean(styleNumber) && !treatAsSet && !isContract;
    const gallery = wantsGallery ? await buildGalleryContactSheet(styleNumber!) : null;

    // --- vision (cached) -----------------------------------------------------
    const extracted = await cachedVision(
      "image-analyze-fields",
      {
        urls: selectedImageUrls,
        primaryImageUrl,
        twoPiece: treatAsSet,
        contract: isContract,
        // Part of the key: a gallery-derived description is a different answer
        // for the same intake photo, so it must not be served from a cache
        // entry built without one.
        gallery: gallery?.url ?? null,
      },
      async () => {
        if (treatAsSet) {
          return { kind: "two-piece" as const, set: await extractTwoPieceFields(primaryImageUrl) };
        }
        if (isContract) {
          const [front, back] = await Promise.all([
            extractCatalogGarmentFields(selectedImageUrls[0], "analyze-front"),
            extractCatalogGarmentFields(selectedImageUrls[1], "analyze-back"),
          ]);
          return { kind: "contract" as const, front, back };
        }
        if (gallery) {
          return {
            kind: "single" as const,
            single: await extractHeroGarmentFields(gallery.url, gallery.frames),
          };
        }
        return {
          kind: "single" as const,
          single: await extractCatalogGarmentFields(primaryImageUrl),
        };
      }
    );

    // --- category ------------------------------------------------------------
    // Inferred from the GARMENT line only, never the assembled prompt: the
    // template's own layout clause names "tops:", "pants:" and "dresses and
    // skirts", so matching against the full prompt would classify everything.
    const visionCategory: GarmentCategory =
      extracted.kind === "two-piece"
        ? "set"
        : inferCategory(
            extracted.kind === "contract" ? extracted.front.garment : extracted.single.garment
          );

    // The ERP outranks vision wherever it has an answer. BOTTOM is the one
    // category it under-specifies — it covers both skirts and trousers — so
    // vision breaks that tie and nothing else.
    const category: GarmentCategory =
      erpMapped === "ambiguous-bottom"
        ? visionCategory === "skirt" || visionCategory === "pants"
          ? visionCategory
          : "pants"
        : erpMapped ?? visionCategory;
    const categorySource = !erpMapped
      ? "vision"
      : erpMapped === "ambiguous-bottom"
      ? `${reconciled.source}(${erpRaw})+vision`
      : `${reconciled.source}(${erpRaw})`;

    // --- assembly (pure, both canvas variants) -------------------------------
    const assemble = (mode: "preserve" | "backdrop") => {
      if (extracted.kind === "two-piece") return buildTwoPiecePrompt(extracted.set, mode);
      if (extracted.kind === "contract") {
        return buildFrontBackContractPrompt(extracted.front, extracted.back, mode);
      }
      return buildTwoImagePrompt(extracted.single.garment, extracted.single.features, mode);
    };
    const promptByMode = { preserve: assemble("preserve"), backdrop: assemble("backdrop") };

    const frontCanvas = resolveCanvas(category, "front");
    const backCanvas = resolveCanvas(category, "back");

    // --- routing, as data rather than a log line ----------------------------
    // Every decision below was already being computed and thrown away into
    // console.log. The rail can only show its reasoning if the reasoning
    // leaves this function, so it ships as a structured object rather than a
    // source string the client would have to parse back apart.
    const styleCode = decodeStyleCode(styleNumber);
    const routing = {
      styleCode: styleCode
        ? { prefix: styleCode.prefix, category: styleCode.category, authority: styleCode.authority }
        : null,
      erp: erpRaw ? { raw: erpRaw, mapped: mapErpCategory(erpRaw) } : null,
      vision: { category: visionCategory },
      /** Which input actually settled `category`. */
      decidedBy: reconciled.source,
      /** True when the winning answer contradicted one that was available. */
      overrode:
        Boolean(erpRaw) &&
        styleCode?.authority === "override" &&
        mapErpCategory(erpRaw) !== styleCode.category
          ? { field: "erp" as const, value: erpRaw }
          : null,
      describedFrom: gallery
        ? { kind: "gallery" as const, frames: gallery.frames }
        : { kind: "intake-photo" as const },
      /** Where the style number came from, so the UI can say so. */
      styleNumber: styleNumber ? { value: styleNumber, trust: styleNumberTrust ?? "asserted" } : null,
      /** Set when an inferred code was not allowed to overrule the ERP. */
      demoted: reconciled.demoted ?? null,
    };

    console.log(
      `[analyze] category=${category} (${categorySource}; vision said ${visionCategory}) ` +
        `garmentSource=${gallery ? `erp-gallery:${gallery.frames}frames` : "intake-photo"} ` +
        `front=${frontCanvas.path} back=${backCanvas.path} ` +
        `fallback(front=${frontCanvas.isFallback}, back=${backCanvas.isFallback})`
    );

    return NextResponse.json({
      ok: true,
      // Default prompt matches the front canvas, which is what a single-front
      // run uses. Callers needing the other view read promptByMode directly.
      prompt: promptByMode[frontCanvas.mode],
      promptByMode,
      category,
      categorySource,
      visionCategory,
      garmentSource: gallery ? `erp-gallery:${gallery.frames}` : "intake-photo",
      routing,
      canvas: { front: frontCanvas, back: backCanvas },
      // Unused by the current UI, kept so the response shape stays honest about
      // what the legacy field meant.
      backgroundColor: backgroundColor ?? null,
    });
  } catch (err: any) {
    console.error("[analyze] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
