import { describe, expect, it } from "vitest";
import {
  inferAspectRatioFromPrompt,
  outputSizeForAspectRatio,
  resolveRequestedAspectRatio,
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
      width: 1364,
      height: 2046,
    });
    expect(outputSizeForAspectRatio("auto", "2K")).toBeNull();
  });

  it("detects an explicit custom ratio when the selector is Auto", () => {
    const prompt =
      "Use Image 1 and Image 2. Compose natively as an ultra-wide horizontal 19:6 photograph.";
    expect(inferAspectRatioFromPrompt(prompt)).toBe("19:6");
    expect(resolveRequestedAspectRatio("auto", prompt)).toBe("19:6");
    expect(outputSizeForAspectRatio("19:6", "2K")).toEqual({
      width: 2033,
      height: 642,
    });
  });

  it("lets an explicit selector override ratio text in the prompt", () => {
    expect(resolveRequestedAspectRatio("16:9", "Make this 19:6.")).toBe("16:9");
  });

  it("rejects malformed and extreme prompt ratios", () => {
    expect(inferAspectRatioFromPrompt("Use 0:9 framing")).toBeNull();
    expect(inferAspectRatioFromPrompt("Use 100:1 framing")).toBeNull();
  });
});
