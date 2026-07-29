import { describe, expect, it } from "vitest";
import { mergeAssetRecords } from "./user-asset-records";

interface Item {
  id: string;
  name: string;
}

describe("per-asset manifest merging", () => {
  it("preserves independently saved records without shared-index overwrites", () => {
    expect(
      mergeAssetRecords<Item>([], [
        { id: "a", record: { deleted: false, value: { id: "a", name: "A" } } },
        { id: "b", record: { deleted: false, value: { id: "b", name: "B" } } },
      ])
    ).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
  });

  it("uses per-id tombstones to hide deleted legacy entries", () => {
    expect(
      mergeAssetRecords<Item>(
        [
          { id: "legacy", name: "Legacy" },
          { id: "keep", name: "Keep" },
        ],
        [{ id: "legacy", record: { deleted: true } }]
      )
    ).toEqual([{ id: "keep", name: "Keep" }]);
  });

  it("allows a manifest to replace the matching legacy value only", () => {
    expect(
      mergeAssetRecords<Item>(
        [
          { id: "a", name: "Old A" },
          { id: "b", name: "B" },
        ],
        [{ id: "a", record: { deleted: false, value: { id: "a", name: "New A" } } }]
      )
    ).toEqual([
      { id: "a", name: "New A" },
      { id: "b", name: "B" },
    ]);
  });
});
