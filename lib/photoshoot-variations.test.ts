import { describe, expect, it } from "vitest";
import { getPhotoshootVariation, PHOTOSHOOT_VARIATIONS } from "./photoshoot-variations";

describe("photoshoot shot variations", () => {
  it("rotates through distinct directions before repeating", () => {
    const firstCycle = PHOTOSHOOT_VARIATIONS.map((_, index) => getPhotoshootVariation(index).label);
    expect(new Set(firstCycle).size).toBe(PHOTOSHOOT_VARIATIONS.length);
    expect(getPhotoshootVariation(PHOTOSHOOT_VARIATIONS.length)).toEqual(getPhotoshootVariation(0));
  });

  it("safely normalizes invalid and negative indexes", () => {
    expect(getPhotoshootVariation(-4)).toEqual(PHOTOSHOOT_VARIATIONS[0]);
    expect(getPhotoshootVariation(Number.NaN)).toEqual(PHOTOSHOOT_VARIATIONS[0]);
  });
});
