import { describe, expect, it } from "vitest";
import { buildTwoImagePrompt, buildTwoPiecePrompt } from "./fal";

const FEATURES = "a ribbed cream collar, a full-length center front zipper, two front welt pockets";
const slots = (out: string) =>
  out.match(
    /different garment: a (.+?)\.( The replacement garment has these visible properties \(match exactly\): (.+?)\.)? The exact appearance/s
  );

describe("descriptor discipline — identity words survive the template", () => {
  // Regression: ANALYSIS_SYSTEM_PROMPT requires an explicit cut/fit descriptor
  // in GARMENT, and the template then deleted it because SILHOUETTE AUTHORITY
  // names "oversized"/"boxy" and the layout clause names "cropped" as examples.
  // "cropped white tank" losing "cropped" is a different product.
  it.each([
    ["boxy black cotton bomber jacket", "boxy"],
    ["oversized fuzzy knit baby blue cardigan", "oversized"],
    ["cropped white ribbed cotton tank top", "cropped"],
    ["slim pale pink tailored blazer", "slim"],
    ["relaxed olive cotton chore jacket", "relaxed"],
    ["fitted black ponte midi dress", "fitted"],
  ])("keeps the silhouette word in %s", (garment, word) => {
    expect(slots(buildTwoImagePrompt(garment, FEATURES, "preserve"))![1]).toContain(word);
  });

  it.each([
    ["barrel-fit deep indigo denim jeans", "deep"],
    ["slim pale pink tailored blazer", "pale"],
    ["bright red cropped puffer jacket", "bright"],
  ])("keeps the color-intensity word in %s", (garment, word) => {
    expect(slots(buildTwoImagePrompt(garment, FEATURES, "preserve"))![1]).toContain(word);
  });

  it("still strips quality words the template already spends", () => {
    // "clean" appears in the template's own fixed text, so it must not be
    // spent twice — this is the rule the identity split deliberately keeps.
    const out = slots(buildTwoImagePrompt("black bomber jacket", "a clean neckline", "preserve"))!;
    expect(out[3]).toBe("a neckline");
  });

  it("still dedupes an identity word across GARMENT and FEATURES", () => {
    const out = slots(buildTwoImagePrompt("boxy black bomber jacket", "a boxy torso", "preserve"))!;
    expect(out[1]).toContain("boxy");
    expect(out[3]).not.toContain("boxy");
  });

  it("still drops non-physical descriptors", () => {
    const out = slots(buildTwoImagePrompt("basic nice black jacket", FEATURES, "preserve"))!;
    expect(out[1]).not.toMatch(/basic|nice/);
  });
});

describe("filled flat lay, not a pressed one", () => {
  const out = buildTwoImagePrompt("boxy black cotton bomber jacket", FEATURES, "preserve");

  it("asks for three-dimensional volume", () => {
    expect(out).toMatch(/FILLED flat lay/);
    expect(out).toMatch(/gently\s+padded from within/);
    expect(out).toMatch(/rounded tubular volume/);
  });

  it("no longer asks for an ironed, mirror-symmetric garment", () => {
    expect(out).not.toMatch(/neatly laid flat/);
    expect(out).not.toMatch(/perfectly symmetrical/);
    expect(out).toMatch(/NOT a mirrored graphic/);
  });

  it("keeps natural folds instead of banning all of them", () => {
    expect(out).toMatch(/retain the soft natural folds/);
    expect(out).toMatch(/Do not iron the garment into a flat plane/);
  });

  it("preserves the silhouette-over-layout guarantee", () => {
    expect(out).toMatch(/must NOT override the reference silhouette/);
    expect(out).toMatch(/a barrel leg stays barrel/);
  });
});

describe("near-shadowless lighting", () => {
  it.each(["preserve", "backdrop"] as const)("bans cast shadows in %s mode", (mode) => {
    const out = buildTwoImagePrompt("boxy black cotton bomber jacket", FEATURES, mode);
    // Both canvas modes must forbid a grounded shadow. Wording differs — the
    // preserve branch says "do not add a cast shadow", the LIGHTING block says
    // "no visible cast shadow" — so match the intent, not one phrasing.
    expect(out).toMatch(/(no visible|do not add a|no) cast shadow/i);
    expect(out).toMatch(/drop shadow/i);
    expect(out).toMatch(/near-shadowless/i);
    expect(out).not.toMatch(/realistic shadows/i);
    expect(out).not.toMatch(/subtle contact shadow/i);
  });

  it("still allows self-shading inside the folds", () => {
    const out = buildTwoImagePrompt("boxy black cotton bomber jacket", FEATURES, "preserve");
    expect(out).toMatch(/gentle self-shading/);
  });
});

describe("two-piece set path matches the single-garment standard", () => {
  // Reachable from the same studio via the twoPiece toggle. If it drifts from
  // buildTwoImagePrompt, a set renders in a visibly different style from every
  // single-garment render of the same collection.
  const out = buildTwoPiecePrompt(
    {
      top: "cropped ribbed knit tank top",
      topFeatures: "a fitted torso, a scoop neckline",
      bottom: "wide-leg ribbed knit pants",
      bottomFeatures: "a relaxed leg, an elastic waistband",
    },
    "preserve"
  );

  it("asks for a filled flat lay", () => {
    expect(out).toMatch(/FILLED flat lay/);
    expect(out).toMatch(/gently\s+padded from within/);
  });

  it("no longer asks for a pressed, mirror-symmetric set", () => {
    expect(out).not.toMatch(/neatly laid flat/);
    expect(out).not.toMatch(/symmetric along the vertical centerline/);
    expect(out).toMatch(/NOT mirrored graphics/);
  });

  it("bans cast shadows like the single-garment path", () => {
    expect(out).toMatch(/no visible cast shadow/i);
    expect(out).toMatch(/gentle\s+self-shading/);
  });

  it("keeps the silhouette-over-layout guarantee", () => {
    expect(out).toMatch(/must NOT override the reference silhouette/);
  });
});

describe("no ban-and-require contradictions", () => {
  it.each([
    ["single", buildTwoImagePrompt("boxy black bomber jacket", FEATURES, "preserve")],
    [
      "two-piece",
      buildTwoPiecePrompt(
        {
          top: "ribbed tank",
          topFeatures: "a scoop neckline",
          bottom: "wide-leg pants",
          bottomFeatures: "an elastic waistband",
        },
        "preserve"
      ),
    ],
  ])("does not both forbid and require folds in the %s path", (_label, out) => {
    // The prompt requires natural folds, so "folds" must not also appear in the
    // do-not-copy list a sentence earlier.
    expect(out).toMatch(/retain the soft natural folds/);
    expect(out).not.toMatch(/do not copy the specific wrinkles, creases, twists,[^.]*folds/);
    expect(out).not.toMatch(/wrinkles, folds, creases/);
  });
});
