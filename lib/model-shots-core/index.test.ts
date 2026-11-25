import { describe, expect, it } from "vitest";
import core from "./index";

describe("model-shots-core wrapper", () => {
  it("exposes the extension's rules to TypeScript callers", () => {
    expect(core.VIEWS).toEqual(["front", "side", "back", "full"]);
    expect(core.categoryFor({ type: "Top & Pant Set" })).toBe("set");
    expect(core.shotFilename("DWJ62218", "front", "NAVY/BLUE")).toBe("DWJ62218 NAVY BLUE MODEL FRONT.jpg");
  });
});
