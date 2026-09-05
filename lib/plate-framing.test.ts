import { describe, expect, it } from "vitest";
import {
  categoryFromType, framingFor, isDerivedPlate, plateForFraming, shotCategory, shotPlan, shotViews,
} from "./plate-framing";

describe("shotCategory", () => {
  it("reads the Faire taxonomy name exactly, for every name the extension can send", () => {
    const cases: Array<[string, string]> = [
      ["Pants - Women's", "pants"], ["Shorts - Women's", "pants"], ["Skirt - Women's", "skirt"],
      ["Top & Pant Set (NOT Loungewear) - Women's", "set"], ["Top & Skirt Set - Women's", "set"],
      ["Dress - Women's", "dress"], ["Jumpsuit - Women's", "dress"], ["Romper - Women's", "dress"],
      ["Jacket - Women's", "outerwear"], ["Shirt Jacket/Shacket - Women's", "outerwear"],
      ["Kimono - Women's", "outerwear"], ["Outerwear Vest - Women's", "outerwear"], ["Coat - Women's", "outerwear"],
      ["Knit Top - Women's", "top"], ["Button Down Shirt - Women's", "top"], ["T-Shirt - Women's", "top"],
      ["Sweater Vest - Women's", "top"], ["Hoodie - Women's", "top"], ["Cardigan - Women's", "top"],
    ];
    for (const [type, want] of cases) expect(categoryFromType(type), type).toBe(want);
  });

  it("an explicit category wins, the title is the fallback, a set beats its pants", () => {
    expect(shotCategory({ category: "skirt", type: "Pants - Women's" })).toBe("skirt");
    expect(shotCategory({ category: "nonsense", type: "Pants - Women's" })).toBe("pants");
    expect(shotCategory({ title: "Boxy Top & Barrel Pants Set" })).toBe("set");
    expect(shotCategory({ title: "Floral Print Wide-Leg Cargo Parachute Pants" })).toBe("pants");
    expect(shotCategory({ title: "Embroidered Western Denim Trucker Jacket" })).toBe("outerwear");
    expect(shotCategory({})).toBe("unknown");
    expect(shotCategory(null)).toBe("unknown");
  });
});

describe("shotPlan", () => {
  it("bottoms: front and side from the waist down plus one full shot, no back", () => {
    expect(shotViews("pants")).toEqual(["front", "side", "full"]);
    expect(shotViews("skirt")).toEqual(["front", "side", "full"]);
    expect(framingFor("pants", "front")).toBe("low");
    expect(framingFor("skirt", "side")).toBe("low");
    expect(framingFor("pants", "full")).toBe("full");
  });
  it("tops and outerwear: head-to-thigh crops, the full shot stays full-length", () => {
    expect(shotViews("top")).toEqual(["front", "side", "back", "full"]);
    expect(shotPlan("outerwear").map((s) => s.framing)).toEqual(["crop", "crop", "crop", "full"]);
  });
  it("dresses, sets and the unknown are full-length everywhere", () => {
    for (const c of ["dress", "set", "unknown"] as const) {
      expect(shotViews(c)).toEqual(["front", "side", "back", "full"]);
      expect(shotPlan(c).every((s) => s.framing === "full")).toBe(true);
    }
  });
});

describe("plateForFraming", () => {
  const cat = [
    { id: "studio 07", poses: [{ id: "studio 07" }] },
    { id: "crop 07", poses: [{ id: "crop 07" }] },
    { id: "low 07", poses: [{ id: "low 07" }] },
    { id: "studio 08", poses: [{ id: "studio 08" }] },
  ];
  it("swaps the house plate for the sibling of the framing", () => {
    expect(plateForFraming("studio 07", "studio 07", "crop", cat)).toEqual({ humanModelId: "crop 07", poseId: "crop 07", derived: true });
    expect(plateForFraming("studio 07", "studio 07", "low", cat).humanModelId).toBe("low 07");
  });
  it("leaves full framing, user plates and uninstalled families alone", () => {
    expect(plateForFraming("studio 07", "studio 07", "full", cat).derived).toBe(false);
    expect(plateForFraming("studio 08", "studio 08", "crop", cat)).toEqual({ humanModelId: "studio 08", poseId: "studio 08", derived: false });
    expect(plateForFraming("my model", "look 1", "low", cat).humanModelId).toBe("my model");
  });
  it("knows a derived family when it sees one", () => {
    expect(isDerivedPlate("crop 07")).toBe(true);
    expect(isDerivedPlate("low 12")).toBe(true);
    expect(isDerivedPlate("studio 07")).toBe(false);
  });
});
