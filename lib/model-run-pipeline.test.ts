import { describe, expect, it } from "vitest";
import { modelRunPipeline, modelRunTitle, modelRunViews } from "./model-run-pipeline";
import type { RunFacts } from "./run-pipeline";

const RUN: RunFacts & { humanModelId?: string; poseId?: string } = {
  id: "aaaa",
  imageUrls: ["/1.png", "/2.png", "/3.png", "/4.png"],
  sourceImageUrls: ["/garment.png"],
  viewLabels: ["front", "side", "back", "full"],
  humanModelId: "kylie 1",
  poseId: "kylie1",
};

describe("modelRunViews", () => {
  it("counts a four-view run rather than listing it", () => {
    expect(modelRunViews(RUN)).toBe("4 views");
  });

  it("names one or two views, in shooting order", () => {
    expect(modelRunViews({ ...RUN, viewLabels: ["front"] })).toBe("Front");
    expect(modelRunViews({ ...RUN, viewLabels: ["back", "front"] })).toBe("Front + Back");
  });

  it("ignores the variant suffix a retry adds", () => {
    expect(modelRunViews({ ...RUN, viewLabels: ["front · variant 2", "front"] })).toBe("Front");
  });

  it("says nothing when the run recorded no view", () => {
    expect(modelRunViews({ ...RUN, viewLabels: [] })).toBeNull();
  });
});

describe("modelRunTitle", () => {
  it("names the run by what it shot", () => {
    expect(modelRunTitle(RUN)).toBe("On model · 4 views");
    expect(modelRunTitle({ ...RUN, viewLabels: [] })).toBe("On-model shot");
  });
});

describe("modelRunPipeline", () => {
  it("reads intake, views, model and delivery", () => {
    expect(modelRunPipeline(RUN).map((s) => [s.label, s.tone])).toEqual([
      ["Intake", "ok"],
      ["4 views", "ok"],
      ["kylie 1", "ok"],
      ["4 delivered", "ok"],
    ]);
  });

  it("warns when a multi-view run came back short", () => {
    const short = { ...RUN, imageUrls: ["/1.png", "/2.png", "/3.png"] };
    const delivery = modelRunPipeline(short)[3];
    expect(delivery.tone).toBe("warn");
    expect(delivery.label).toBe("3 of 4");
  });

  it("counts down while the run is still painting, without warning", () => {
    const painting = {
      ...RUN,
      imageUrls: ["/1.png"],
      pending: { variants: 4, startedAt: Date.now() },
    };
    expect(modelRunPipeline(painting)[3]).toMatchObject({ label: "1/4 painting", tone: "muted" });
  });

  it("says so when the run recorded no garment photo or model", () => {
    const bare = { ...RUN, sourceImageUrls: [], humanModelId: undefined };
    expect(modelRunPipeline(bare)[0]).toMatchObject({ label: "No intake", tone: "muted" });
    expect(modelRunPipeline(bare)[2]).toMatchObject({ label: "Model not recorded", tone: "muted" });
  });
});
