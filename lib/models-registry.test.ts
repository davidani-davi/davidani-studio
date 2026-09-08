import { describe, expect, it } from "vitest";
import { staticModelsTagged } from "./models-registry";

describe("staticModelsTagged — the manifest the deployed function serves", () => {
  it("carries plates.json's tags, auto:false included, so Vercel matches a local fs scan", () => {
    const by = Object.fromEntries(staticModelsTagged().map((m) => [m.id, m]));
    // the wardrobe variants (studio 38-52, 62-79) were retired to hide/ on 2026-09-08
    expect(by["studio 38"]).toBeUndefined();
    expect(by["studio 28"]).toMatchObject({ character: "vision", autoPool: true, poseKey: "dwt62133-24" });
    expect(by["studio 03"].autoPool).toBe(true);
  });
});
