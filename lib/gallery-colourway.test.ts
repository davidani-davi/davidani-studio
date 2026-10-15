import { describe, expect, it } from "vitest";
import {
  buildTwoImagePrompt,
  catalogAnalysisPrompt,
  colourLockClause,
  galleryIdentityPrompt,
  parseGalleryIdentity,
} from "./fal";

// A style's ERP gallery holds every colourway. It may say WHICH garment is the
// product (DDT9040's halter, not the cardigan over it), never what colour or
// print it is: that comes from the uploaded photo. See identifyGalleryProduct.

describe("gallery identification asks for no colour", () => {
  it("warns that the frames mix colourways", () => {
    expect(galleryIdentityPrompt(9)).toMatch(/several colourways/);
    expect(galleryIdentityPrompt(9)).toMatch(/no colour or print words/);
  });

  it("reads the PRODUCT line as one short phrase", () => {
    expect(parseGalleryIdentity("PRODUCT: wide-leg pull-on pants.")).toBe("wide-leg pull-on pants");
    expect(parseGalleryIdentity('PRODUCT: "crochet fringe halter top"\nnoise')).toBe(
      "crochet fringe halter top"
    );
    expect(parseGalleryIdentity("GARMENT: navy pants")).toBeNull();
    expect(parseGalleryIdentity(`PRODUCT: ${"x".repeat(300)}`)!.length).toBe(120);
  });
});

describe("the upload is described, with the gallery's name as a hint", () => {
  it("keeps the plain prompt when there is no hint", () => {
    expect(catalogAnalysisPrompt(null)).toMatch(/^Analyze the garment in this photograph/);
    expect(catalogAnalysisPrompt(null)).not.toMatch(/gallery/);
  });

  it("names the product and takes colour and print from this photo alone", () => {
    const p = catalogAnalysisPrompt("tiered ruffle mini skirt");
    expect(p).toContain("The product in this photograph is the tiered ruffle mini skirt");
    expect(p).toMatch(/colour, print, pattern and\s+wash come from this photograph alone/);
    expect(p).toMatch(/ignore it/);
  });
});

describe("colour lock", () => {
  it("is the line that fixed the 2026-10-15 re-runs", () => {
    expect(colourLockClause("ivory ribbed knit top")).toBe(
      "The product is the ivory ribbed knit top in the uploaded photo: render only that garment, in exactly that colour and print."
    );
  });

  it("is appended only when asked, and leaves the analyzer's colour words intact", () => {
    const garment = "lavender purple floral print tiered mini skirt";
    const plain = buildTwoImagePrompt(garment, "a tiered hem", "backdrop");
    const locked = buildTwoImagePrompt(garment, "a tiered hem", "backdrop", { colourLock: true });
    expect(plain).not.toContain("in the uploaded photo");
    expect(locked.startsWith(plain)).toBe(true);
    expect(locked.endsWith("in exactly that colour and print.")).toBe(true);
    expect(locked).toContain(`different garment: a ${garment}.`);
  });
});
