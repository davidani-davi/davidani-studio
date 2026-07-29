import { describe, expect, it } from "vitest";
import {
  buildCadPrompt,
  CAD_CLEANUP_PROMPT,
  CAD_SPEC_SYSTEM_PROMPT,
  MODE_PROMPTS,
} from "./cad-prompts";

describe("CAD prompts", () => {
  it("returns the flat prompt unchanged when notes are absent or blank", () => {
    expect(buildCadPrompt("flat")).toBe(MODE_PROMPTS.flat);
    expect(buildCadPrompt("flat", "   ")).toBe(MODE_PROMPTS.flat);
  });

  it("appends trimmed designer notes after the locked extraction rules", () => {
    const prompt = buildCadPrompt("seamless", "  base cloth is cream  ");
    expect(prompt.startsWith(MODE_PROMPTS.seamless)).toBe(true);
    expect(prompt).toContain("Additional designer notes");
    expect(prompt.endsWith("base cloth is cream")).toBe(true);
  });

  it("keeps the seamless mode edge requirements out of flat recovery", () => {
    expect(MODE_PROMPTS.seamless).toContain("every edge must tile perfectly");
    expect(MODE_PROMPTS.flat).not.toContain("every edge must tile perfectly");
  });

  it("requires strict JSON from textile specification analysis", () => {
    expect(CAD_SPEC_SYSTEM_PROMPT).toContain("Return STRICT JSON only");
    expect(CAD_SPEC_SYSTEM_PROMPT).toContain('"repeatType"');
    expect(CAD_SPEC_SYSTEM_PROMPT).toContain('"palette"');
  });

  it("locks cleanup to residual construction while preserving tile edges", () => {
    expect(CAD_CLEANUP_PROMPT).toContain("EXACT CENTER");
    expect(CAD_CLEANUP_PROMPT).toContain("do NOT modify the outer edges");
    expect(CAD_CLEANUP_PROMPT).toContain("do not restyle, recolor");
  });
});
