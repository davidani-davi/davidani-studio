import { describe, expect, it } from "vitest";
import { buildGptImageOptions, parseFaceBox, sanitizeRejectedPortraitPrompt } from "./fal";

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
      quality: "medium",
      output_format: "png",
      openai_api_key: "test-key",
    });
  });

  it("lets the provider choose the ratio only when Auto is selected", () => {
    const options = buildGptImageOptions({ aspectRatio: "auto" });
    expect(options).not.toHaveProperty("aspect_ratio");
  });
});

describe("portrait face localization parsing", () => {
  it("reads normalized face coordinates from a vision response", () => {
    expect(parseFaceBox('```json\n{"x":0.3,"y":0.1,"width":0.25,"height":0.3}\n```')).toEqual({
      x: 0.3,
      y: 0.1,
      width: 0.25,
      height: 0.3,
    });
  });

  it("rejects missing and invalid boxes", () => {
    expect(parseFaceBox("null")).toBeNull();
    expect(parseFaceBox('{"x":0.2,"y":0.1,"width":0,"height":0.2}')).toBeNull();
  });
});

describe("GPT rejected portrait prompt retry", () => {
  it("removes identity-transfer trigger language but keeps photographic instructions", () => {
    const result = sanitizeRejectedPortraitPrompt(
      "Rebuild the face in Image 1 as a fictional adult model. Preserve the pose, wardrobe, and soft lighting. Replace all facial anatomy that could identify the source. Avoid resemblance to a celebrity or existing model. Add freckles and gray-hazel eyes."
    );
    expect(result).toContain("fictional adult fashion portrait");
    expect(result).toContain("composition, pose, framing");
    expect(result).toContain("Add freckles and gray-hazel eyes");
    expect(result).not.toMatch(/identity|source|recognizable|resembl|celebrity|existing model|copy|transform|replace|retain/i);
  });

  it("does not alter unrelated product prompts", () => {
    const prompt = "Place the exact blue jacket on a mannequin in a clean studio.";
    expect(sanitizeRejectedPortraitPrompt(prompt)).toBe(prompt);
  });
});
