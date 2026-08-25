import { describe, expect, it } from "vitest";
import { optimizePromptForModel } from "./prompt-strategy";

const PRODUCT_PROMPT =
  "Catalog garment-swap edit. Replace the garment currently shown in the primary studio photograph " +
  "with a different garment: a boxy black cotton bomber jacket.";

const MODEL_PROMPT =
  "Fashion catalog garment-swap edit on a human model. Replace the garment with a boxy black bomber jacket.";

describe("optimizePromptForModel — product-shot intent", () => {
  // The regression this file exists for: Image Studio's own deliverable is a
  // flat lay, and it was inheriting Model Studio's prefix, which forbids one.
  it.each(["nano-banana", "gpt-image", "seedream-4"] as const)(
    "never forbids a flat lay for %s",
    (modelId) => {
      const out = optimizePromptForModel(modelId, PRODUCT_PROMPT, "product-shot");
      expect(out).not.toMatch(/Do not output a standalone product photo/i);
      expect(out).not.toMatch(/no flat lay|not output .*flat lay/i);
    }
  );

  it.each(["nano-banana", "gpt-image", "seedream-4"] as const)(
    "affirms a product-only image with no wearer for %s",
    (modelId) => {
      const out = optimizePromptForModel(modelId, PRODUCT_PROMPT, "product-shot");
      expect(out).toMatch(/product-only ecommerce image/i);
      expect(out).toMatch(/no human model/i);
      expect(out).toMatch(/Output exactly one product image/i);
    }
  );

  it("never mentions model identity, body, or pose for a flat lay", () => {
    const out = optimizePromptForModel("nano-banana", PRODUCT_PROMPT, "product-shot");
    expect(out).not.toMatch(/model identity/i);
    expect(out).not.toMatch(/\bpose\b/i);
  });

  it("still firewalls the canvas from dictating the garment", () => {
    const out = optimizePromptForModel("nano-banana", PRODUCT_PROMPT, "product-shot");
    expect(out).toMatch(/Canvas source firewall/i);
    expect(out).toMatch(/Do not borrow any garment category, silhouette/i);
  });

  it("preserves the caller's prompt body verbatim after the prefix", () => {
    const out = optimizePromptForModel("nano-banana", PRODUCT_PROMPT, "product-shot");
    expect(out.endsWith(PRODUCT_PROMPT)).toBe(true);
  });

  it("strips the negative-prompt tail for gpt-image only", () => {
    const withNegative = `${PRODUCT_PROMPT} Negative prompt: no hanger, no mannequin.`;
    expect(
      optimizePromptForModel("gpt-image", withNegative, "product-shot")
    ).not.toMatch(/Negative prompt:/i);
    expect(
      optimizePromptForModel("nano-banana", withNegative, "product-shot")
    ).toMatch(/Negative prompt:/i);
  });
});

describe("optimizePromptForModel — model-swap intent is unchanged", () => {
  it("defaults to model-swap when no intent is passed", () => {
    expect(optimizePromptForModel("nano-banana", MODEL_PROMPT)).toBe(
      optimizePromptForModel("nano-banana", MODEL_PROMPT, "model-swap")
    );
  });

  it("still forbids flat lays for nano-banana model swaps", () => {
    const out = optimizePromptForModel("nano-banana", MODEL_PROMPT, "model-swap");
    expect(out).toMatch(/Do not output a standalone product photo, flat lay/i);
    expect(out).toMatch(/Garment source firewall/i);
  });

  it("keeps the gpt-image model-photo branch", () => {
    const out = optimizePromptForModel("gpt-image", MODEL_PROMPT, "model-swap");
    expect(out).toMatch(/preserve the model's identity/i);
  });

  it("passes seedream through untouched", () => {
    expect(optimizePromptForModel("seedream-4", MODEL_PROMPT, "model-swap")).toBe(MODEL_PROMPT);
  });
});
