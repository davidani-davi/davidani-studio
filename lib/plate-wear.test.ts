import { describe, expect, it } from "vitest";
import { bottomPlates, isBottom, mergePlateWear, silhouetteOf, silhouettePlates } from "./plate-wear";

const PLATES = [
  { name: "studio 05", wears: "pants", low_ok: true },
  { name: "studio 08", wears: "skirt", low_ok: false },
  { name: "studio 09" }, // installed before the tag existed
];
const MODELS: any[] = [
  { id: "studio 05", poses: [] }, { id: "crop 05", poses: [] }, { id: "low 05", poses: [] },
  { id: "studio 08", poses: [] }, { id: "low 08", poses: [] },
  { id: "studio 09", poses: [] },
  { id: "user-abc", poses: [], userAdded: true, lowOk: true },
];

describe("mergePlateWear", () => {
  it("tags the house plate and its crop/low siblings from plates.json", () => {
    const by = Object.fromEntries(mergePlateWear(MODELS, PLATES).map((m: any) => [m.id, [m.wears, m.lowOk]]));
    expect(by["studio 05"]).toEqual(["pants", true]);
    expect(by["crop 05"]).toEqual(["pants", true]);
    expect(by["low 05"]).toEqual(["pants", true]);
    expect(by["studio 08"]).toEqual(["skirt", false]);
    expect(by["low 08"]).toEqual(["skirt", false]);
  });
  it("leaves an untagged plate and a user's plate as they were", () => {
    const got = mergePlateWear(MODELS, PLATES);
    expect(got.find((m) => m.id === "studio 09").wears).toBeUndefined();
    expect(got.find((m) => m.id === "user-abc").lowOk).toBe(true);
  });
  it("copes with no plates.json at all", () => {
    expect(mergePlateWear(MODELS, undefined)).toEqual(MODELS);
    expect(mergePlateWear(MODELS, [])).toEqual(MODELS);
  });
});

describe("bottomPlates / isBottom", () => {
  it("is the tagged house subset — never a user plate, never a derived family", () => {
    expect(bottomPlates(mergePlateWear(MODELS, PLATES)).map((m) => m.id)).toEqual(["studio 05"]);
    expect(bottomPlates([])).toEqual([]);
  });
  it("pants and skirts are bottoms; nothing else is", () => {
    expect(isBottom("pants")).toBe(true);
    expect(isBottom("skirt")).toBe(true);
    for (const c of ["top", "outerwear", "dress", "set", "unknown", undefined, null]) expect(isBottom(c)).toBe(false);
  });
});

describe("silhouette", () => {
  it("reads the leg silhouette a title names", () => {
    expect(silhouetteOf("Hand Painted Peacock Floral Barrel Leg Jeans")).toBe("barrel");
    expect(silhouetteOf("Seamed Panel Raw Hem Wide Leg Sweatpants")).toBe("wide");
    expect(silhouetteOf("Fawn Intarsia Dot Brushed Knit Sweater")).toBeUndefined();
    expect(silhouetteOf(null)).toBeUndefined();
  });
  it("carries plates.json silhouette onto the house plate and its crop/low siblings", () => {
    const plates = [...PLATES, { name: "studio 12", wears: "pants", low_ok: true, silhouette: "Barrel" }];
    const models: any[] = [...MODELS, { id: "studio 12", poses: [] }, { id: "low 12", poses: [] }];
    const tagged = mergePlateWear(models, plates);
    const by = Object.fromEntries(tagged.map((m: any) => [m.id, m.silhouette]));
    expect(by["studio 12"]).toBe("barrel");
    expect(by["low 12"]).toBe("barrel");
    expect(by["studio 05"]).toBeUndefined();
    expect(silhouettePlates(tagged, "barrel").map((m: any) => m.id)).toEqual(["studio 12"]);
    expect(silhouettePlates(tagged, undefined)).toEqual([]);
  });
});
