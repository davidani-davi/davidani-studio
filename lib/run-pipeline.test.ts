import { describe, expect, it } from "vitest";
import {
  filterRuns,
  garmentNameFromPrompt,
  runPipeline,
  runSide,
  runSubtitle,
  runTitle,
  runVerdict,
  wantsSecondLook,
  type RunFacts,
} from "./run-pipeline";
import type { BackgroundSnapReport } from "./background-snap";

const CLEAN_SNAP: BackgroundSnapReport = {
  applied: true,
  coverage: 0.7,
  sampled: { r: 0xed, g: 0xee, b: 0xee },
};
const SNAPPED: BackgroundSnapReport = {
  applied: true,
  coverage: 0.68,
  sampled: { r: 0xdf, g: 0xe2, b: 0xe9 },
};
const DECLINED: BackgroundSnapReport = {
  applied: false,
  coverage: 0,
  sampled: null,
  skipReason: "border not neutral",
};

function run(over: Partial<RunFacts> = {}): RunFacts {
  return {
    id: "a503",
    imageUrls: ["one.jpg", "two.jpg"],
    viewLabels: ["Front · Variant 1", "Front · Variant 2"],
    routingCanvas: {
      path: "/product-shots/canvas-outerwear-front.png",
      isFallback: false,
      category: "outerwear",
    },
    backgroundSnaps: [CLEAN_SNAP, CLEAN_SNAP],
    ...over,
  };
}

function step(facts: RunFacts, key: string) {
  const found = runPipeline(facts).find((s) => s.key === key);
  if (!found) throw new Error(`no ${key} step`);
  return found;
}

describe("garment name recovery", () => {
  // The operator never names a run. The analyzer does, in the prompt it builds.
  it("reads the garment out of the prompt the analyzer wrote", () => {
    const prompt =
      "Catalog garment-swap edit. Replace the garment currently shown in the primary " +
      "studio photograph with a different garment: a cream ribbed cotton fitted tank top. " +
      "The replacement garment has these visible properties (match exactly): ...";
    expect(garmentNameFromPrompt(prompt)).toBe("A cream ribbed cotton fitted tank top");
  });

  it("returns null rather than a fragment when the prompt is not one of ours", () => {
    expect(garmentNameFromPrompt("make it pretty")).toBeNull();
    expect(garmentNameFromPrompt("")).toBeNull();
    expect(garmentNameFromPrompt(undefined)).toBeNull();
  });

  it("does not swallow a whole paragraph when the sentence has no full stop", () => {
    const runaway = `with a different garment: ${"x".repeat(400)}.`;
    expect(garmentNameFromPrompt(runaway)).toBeNull();
  });

  it("prefers a typed style name over the analyzer's phrasing", () => {
    expect(
      runTitle(run({ styleName: "Rodeo bomber", prompt: "with a different garment: a jacket." }))
    ).toBe("Rodeo bomber");
  });

  it("falls back to something printable rather than an empty card", () => {
    expect(runTitle(run({ prompt: undefined }))).toBe("Product shot");
    expect(runTitle(run({ prompt: undefined, batch: true }))).toBe("Batch run");
  });

  it("says a style number is missing rather than leaving the line blank", () => {
    expect(runSubtitle(run({ styleNumber: "  dwts67099 " }))).toBe("DWTS67099");
    expect(runSubtitle(run({ styleNumber: undefined }))).toBe("No style number");
  });
});

describe("side", () => {
  it("reads one side from the variant labels", () => {
    expect(runSide(run())).toBe("Front");
    expect(runSide(run({ viewLabels: ["Back · Variant 1", "Back · Variant 2"] }))).toBe("Back");
  });

  it("calls a contract run what it is rather than picking one half", () => {
    expect(runSide(run({ viewLabels: ["Front", "Back"] }))).toBe("Front + back");
  });

  it("returns null for runs that never recorded a side", () => {
    expect(runSide(run({ viewLabels: [] }))).toBeNull();
    expect(runSide(run({ viewLabels: undefined }))).toBeNull();
    expect(runSide(run({ viewLabels: ["Slot 1", "Slot 2"] }))).toBeNull();
  });
});

