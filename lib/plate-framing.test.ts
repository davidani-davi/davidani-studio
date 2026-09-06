import { describe, expect, it } from "vitest";
import {
  categoryFromType, framingFor, hemFor, isDerivedPlate, plateForFraming, shotCategory, shotPlan, shotViews, showsBottoms,
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
  it("a long top or outerwear piece is full-length in every view, like a dress; bottoms and short layers as before", () => {
    expect(shotPlan("outerwear", "long").map((s) => s.framing)).toEqual(["full", "full", "full", "full"]);
    expect(framingFor("top", "side", "long")).toBe("full");
    expect(framingFor("outerwear", "side", "short")).toBe("crop");
    expect(framingFor("outerwear", "side")).toBe("crop");
    expect(framingFor("pants", "front", "long")).toBe("low");
    expect(shotViews("outerwear")).toEqual(["front", "side", "back", "full"]);
    expect(showsBottoms("outerwear", "long")).toBe(true);
    expect(showsBottoms("top", "long")).toBe(true);
    expect(showsBottoms("outerwear", "")).toBe(false);
    expect(showsBottoms("dress", "long")).toBe(false);
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

describe("hemFor — where the garment ends, from our own copy", () => {
  it("a coat of any kind, a longline or duster piece, a knee, midi or maxi length is long", () => {
    expect(hemFor({ type: "Coat - Women's", title: "Plaid Double Breasted Longline Trench Coat" })).toBe("long");
    expect(hemFor({ type: "Coat - Women's", title: "Wool Blend Coat" })).toBe("long");
    expect(hemFor({ title: "Belted Trench" })).toBe("long");
    expect(hemFor({ title: "Classic Peacoat" })).toBe("long");
    expect(hemFor({ type: "Cardigan - Women's", title: "Ribbed Duster Cardigan" })).toBe("long");
    expect(hemFor({ title: "Knee-Length Quilted Jacket" })).toBe("long");
    expect(hemFor({ title: "Plaid Midi Shirt Dress" })).toBe("long");
  });
  it("cropped wins over everything; a jacket, a long sleeve top and a waistcoat are not long", () => {
    expect(hemFor({ type: "Coat - Women's", title: "Cropped Plaid Coat" })).toBe("short");
    expect(hemFor({ type: "Shirt Jacket/Shacket - Women's", title: "Plaid Shacket" })).toBe("");
    expect(hemFor({ title: "Long Sleeve Ribbed Top" })).toBe("");
    expect(hemFor({ title: "Tailored Waistcoat" })).toBe("");
    expect(hemFor({})).toBe("");
    expect(hemFor(null)).toBe("");
  });
  it("an explicit hem from the planner wins", () => {
    expect(hemFor({ hem: "short", title: "Longline Coat" })).toBe("short");
    expect(hemFor({ hem: "long", title: "Boxy Tee" })).toBe("long");
    expect(hemFor({ hem: "nonsense", title: "Boxy Tee" })).toBe("");
  });
});
