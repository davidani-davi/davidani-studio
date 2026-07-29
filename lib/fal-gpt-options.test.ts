import { describe, expect, it } from "vitest";
import { buildGptImageOptions } from "./fal";

describe("GPT Image generation options", () => {
  it("passes an explicit 16:9 aspect ratio to the provider", () => {
    expect(
      buildGptImageOptions({
        numImages: 1,
        aspectRatio: "16:9",
        resolution: "2K",
        format: "png",
        openAiApiKey: "test-key",
      })
    ).toEqual({
      num_images: 1,
      aspect_ratio: "16:9",
      image_size: "1536x1024",
      quality: "medium",
      output_format: "png",
      openai_api_key: "test-key",
    });
  });

  it("lets the provider choose the ratio only when Auto is selected", () => {
    const options = buildGptImageOptions({ aspectRatio: "auto" });
    expect(options).not.toHaveProperty("aspect_ratio");
    expect(options).not.toHaveProperty("image_size");
  });
});