describe("the four-step strip", () => {
  it("is always four steps in pipeline order, so cards line up as a column", () => {
    expect(runPipeline(run()).map((s) => s.key)).toEqual([
      "intake",
      "side",
      "canvas",
      "backdrop",
    ]);
    // Even when nothing was recorded at all.
    expect(
      runPipeline({ id: "x", imageUrls: [] }).map((s) => s.key)
    ).toEqual(["intake", "side", "canvas", "backdrop"]);
  });

  it("warns on a canvas that was chosen from the photo alone", () => {
    const s = step(
      run({
        routingCanvas: {
          path: "/product-shots/studio-backdrop-empty.png",
          isFallback: true,
          category: "top",
          fallbackReason: "category-inferred",
        },
      }),
      "canvas"
    );
    expect(s.tone).toBe("warn");
    expect(s.detail).toMatch(/style number/i);
  });

  // A category with no flat lay yet is not a mistake — nothing to warn about.
  it("does not warn when the sweep is simply all there is for that category", () => {
    const s = step(
      run({
        routingCanvas: {
          path: "/product-shots/studio-backdrop-empty.png",
          isFallback: true,
          category: "pants",
          fallbackReason: "no-canvas",
        },
      }),
      "canvas"
    );
    expect(s.tone).toBe("muted");
    expect(s.label).toBe("Empty sweep");
  });

  it("names an approved canvas without its path or extension", () => {
    expect(step(run(), "canvas").label).toBe("outerwear-front");
  });

  it("says an uploaded canvas outranked routing", () => {
    const s = step(run({ routingCanvas: null }), "canvas");
    expect(s.label).toBe("Own canvas");
    expect(s.tone).toBe("muted");
  });

  // Two variants of one prompt routinely disagree.
  it("reports the worse of the two variants, not the first", () => {
    expect(step(run({ backgroundSnaps: [CLEAN_SNAP, DECLINED] }), "backdrop").tone).toBe("warn");
    expect(step(run({ backgroundSnaps: [DECLINED, CLEAN_SNAP] }), "backdrop").tone).toBe("warn");
    expect(step(run({ backgroundSnaps: [CLEAN_SNAP, SNAPPED] }), "backdrop").label).toBe("Snapped");
  });

  it("distinguishes not measured from measured and fine", () => {
    expect(step(run({ backgroundSnaps: undefined }), "backdrop").label).toBe("Not measured");
    expect(step(run({ backgroundSnaps: [null, null] }), "backdrop").label).toBe("Not measured");
    expect(step(run(), "backdrop").label).toBe("Clean");
  });
});

describe("verdict", () => {
  it("reports a kept variant by slot", () => {
    expect(runVerdict(run({ abTest: { selectedImage: "left" } }))).toEqual({
      tone: "kept",
      label: "Kept · V1",
    });
    expect(runVerdict(run({ abTest: { selectedImage: "right" } })).label).toBe("Kept · V2");
  });

  it("does not treat 'no preference' as a keep", () => {
    expect(runVerdict(run({ abTest: { selectedImage: "no_preference" } })).tone).toBe("clean");
  });

  it("flags an inferred canvas even when the backdrop came out fine", () => {
    const facts = run({
      routingCanvas: {
        path: "/product-shots/studio-backdrop-empty.png",
        isFallback: true,
        category: "top",
        fallbackReason: "category-inferred",
      },
      backgroundSnaps: [CLEAN_SNAP, CLEAN_SNAP],
    });
    expect(wantsSecondLook(facts)).toBe(true);
    expect(runVerdict(facts).tone).toBe("check");
  });

  it("flags a declined backdrop even when the canvas was approved", () => {
    expect(wantsSecondLook(run({ backgroundSnaps: [CLEAN_SNAP, DECLINED] }))).toBe(true);
  });

  // A keep is the operator's own judgement and outranks the machine's.
  it("lets a keep outrank the check flag", () => {
    const facts = run({
      abTest: { selectedImage: "right" },
      backgroundSnaps: [DECLINED, DECLINED],
    });
    expect(runVerdict(facts).tone).toBe("kept");
    // The underlying flag is still true — the ledger filter still finds it.
    expect(wantsSecondLook(facts)).toBe(true);
  });

  it("says a run in flight is in flight, whatever it stores", () => {
    expect(runVerdict(run(), { running: true }).tone).toBe("running");
  });

  it("calls a measured, approved, unpicked run clean", () => {
    expect(runVerdict(run()).tone).toBe("clean");
  });

  // "Not measured" is not "fine", but it is not a failure either — a run that
  // finalize never reported on must not fill the Check filter with noise.
  it("does not flag a run the backdrop pass never reported on", () => {
    expect(wantsSecondLook(run({ backgroundSnaps: undefined }))).toBe(false);
  });
});

describe("ledger filter", () => {
  const kept = run({ id: "kept", abTest: { selectedImage: "left" } });
  const check = run({ id: "check", backgroundSnaps: [DECLINED, DECLINED] });
  const clean = run({ id: "clean" });
  const all = [kept, check, clean];

  it("passes everything through on all", () => {
    expect(filterRuns(all, "all")).toHaveLength(3);
  });

  it("finds kept runs", () => {
    expect(filterRuns(all, "kept").map((r) => r.id)).toEqual(["kept"]);
  });

  it("finds runs worth a second look, including ones already kept", () => {
    const keptButFlagged = run({
      id: "both",
      abTest: { selectedImage: "left" },
      backgroundSnaps: [DECLINED, DECLINED],
    });
    expect(filterRuns([...all, keptButFlagged], "check").map((r) => r.id)).toEqual([
      "check",
      "both",
    ]);
  });

  it("does not mutate or reorder the input", () => {
    const copy = [...all];
    filterRuns(all, "check");
    expect(all).toEqual(copy);
  });
});
