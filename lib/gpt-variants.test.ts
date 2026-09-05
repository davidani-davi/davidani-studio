import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { GPT_NATIVE_SIZE, bodyRegionFor, garmentMaskFromDiff, gptVariantOf, leanBrief, maskCoverage } from "./gpt-variants";

describe("gptVariantOf", () => {
  it("accepts the three variants and falls back to auto", () => {
    expect(gptVariantOf("native4k")).toBe("native4k");
    expect(gptVariantOf("lean")).toBe("lean");
    expect(gptVariantOf("masked")).toBe("masked");
    expect(gptVariantOf("nano")).toBe("auto");
    expect(gptVariantOf(undefined)).toBe("auto");
  });
});

describe("GPT_NATIVE_SIZE", () => {
  it("is 2:3, multiples of 16, under the 8.3 MP cap", () => {
    expect(GPT_NATIVE_SIZE.width % 16).toBe(0);
    expect(GPT_NATIVE_SIZE.height % 16).toBe(0);
    expect(GPT_NATIVE_SIZE.height / GPT_NATIVE_SIZE.width).toBeCloseTo(1.5, 5);
    expect(GPT_NATIVE_SIZE.width * GPT_NATIVE_SIZE.height).toBeLessThan(8_294_400);
  });
});

describe("leanBrief", () => {
  it("names the photos, the region, the garment, what to keep and the view", () => {
    const b = leanBrief({ garment: "striped button-front cardigan", features: "patch pockets", category: "top", view: "front" });
    expect(b).toMatch(/Photo 1 is a real studio photograph/);
    expect(b).toMatch(/upper body/);
    expect(b).toMatch(/striped button-front cardigan\./);
    expect(b).toMatch(/patch pockets/);
    expect(b).toMatch(/her face, hair, skin/);
    expect(b).toMatch(/front view/);
    expect(b.split(/\s+/).length).toBeLessThan(200);
  });
  it("says which photo is the back when there is one, and carries the note", () => {
    const b = leanBrief({ garment: "cardigan", category: "outerwear", view: "back", hasBackPhoto: true, note: "sleeves are longer" });
    expect(b).toMatch(/photo 3 is its back/);
    expect(b).toMatch(/back view/);
    expect(b).toMatch(/Operator correction .*sleeves are longer/);
  });
  it("maps categories to the region it may change", () => {
    expect(bodyRegionFor("pants")).toMatch(/lower body/);
    expect(bodyRegionFor("dress")).toMatch(/whole outfit/);
    expect(bodyRegionFor("")).toMatch(/the garment she wears/);
  });
});

describe("garmentMaskFromDiff", () => {
  it("marks where the try-on changed the plate, grown, at the asked size", async () => {
    const w = 120, h = 180;
    const plate = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 240, g: 230, b: 220 } } }).png().toBuffer();
    // the "try-on" paints a block in the middle third
    const block = await sharp({ create: { width: w, height: 60, channels: 3, background: { r: 200, g: 30, b: 60 } } }).png().toBuffer();
    const tryon = await sharp(plate).composite([{ input: block, top: 60, left: 0 }]).png().toBuffer();
    const mask = await garmentMaskFromDiff(plate, tryon, { size: { width: 240, height: 360 }, growPx: 6, featherPx: 1 });
    const meta = await sharp(mask).metadata();
    expect(meta.width).toBe(240);
    expect(meta.height).toBe(360);
    const cover = await maskCoverage(mask);
    expect(cover).toBeGreaterThan(0.3);   // the block is a third of the frame, grown
    expect(cover).toBeLessThan(0.5);
    const { data } = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true });
    expect(data[10 * 240 + 120]).toBeLessThan(40);   // top band kept (black)
    expect(data[180 * 240 + 120]).toBeGreaterThan(215); // middle repainted (white)
  });
});
