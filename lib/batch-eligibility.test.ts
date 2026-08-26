import { describe, expect, it } from "vitest";
import { BATCH_MIN_IMAGES, batchEligibility } from "./batch-eligibility";

const MANY = BATCH_MIN_IMAGES + 38; // a realistic drop

describe("batch is allowed only where its output matches its behaviour", () => {
  it("enables front runs with enough photos", () => {
    expect(batchEligibility("single-front", MANY)).toEqual({ enabled: true, reason: null });
  });

  it("blocks back runs", () => {
    // The bug: batch takes canvas.front and sends no view directive, so a
    // 40-image back run came back as 40 front shots with nothing reporting it.
    const { enabled, reason } = batchEligibility("single-back", MANY);
    expect(enabled).toBe(false);
    expect(reason).toContain("front shots only");
  });

  it("blocks contract runs", () => {
    // Structurally impossible rather than merely unimplemented — a flat queue
    // carries no front/back pairing.
    const { enabled, reason } = batchEligibility("front-back-contract", MANY);
    expect(enabled).toBe(false);
    expect(reason).toContain("same style");
  });
});

describe("the queue-size rule", () => {
  it("blocks below the minimum", () => {
    expect(batchEligibility("single-front", BATCH_MIN_IMAGES - 1).enabled).toBe(false);
  });

  it("enables exactly at the minimum", () => {
    expect(batchEligibility("single-front", BATCH_MIN_IMAGES).enabled).toBe(true);
  });

  it("blocks an empty queue", () => {
    expect(batchEligibility("single-front", 0).enabled).toBe(false);
  });
});

describe("the reason is actionable", () => {
  // The old tooltip said "Select 2 or more images to enable" in a UI with no
  // image selection, sending people to look for a screen that does not exist.
  it("never tells the user to select images", () => {
    const modes = ["single-front", "single-back", "front-back-contract"] as const;
    for (const mode of modes) {
      for (const n of [0, 1, MANY]) {
        const reason = batchEligibility(mode, n).reason;
        if (reason) expect(reason.toLowerCase()).not.toContain("select");
      }
    }
  });

  it("says where the queue comes from when it is too small", () => {
    expect(batchEligibility("single-front", 1).reason).toContain("Every photo you upload");
  });

  it("gives a reason whenever it is disabled, and none when enabled", () => {
    const modes = ["single-front", "single-back", "front-back-contract"] as const;
    for (const mode of modes) {
      for (const n of [0, 1, MANY]) {
        const { enabled, reason } = batchEligibility(mode, n);
        expect(enabled ? reason === null : typeof reason === "string").toBe(true);
      }
    }
  });

  it("reports the mode problem even when the queue is also too small", () => {
    // Mode is the more informative failure: fixing the count would not help.
    expect(batchEligibility("single-back", 0).reason).toContain("front shots only");
  });
});
