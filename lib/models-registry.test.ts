import { describe, expect, it } from "vitest";
import { staticModelsTagged } from "./models-registry";

describe("staticModelsTagged — the manifest the deployed function serves", () => {
  it("carries plates.json's tags, auto:false included, so Vercel matches a local fs scan", () => {
    const by = Object.fromEntries(staticModelsTagged().map((m) => [m.id, m]));
    expect(by["studio 38"]).toMatchObject({ character: "vision", autoPool: false });
    expect(by["studio 28"]).toMatchObject({ character: "vision", autoPool: true, poseKey: "dwt62133-24" });
    expect(by["studio 01"].autoPool).toBe(true);
  });
});
