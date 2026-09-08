import { describe, expect, it } from "vitest";
import { mergePlateWear, outfitFor, wardrobeGroups, wardrobeHalf, type PlateWear } from "./plate-wear";

describe("wardrobeHalf", () => {
  it("picks the opposite half from the style code", () => {
    expect(wardrobeHalf("DWT62170")).toBe("below");
    expect(wardrobeHalf("DT60014")).toBe("below");
    expect(wardrobeHalf("DJ67204")).toBe("below");
    expect(wardrobeHalf("DP62206")).toBe("above");
    expect(wardrobeHalf("DS42505S")).toBe("above");
    expect(wardrobeHalf("PP62206")).toBe("above");
  });
  it("gives sets, dresses, rompers and blanks no filter", () => {
    expect(wardrobeHalf("DTP70045A")).toBeNull();
    expect(wardrobeHalf("DD61001")).toBeNull();
    expect(wardrobeHalf("DR60001")).toBeNull();
    expect(wardrobeHalf("")).toBeNull();
  });
});

describe("wardrobeGroups", () => {
  const rows = [
    { name: "studio 06", wears: "pants", low_ok: true },
    { name: "studio 32", wears: "pants", low_ok: true, face: "vision", expression: "neutral", slug: "dwt62170-20-neutral",
      pose: "arm raised", outfit_below: "polka-dot barrel jeans", outfit_above: "camel graphic sweater" },
    { name: "studio 34", wears: "pants", low_ok: true, face: "vision", expression: "teeth", slug: "dwt62170-20-teeth",
      pose: "arm raised", outfit_below: "polka-dot barrel jeans", outfit_above: "camel graphic sweater" },
    { name: "studio 33", wears: "pants", low_ok: true, face: "vision", expression: "smile", slug: "dwt62170-20-smile",
      pose: "arm raised", outfit_below: "polka-dot barrel jeans", outfit_above: "camel graphic sweater" },
    { name: "studio 28", wears: "pants", low_ok: true, face: "vision", expression: "neutral", slug: "dwt62133-24-neutral",
      pose: "arms at sides", outfit_below: "patchwork wide-leg pants", outfit_above: "red cardigan" },
  ];
  const models = mergePlateWear(
    ["studio 06", "studio 28", "studio 32", "studio 33", "studio 34", "crop 32"].map(
      (id): { id: string } & PlateWear => ({ id })
    ),
    rows
  );
  it("folds expressions into one group per pose and outfit, neutral first", () => {
    const groups = wardrobeGroups(models);
    expect(groups.map((g) => g.poseKey)).toEqual(["dwt62133-24", "dwt62170-20"]);
    const sweater = groups.find((g) => g.poseKey === "dwt62170-20")!;
    expect(sweater.plates.map((p) => p.expression)).toEqual(["neutral", "smile", "teeth"]);
    expect(sweater.pose).toBe("arm raised");
  });
  it("files a group under the outfit of the half being picked", () => {
    const g = wardrobeGroups(models)[1];
    expect(outfitFor(g, "below")).toBe("polka-dot barrel jeans");
    expect(outfitFor(g, "above")).toBe("camel graphic sweater");
  });
  it("leaves real-model plates and crop siblings out", () => {
    const ids = wardrobeGroups(models).flatMap((g) => g.plates.map((p) => p.id));
    expect(ids).not.toContain("studio 06");
    expect(ids).not.toContain("crop 32");
  });
});
