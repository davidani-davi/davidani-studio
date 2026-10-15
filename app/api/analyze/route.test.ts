// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The gallery spans every colourway of a style. On 2026-10-15 it also wrote
// the garment description, and 10 of 21 flat lays came out in another
// colourway: DP52083's pink donut-print pants were described (and rendered)
// from the gallery's other prints. These pin the split: the gallery names the
// product, the upload is what gets described, and the prompt locks colour and
// print to the upload.

const INTAKE = "https://fal.media/uploads/DP52083_3_7_.jpg";
const SHEET = "https://fal.media/uploads/gallery-DP52083.jpg";

const state = vi.hoisted(() => ({
  gallery: null as { url: string; frames: number } | null,
  product: null as string | null,
}));

vi.mock("@/lib/vision-cache", () => ({
  cachedVision: (_kind: string, _key: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/erp-category", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/erp-category")>()),
  fetchErpCategory: vi.fn(async () => "PANTS"),
}));
vi.mock("@/lib/erp-gallery", () => ({
  buildGalleryContactSheet: vi.fn(async () => state.gallery),
}));
vi.mock("@/lib/fal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fal")>()),
  identifyGalleryProduct: vi.fn(async () => state.product),
  extractCatalogGarmentFields: vi.fn(async (url: string) => {
    // The upload's own colour and print. A description of the gallery would
    // come back with another colourway, so only the intake URL answers.
    if (url !== INTAKE) throw new Error(`described the wrong image: ${url}`);
    return {
      garment: "pink donut print wide-leg pants",
      features: "a wide straight leg, an elastic waistband, an allover donut print",
      view: "front" as const,
    };
  }),
  extractTwoPieceFields: vi.fn(),
}));

import { POST } from "./route";
import { extractCatalogGarmentFields, identifyGalleryProduct } from "@/lib/fal";

function analyze(body: Record<string, unknown>) {
  return POST(
    new Request("https://studio.test/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.gallery = { url: SHEET, frames: 9 };
  state.product = "wide-leg pull-on pants";
});

describe("a style number's gallery names the product but never its colour", () => {
  it("describes the uploaded photo, with the gallery's product name as a hint", async () => {
    const data = await (await analyze({ imageUrl: INTAKE, styleNumber: "DP52083" })).json();
    expect(data.ok).toBe(true);

    expect(identifyGalleryProduct).toHaveBeenCalledWith(SHEET, 9);
    expect(extractCatalogGarmentFields).toHaveBeenCalledTimes(1);
    expect(extractCatalogGarmentFields).toHaveBeenCalledWith(
      INTAKE,
      "analyze",
      "wide-leg pull-on pants"
    );
    expect(data.routing.describedFrom).toEqual({
      kind: "gallery",
      frames: 9,
      product: "wide-leg pull-on pants",
    });
    expect(data.garmentSource).toBe("intake-photo+erp-gallery:9");
    // Read from the upload, so it is known on the gallery path too.
    expect(data.detected.view).toBe("front");
  });

  it("locks colour and print to the upload in both canvas variants", async () => {
    const data = await (await analyze({ imageUrl: INTAKE, styleNumber: "DP52083" })).json();
    const lock =
      "The product is the pink donut print wide-leg pants in the uploaded photo: " +
      "render only that garment, in exactly that colour and print.";
    expect(data.promptByMode.preserve).toContain(lock);
    expect(data.promptByMode.backdrop).toContain(lock);
    expect(data.prompt).toContain("pink donut print");
  });

  it("falls back to the upload alone when the gallery names nothing", async () => {
    state.product = null;
    const data = await (await analyze({ imageUrl: INTAKE, styleNumber: "DP52083" })).json();
    expect(extractCatalogGarmentFields).toHaveBeenCalledWith(INTAKE, "analyze", null);
    expect(data.routing.describedFrom).toEqual({ kind: "intake-photo" });
    expect(data.garmentSource).toBe("intake-photo");
    expect(data.prompt).toContain("in exactly that colour and print");
  });

  it("never builds a gallery without a style number", async () => {
    const data = await (await analyze({ imageUrl: INTAKE })).json();
    expect(identifyGalleryProduct).not.toHaveBeenCalled();
    expect(extractCatalogGarmentFields).toHaveBeenCalledWith(INTAKE, "analyze", null);
    expect(data.routing.describedFrom).toEqual({ kind: "intake-photo" });
  });
});
