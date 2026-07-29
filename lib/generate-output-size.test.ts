import { describe, expect, it } from "vitest";
import {
  outputSizeForAspectRatio,
  resolveGenerateOutputSize,
} from "./generate-output-size";

const STUDIO_SIZE = { width: 2160, height: 3240 };

describe("generate output sizing", () => {
  it("enforces a raw caller's selected 16:9 ratio at the requested resolution", () => {
    expect(
      resolveGenerateOutputSize(true, false, STUDIO_SIZE, "16:9", "2K")
    ).toEqual({ width: 2048, height: 1152 });
  });

  it("preserves native output when resize is deferred", () => {
    expect(resolveGenerateOutputSize(false, true, STUDIO_SIZE)).toBeNull();
  });

  it("keeps Image Studio's locked export size for normal generations", () => {
    expect(resolveGenerateOutputSize(false, false, STUDIO_SIZE)).toEqual(STUDIO_SIZE);
  });

  it("supports portrait ratios and leaves Auto at the provider's native size", () => {
    expect(outputSizeForAspectRatio("2:3", "2K")).toEqual({
      width: 1365,
      height: 2048,
    });
    expect(outputSizeForAspectRatio("auto", "2K")).toBeNull();
  });
});
