import { describe, expect, it } from "vitest";
import {
  outputSizeForAspectRatio,
  resolveGenerateOutputSize,
} from "./generate-output-size";
import { IMAGE_STUDIO_OUTPUT_SIZE } from "./output-sizes";

const STUDIO_SIZE = { width: 2160, height: 2700 };

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

describe("Image Studio ratio lock", () => {
  // These three must agree or the cover-resize in resizeGeneratedImages crops
  // the render. The canvas presets in public/product-shots/ are all 2160x2700,
  // the client sends aspectRatio "4:5", and the server locks the same box.
  it("locks Image Studio to the 4:5 canvas ratio", () => {
    const { width, height } = IMAGE_STUDIO_OUTPUT_SIZE;
    expect(width / height).toBeCloseTo(4 / 5, 5);
    expect({ width, height }).toEqual({ width: 2160, height: 2700 });
  });

  it("does not crop a 4:5 generation at the locked size", () => {
    const generated = outputSizeForAspectRatio("4:5", "4K");
    expect(generated).not.toBeNull();
    // 3 dp, not more: the generated box rounds to whole pixels (4096 * 4/5 =
    // 3276.8 -> 3277), so the ratios differ in the 5th decimal by construction.
    // Anything looser than ~0.001 would let a real ratio mismatch through.
    expect(generated!.width / generated!.height).toBeCloseTo(
      IMAGE_STUDIO_OUTPUT_SIZE.width / IMAGE_STUDIO_OUTPUT_SIZE.height,
      3
    );
  });

  it("still catches a genuine ratio mismatch", () => {
    const twoThirds = outputSizeForAspectRatio("2:3", "4K")!;
    expect(twoThirds.width / twoThirds.height).not.toBeCloseTo(
      IMAGE_STUDIO_OUTPUT_SIZE.width / IMAGE_STUDIO_OUTPUT_SIZE.height,
      3
    );
  });
});
