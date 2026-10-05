import { describe, expect, it } from "vitest";
import { buildRecolourPrompt, cleanColour } from "./recolour-prompt";

describe("recolour prompt", () => {
  it("names the colour and keeps everything but the colour", () => {
    const p = buildRecolourPrompt("Washed Black");
    expect(p).toContain("to Washed Black");
    expect(p).toMatch(/face, hair, skin/);
    expect(p).toMatch(/exact shape, length/);
  });
  it("pair mode keeps the second colour and the layout", () => {
    expect(buildRecolourPrompt("Pink", "pair")).toMatch(/main colour to Pink\. Keep its second colour/);
  });
  it("cleans the colour name", () => {
    expect(cleanColour("  Navy/Butter  ")).toBe("Navy/Butter");
    expect(cleanColour("Pink<script>")).toBe("Pinkscript");
    expect(() => cleanColour("")).toThrow();
    expect(() => cleanColour("x".repeat(41))).toThrow();
  });
});
