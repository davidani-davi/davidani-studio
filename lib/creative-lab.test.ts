import { describe, it, expect } from "vitest";
import { comparisonJobs, modelsFromResults, parseCreativeReference } from "./creative-lab";

describe("Creative Lab comparisons", () => {
  it("pairs each concept with every selected model, without duplicating models", () => {
    expect(comparisonJobs(["Sunlight", "Studio"], ["gpt-image", "nano-banana", "gpt-image"])).toEqual([
      { prompt: "Sunlight", modelId: "gpt-image", conceptIndex: 0 },
      { prompt: "Sunlight", modelId: "nano-banana", conceptIndex: 0 },
      { prompt: "Studio", modelId: "gpt-image", conceptIndex: 1 },
      { prompt: "Studio", modelId: "nano-banana", conceptIndex: 1 },
    ]);
  });
  it("does not schedule a request without both a prompt and a model", () => {
    expect(comparisonJobs([], ["gpt-image"])).toEqual([]);
    expect(comparisonJobs(["Sunlight"], [])).toEqual([]);
  });
  it("restores mixed-model history and preserves older single-model runs", () => {
    expect(modelsFromResults([{ settings: { modelId: "gpt-image" } }, { settings: { modelId: "nano-banana" } }], "seedream-4")).toEqual(["gpt-image", "nano-banana"]);
    expect(modelsFromResults([{}], "seedream-4")).toEqual(["seedream-4"]);
  });
  it("accepts an HTTPS image handoff without executing any generation", () => {
    expect(parseCreativeReference(JSON.stringify({ url: "https://example.com/image.png", prompt: "Soft sunlight" }))).toEqual({ url: "https://example.com/image.png", prompt: "Soft sunlight" });
    for (const value of [null, "{broken", "{}", '{"url":"javascript:alert(1)","prompt":"x"}', '{"url":"/local.png","prompt":"x"}']) expect(parseCreativeReference(value)).toBeNull();
  });
});
