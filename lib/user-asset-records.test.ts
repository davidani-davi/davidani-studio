import { describe, expect, it } from "vitest";
import { latestRecordFiles, mergeAssetRecords, olderRecordFiles, recordId } from "./user-asset-records";

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

describe("versioned record files (fresh reads after a write, 2026-11-03)", () => {
  const P = "user-models/records/";
  const f = (pathname: string, at: number) => ({ pathname, url: `https://blob/${pathname}`, uploadedAt: new Date(at) });

  it("reads the set id from a legacy file and from a version file", () => {
    expect(recordId(P, `${P}celine-dct78115-mvy5e2r2.json`)).toBe("celine-dct78115-mvy5e2r2");
    expect(recordId(P, `${P}celine-dct78115-mvy5e2r2/0mhjx1a2b-k3j9qz.json`)).toBe("celine-dct78115-mvy5e2r2");
    expect(recordId(P, `${P}a/b/c.json`)).toBeNull();
    expect(recordId(P, `${P}a.txt`)).toBeNull();
    expect(recordId(P, "user-references/records/a.json")).toBeNull();
    expect(recordId(P, `${P}.json`)).toBeNull();
  });

  it("picks the newest file per set by upload time, then by name", () => {
    const latest = latestRecordFiles(P, [
      f(`${P}a.json`, 1000),
      f(`${P}a/0000000002-x.json`, 3000),
      f(`${P}a/0000000001-x.json`, 2000),
      f(`${P}b/0000000001-x.json`, 5000),
      f(`${P}b/0000000002-x.json`, 5000),
      f(`${P}notes.txt`, 9000),
    ]);
    expect([...latest.keys()].sort()).toEqual(["a", "b"]);
    expect(latest.get("a")!.pathname).toBe(`${P}a/0000000002-x.json`);
    expect(latest.get("b")!.pathname).toBe(`${P}b/0000000002-x.json`);
  });

  it("lets a legacy file written later win (an older deployment still running)", () => {
    expect(latestRecordFiles(P, [f(`${P}a/0000000001-x.json`, 1000), f(`${P}a.json`, 2000)]).get("a")!.pathname).toBe(`${P}a.json`);
  });

  it("lists only files strictly older than the one just written", () => {
    const mine = f(`${P}a/0000000002-x.json`, 3000);
    const newer = f(`${P}a/0000000003-x.json`, 4000);
    const older = [f(`${P}a.json`, 1000), f(`${P}a/0000000001-x.json`, 2000)];
    expect(olderRecordFiles([...older, mine, newer], mine).map((x) => x.pathname)).toEqual(older.map((x) => x.pathname));
  });
});
