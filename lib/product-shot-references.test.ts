import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT_SHOT_REFERENCES } from "./product-shot-references";
import { coveredCategories } from "./canvas-registry";

const PUBLIC_DIR = join(process.cwd(), "public");

describe("product shot canvas presets", () => {
  // This list is the manual-override picker; routing normally chooses the
  // canvas. Index 0 still seeds the preview, so it must be on-target.
  it("previews the approved outerwear front canvas first", () => {
    expect(PRODUCT_SHOT_REFERENCES[0].id).toBe("canvas-outerwear-front");
  });

  it("offers every approved per-category canvas as a manual override", () => {
    const ids = PRODUCT_SHOT_REFERENCES.map((r) => r.id);
    for (const c of coveredCategories()) {
      expect(ids, `no override entry for ${c}`).toContain(`canvas-${c}-front`);
    }
  });

  // A preset whose file is missing yields a 404 canvas URL, which the model
  // silently renders without — falling back to the user's phone photo as
  // image_urls[0], the exact failure the backdrop sweep was added to fix.
  it("points every preset at a file that exists", () => {
    for (const ref of PRODUCT_SHOT_REFERENCES) {
      expect(existsSync(join(PUBLIC_DIR, ref.path)), `missing ${ref.path}`).toBe(true);
    }
  });

  it("has unique ids and paths", () => {
    const ids = PRODUCT_SHOT_REFERENCES.map((r) => r.id);
    const paths = PRODUCT_SHOT_REFERENCES.map((r) => r.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
