import { describe, expect, it } from "vitest";
import { staticModelsTagged, getPosePublicPath } from "./models-registry";
import { isDerivedPlate, plateForFraming } from "./plate-framing";
import { existsSync } from "node:fs";
import path from "node:path";

it('versions the replaced Celine 2 generator reference, leaving other views unchanged', () => {
  for (const id of ['studio 100', 'crop 100']) {
    const model = staticModelsTagged().find(m => m.id === id)!;
    expect(getPosePublicPath(id, model.poses[0].id, 'front')).toContain('front.png?v=f89baab006a294cb5');
    expect(getPosePublicPath(id, model.poses[0].id, 'side')).not.toContain('?v=');
  }
});

describe("staticModelsTagged — the manifest the deployed function serves", () => {
  it("carries plates.json's tags, auto:false included, so Vercel matches a local fs scan", () => {
    const by = Object.fromEntries(staticModelsTagged().map((m) => [m.id, m]));
    // The prior catalogue was retired for the photographed DETP58027 reset.
    expect(by["studio 38"]).toBeUndefined();
    expect(by["studio 28"]).toBeUndefined();
    expect(by["studio 57"]).toBeUndefined();
    expect(by["studio 03"]).toBeUndefined();
    expect(by["studio 97"]).toMatchObject({ name: "Vision 1", character: "vision", autoPool: true, poseKey: "detp58027-vision" });
    expect(by["studio 98"]).toMatchObject({ name: "Celine 1", character: "celine", autoPool: true, poseKey: "detp58027-celine" });
  });
  it("offers three looks each for Vision and Celine, each with four existing linked photographs", () => {
    const models = staticModelsTagged();
    const visible = models.filter(m => !isDerivedPlate(m.id));
    expect(visible.map(m => m.name)).toEqual(["Vision 1", "Vision 2", "Vision 3 · Pink Peach", "Celine 1", "Celine 2", "Celine 3 · Pink Peach"]);
    for (const model of visible) {
      expect(model.poses).toHaveLength(1);
      for (const view of ["front", "side", "back", "full"] as const) {
        const ref = model.poses[0].views[view]?.publicPath;
        expect(ref).toBeTruthy();
        expect(existsSync(path.join(process.cwd(), "public", ref!))).toBe(true);
      }
      for (const framing of ["crop", "low"] as const) {
        const mapped = plateForFraming(model.id, model.poses[0].id, framing, models);
        const isNewOutfit = ["studio 101", "studio 102"].includes(model.id);
        expect(mapped.humanModelId).toBe(isNewOutfit && framing === "low" ? model.id : model.id.replace("studio", framing));
      }
    }
  });
});
