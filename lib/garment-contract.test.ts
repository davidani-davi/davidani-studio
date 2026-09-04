import { describe, expect, it } from "vitest";
import { buildGarmentContract, closureFor, normalizeType, typeIn } from "./garment-contract";

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
