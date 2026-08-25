import { describe, expect, it } from "vitest";
import { buildBatchSummary } from "./batch-summary";

const clean = { total: 6, failures: [], matched: 6, conflicts: [] };

describe("a clean run says nothing", () => {
  // If silence does not mean "clean", the summary becomes noise people stop
  // reading — and then the conflicts below get skipped too.
  it("returns null when everything matched and nothing failed", () => {
    expect(buildBatchSummary(clean)).toBeNull();
  });
});

describe("failures", () => {
  it("counts successes and lists the first few", () => {
    const out = buildBatchSummary({
      ...clean,
      failures: [{ error: "Analyze failed" }, { error: "Timeout" }],
    })!;
    expect(out).toContain("4 of 6 succeeded");
    expect(out).toContain("• image 1: Analyze failed");
    expect(out).toContain("• image 2: Timeout");
  });

  it("truncates long failure lists", () => {
    const out = buildBatchSummary({
      ...clean,
      total: 9,
      failures: Array.from({ length: 5 }, () => ({ error: "boom" })),
    })!;
    expect(out).toContain("…and 2 more");
  });
});

describe("a filename code that lost to the ERP is surfaced", () => {
  // The whole point of demoting inferred codes is that it is a safe default,
  // not a correct one. DWTS67099 is the case where the code is right.
  const out = buildBatchSummary({
    ...clean,
    conflicts: [{ filename: "DWTS67099 CHARCOAL_1.png", wanted: "set", kept: "outerwear" }],
  })!;

  it("names the file and both answers", () => {
    expect(out).toContain("DWTS67099 CHARCOAL_1.png");
    expect(out).toContain("code says set, ERP says outerwear");
  });

  it("says which one was used", () => {
    expect(out).toContain("used outerwear");
  });

  it("explains why the code lost", () => {
    expect(out).toContain("does not overrule the ERP");
  });

  it("uses singular for one file", () => {
    expect(out).toContain("1 file disagreed");
  });

  it("uses plural for several", () => {
    const many = buildBatchSummary({
      ...clean,
      conflicts: [
        { filename: "a.png", wanted: "set", kept: "outerwear" },
        { filename: "b.png", wanted: "set", kept: "top" },
      ],
    })!;
    expect(many).toContain("2 files disagreed");
  });
});

describe("rows with no style number in the filename", () => {
  it("says how many and what to do about it", () => {
    const out = buildBatchSummary({ ...clean, matched: 4 })!;
    expect(out).toContain("2 of 6 files have no style number");
    expect(out).toContain("read from the photo");
    expect(out).toContain("Rename them to start with the style code");
  });

  it("reads correctly for a single file", () => {
    const out = buildBatchSummary({ ...clean, total: 3, matched: 2 })!;
    expect(out).toContain("1 of 3 files has no style number");
    expect(out).toContain("it was");
    expect(out).toContain("Rename it");
  });
});

describe("several things at once", () => {
  const out = buildBatchSummary({
    total: 8,
    failures: [{ error: "Timeout" }],
    matched: 5,
    conflicts: [{ filename: "DWTS67099.png", wanted: "set", kept: "outerwear" }],
  })!;

  it("leads with failures, then disagreements, then the quiet note", () => {
    expect(out.indexOf("failed")).toBeLessThan(out.indexOf("disagreed with the"));
    expect(out.indexOf("disagreed with the")).toBeLessThan(out.indexOf("no style number"));
  });

  it("starts with the string the UI keys its 'Summary' heading off", () => {
    expect(out.startsWith("Batch finished")).toBe(true);
  });
});
