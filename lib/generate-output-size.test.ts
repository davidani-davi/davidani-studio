import { describe, expect, it } from "vitest";
import { resolveGenerateOutputSize } from "./generate-output-size";

const STUDIO_SIZE = { width: 2160, height: 3240 };

describe("generate output sizing", () => {
  it("preserves a raw caller's model-selected aspect ratio", () => {
    expect(resolveGenerateOutputSize(true, false, STUDIO_SIZE)).toBeNull();
  });

  it("preserves native output when resize is deferred", () => {
    expect(resolveGenerateOutputSize(false, true, STUDIO_SIZE)).toBeNull();
  });

  it("keeps Image Studio's locked export size for normal generations", () => {
    expect(resolveGenerateOutputSize(false, false, STUDIO_SIZE)).toEqual(STUDIO_SIZE);
  });
});
