import { describe, expect, it } from "vitest";
import { buildGarmentContract, closureFor, fitFor, lengthFor, normalizeType, typeIn } from "./garment-contract";

/**
 * The case that motivated the module, first and by name: DWJ62218's open
 * button-front cardigan came back as a closed pullover with a keyhole, because
 * the vision read called the placket a "keyhole cutout detail" and 13 words
 * were the only thing the generator knew about the product.
 */
const DWJ62218_VISION = {
  garment: "cropped-length striped blue and navy cardigan with button front and keyhole cutout detail",
  features:
    "a cropped boxy silhouette landing at the waistband, horizontal two-tone stripes across the body and sleeves, two patch pockets at the front hem, keyhole cutout at the center neckline, ribbed crew neckline, long drop-shoulder sleeves",
};
const DWJ62218_KNOWN = {
  styleCode: "DWJ62218",
  type: "Cardigan - Women's",
  title: "Two-Tone Striped Button-Front Cardigan",
  fabric: "45% Polyester 55% Acrylic",
  color: "NAVY/BLUE",
};

describe("buildGarmentContract — the DWJ62218 failure", () => {
  const c = buildGarmentContract(DWJ62218_KNOWN, DWJ62218_VISION);

  it("says the garment opens, in the phrase and in the features", () => {
    expect(c.garment).toMatch(/button-front cardigan/i);
    expect(c.features).toMatch(/OPENS down the full center front/);
    expect(c.features).toMatch(/never rendered as a closed pullover/);
  });

  it("strikes the keyhole that was really the placket", () => {
    expect(`${c.garment} ${c.features}`).not.toMatch(/keyhole/i);
    expect(c.corrections.some((x) => /keyhole/.test(x))).toBe(true);
  });

  it("keeps what vision is actually good at", () => {
    expect(c.features).toMatch(/patch pockets/);
    expect(c.features).toMatch(/two-tone stripes/);
    expect(c.features).toMatch(/drop-shoulder/);
  });

  it("names the fabric and colourway the ERP holds", () => {
    expect(c.features).toMatch(/fabric: 45% Polyester 55% Acrylic/);
    expect(c.features).toMatch(/colourway: navy and blue/);
  });
});

describe("buildGarmentContract — type", () => {
  it("overrules a vision phrase that names the wrong garment", () => {
    const c = buildGarmentContract(
      { type: "Cardigan - Women's" },
      { garment: "cropped striped navy pullover sweater", features: "" }
    );
    expect(c.garment).toMatch(/cardigan/);
    expect(c.garment).not.toMatch(/\bsweater\b/);
    expect(c.corrections[0]).toMatch(/"sweater" → "cardigan"/);
  });

  it("adds the type when vision named none", () => {
    const c = buildGarmentContract({ type: "Dress - Women's" }, { garment: "floral midi", features: "" });
    expect(c.garment).toBe("floral midi dress");
  });

  it("leaves an agreeing phrase alone", () => {
    const c = buildGarmentContract(
      { type: "Cardigan - Women's" },
      { garment: "cropped striped cardigan", features: "" }
    );
    expect(c.corrections.some((x) => x.startsWith("type:"))).toBe(false);
  });
});

describe("closure", () => {
  it("reads the closure out of our own listing title", () => {
    expect(closureFor({ title: "Two-Tone Striped Button-Front Cardigan" }, "cardigan")).toBe("button-front");
    expect(closureFor({ title: "Quilted Full-Zip Puffer Jacket" }, "jacket")).toBe("zip-front");
  });

  it("falls back to the type's own default", () => {
    expect(closureFor({ title: "Ribbed Knit Cardigan" }, "cardigan")).toBe("open-front");
    expect(closureFor({ title: "Ribbed Knit Sweater" }, "sweater")).toBe("");
  });

  it("respects copy that says the garment does NOT open", () => {
    const c = buildGarmentContract(
      { type: "Knit Sweater - Women's", title: "Cable Knit Pullover Sweater" },
      { garment: "cream cable knit sweater", features: "ribbed cuffs" }
    );
    expect(c.features).toMatch(/closed pullover front with no opening placket/);
    expect(c.features).not.toMatch(/OPENS down/);
  });
});

