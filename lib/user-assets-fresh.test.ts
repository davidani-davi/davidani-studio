import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory Blob store whose CDN never refreshes a URL once served: the worst case of what production showed
// on 2026-11-03 (an overwritten record read stale for 4-60 s, and the ?nocache= query did not get past the CDN).
const store = new Map<string, { body: string; url: string; uploadedAt: Date }>();
const cdn = new Map<string, string>();
let clock = 0;
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: string, opts: { allowOverwrite?: boolean }) => {
    if (store.has(pathname) && !opts?.allowOverwrite) throw new Error("This blob already exists");
    const url = `https://blob.test/${pathname}`;
    store.set(pathname, { body: String(body), url, uploadedAt: new Date(1_800_000_000_000 + ++clock * 1000) });
    return { url, pathname };
  }),
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({
    blobs: [...store].filter(([p]) => p.startsWith(prefix)).map(([pathname, v]) => ({ pathname, url: v.url, uploadedAt: v.uploadedAt })),
    hasMore: false,
  })),
  del: vi.fn(async (urls: string | string[]) => {
    for (const url of [urls].flat()) for (const [p, v] of store) if (v.url === url) store.delete(p);
  }),
}));
import { del } from "@vercel/blob";
import { deleteUserModel, listUserModels, renameUserModel, type UserModel } from "./user-assets";

const model: UserModel = { id: "celine-dct78115-mvy5e2r2", name: "Celine · DCT78115", createdAt: "2026-11-01", views: { front: "https://blob.test/f.png" } };
const recordFiles = () => [...store.keys()].filter((p) => p.startsWith("user-models/records/"));

beforeEach(() => {
  store.clear(); cdn.clear(); clock = 0;
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test");
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input).split("?")[0];
    if (!cdn.has(url)) { const hit = [...store.values()].find((v) => v.url === url); if (!hit) return { ok: false, json: async () => null }; cdn.set(url, hit.body); }
    const body = cdn.get(url)!;
    return { ok: true, json: async () => JSON.parse(body) };
  }));
});

describe("saved-set records read fresh right after a write", () => {
  it("shows the second edit at once, though the CDN still holds the first", async () => {
    await renameUserModel(model, "First name");
    expect((await listUserModels()).find((m) => m.id === model.id)?.name).toBe("First name");
    await renameUserModel(model, "Second name");
    expect((await listUserModels()).find((m) => m.id === model.id)?.name).toBe("Second name");
  });

  it("keeps one record file per set, and replaces a file saved before versions", async () => {
    store.set(`user-models/records/${model.id}.json`, { body: JSON.stringify({ deleted: false, value: { ...model, name: "Legacy" } }), url: "https://blob.test/legacy.json", uploadedAt: new Date(1_700_000_000_000) });
    expect((await listUserModels())[0].name).toBe("Legacy");
    await renameUserModel(model, "A");
    await renameUserModel(model, "B");
    expect(recordFiles()).toHaveLength(1);
    expect(recordFiles()[0]).toMatch(new RegExp(`^user-models/records/${model.id}/[0-9a-z]+-[0-9a-z]+\\.json$`));
    expect((await listUserModels()).map((m) => m.name)).toEqual(["B"]);
  });

  it("still saves when tidying old files fails", async () => {
    await renameUserModel(model, "A");
    vi.mocked(del).mockRejectedValueOnce(new Error("offline"));
    await expect(renameUserModel(model, "B")).resolves.toMatchObject({ name: "B" });
    expect((await listUserModels())[0].name).toBe("B");
  });

  it("hides a deleted set at once", async () => {
    await renameUserModel(model, "A");
    expect(await listUserModels()).toHaveLength(1);
    await deleteUserModel(model.id);
    expect(await listUserModels()).toEqual([]);
  });
});