describe("helpers", () => {
  it("normalizeType strips the Faire taxonomy tail", () => {
    expect(normalizeType("Cardigan - Women's")).toBe("cardigan");
    expect(normalizeType("Top & Pant Set (NOT Loungewear) - Women's")).toBe("set");
    expect(normalizeType(undefined)).toBe("");
  });

  it("typeIn prefers the longer noun", () => {
    expect(typeIn("quilted sweater vest in cream")).toBe("sweater vest");
    expect(typeIn("striped t-shirt")).toBe("t-shirt");
    expect(typeIn("something unnameable")).toBe("");
  });

  it("passes vision through untouched when nothing is known", () => {
    const c = buildGarmentContract({}, { garment: "cream linen blouse", features: "puff sleeves" });
    expect(c.garment).toBe("cream linen blouse");
    expect(c.corrections).toEqual([]);
  });
});

/**
 * The second failure, by name: DJ67094's longline coat. Vision re-read the hem
 * for every view ("knee length", "hip length", "mid-calf"), the side render
 * came back a shacket and the front a tent. The title said "Longline" and the
 * description "relaxed" the whole time.
 */
describe("buildGarmentContract — the DJ67094 failure (length and fit)", () => {
  const DJ67094_KNOWN = {
    styleCode: "DJ67094",
    type: "Coat - Women's",
    title: "Plaid Double Breasted Longline Trench Coat",
    color: "MINT/RED",
    description:
      "Brushed woven plaid with notched lapels and a double breasted button front. The relaxed longline silhouette falls well below the knee and layers easily over knitwear and denim.",
  };
  const SIDE_VISION = {
    garment: "burgundy, cream, and charcoal plaid wool blend double-breasted button-front coat dress with notch collar, hip length",
    features: "notched lapels, epaulettes, flap pockets",
  };
  it("the title's length overrules the hem this view's vision read", () => {
    const c = buildGarmentContract(DJ67094_KNOWN, SIDE_VISION);
    expect(c.garment).not.toMatch(/hip length/i);
    expect(c.garment).toMatch(/longline coat/i);
    expect(c.garment).not.toMatch(/,\s*$/);
    expect(c.features).toContain("length: longline, the hem falls at mid-calf, well below the knee");
    expect(c.corrections).toContain('length: "longline" asserted (listing copy); vision\'s length struck');
  });
  it("the copy's fit is spelled out on the body, so a relaxed coat is not a tent", () => {
    const c = buildGarmentContract(DJ67094_KNOWN, SIDE_VISION);
    expect(c.features).toContain("fit: relaxed through the body, shoulder seams at her natural shoulder line, sleeves ending at the wrist bone");
    expect(c.corrections).toContain('fit: "relaxed" asserted (listing copy)');
  });
  it("a plain coat the planner calls long is at least knee-length; a cropped one is cropped", () => {
    expect(lengthFor({ type: "Coat - Women's", title: "Wool Blend Coat", hem: "long" })).toEqual({
      adj: "knee-length", hem: "the hem falls at or just below the knee",
    });
    expect(lengthFor({ type: "Coat - Women's", title: "Cropped Wool Coat", hem: "long" })?.adj).toBe("cropped");
    expect(lengthFor({ title: "Floral Maxi Dress" })?.adj).toBe("floor-length");
    expect(lengthFor({ title: "Ribbed Midi Skirt" })?.adj).toBe("midi-length");
    expect(lengthFor({ title: "Two-Tone Striped Button-Front Cardigan" })).toBeNull();
    expect(lengthFor({ title: "Long Sleeve Tee", description: "layers over a midi skirt" })).toBeNull();
  });
  it("close fits are read from the title only; roomy fits from the description too", () => {
    expect(fitFor({ title: "Boxy Tee", description: "pairs with slim jeans" })?.word).toBe("boxy");
    expect(fitFor({ title: "Ribbed Tee", description: "pairs with slim jeans" })).toBeNull();
    expect(fitFor({ title: "Slim Fit Turtleneck" })?.word).toBe("fitted");
    expect(fitFor({ title: "Plaid Shacket", description: "an oversized, relaxed layer" })?.word).toBe("oversized");
  });
  it("adds the length noun when vision named none, and leaves the DWJ62218 phrase alone", () => {
    const c = buildGarmentContract({ type: "Coat - Women's", title: "Longline Wool Coat" }, { garment: "plaid wool blend with lapels", features: "" });
    expect(c.garment).toMatch(/longline coat/i);
    const d = buildGarmentContract(DWJ62218_KNOWN, DWJ62218_VISION);
    expect(d.corrections.some((x) => x.startsWith("length:") || x.startsWith("fit:"))).toBe(false);
  });
});
