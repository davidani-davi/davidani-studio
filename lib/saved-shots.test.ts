import { describe, expect, it } from "vitest";
import { imageType, latestPerView, mergeShots, normalizeStyle, normalizeView, type SavedShot } from "./saved-shots";

const shot = (id: string, view: string, savedAt: number, extra: Partial<SavedShot> = {}): SavedShot => ({
  id, view, url: `https://blob/${id}.jpg`, savedAt, durable: true, ...extra,
});

describe("saved-shots: keys", () => {
  it("accepts ERP style codes only, upper-cased", () => {
    expect(normalizeStyle(" dt78080 ")).toBe("DT78080");
    expect(normalizeStyle("DP60418-2")).toBe("DP60418-2");
    expect(normalizeStyle("../x")).toBe("");
    expect(normalizeStyle("")).toBe("");
  });
  it("knows the four views", () => {
    expect(normalizeView("Front")).toBe("front");
    expect(normalizeView("full")).toBe("full");
    expect(normalizeView("hero")).toBe("");
  });
});

describe("saved-shots: merge", () => {
  it("adds newest first and never saves the same source twice", () => {
    const existing = [shot("a", "front", 100, { source: "https://fal/a.png" })];
    const again = shot("a2", "front", 200, { source: "https://fal/a.png" });
    const fresh = shot("b", "side", 300, { source: "https://fal/b.png" });
    const r = mergeShots(existing, [again, fresh]);
    expect(r.added.map((s) => s.id)).toEqual(["b"]);
    expect(r.shots.map((s) => s.id)).toEqual(["b", "a"]);
  });
  it("keeps the newest 48 of a style", () => {
    const many = Array.from({ length: 60 }, (_, i) => shot(`s${i}`, "front", i, { source: `https://fal/${i}` }));
    const r = mergeShots([], many);
    expect(r.shots).toHaveLength(48);
    expect(r.shots[0].id).toBe("s59");
  });
});

describe("saved-shots: load set", () => {
  it("picks the newest per view, in view order", () => {
    const shots = [shot("f1", "front", 1), shot("f2", "front", 5), shot("b", "back", 3), shot("s", "side", 2)];
    expect(latestPerView(shots).map((s) => s.id)).toEqual(["f2", "s", "b"]);
  });
});

describe("saved-shots: image type from the bytes", () => {
  it("reads JPEG, PNG and WebP magic and ignores fal's octet-stream header", () => {
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "application/octet-stream")).toEqual({ contentType: "image/jpeg", ext: "jpg" });
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "")).toEqual({ contentType: "image/png", ext: "png" });
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(imageType(webp, "")).toEqual({ contentType: "image/webp", ext: "webp" });
    expect(imageType(new Uint8Array([0, 0]), "application/octet-stream", "https://x/y.png")).toEqual({ contentType: "image/png", ext: "png" });
    expect(imageType(new Uint8Array([0, 0]), "", "")).toEqual({ contentType: "image/jpeg", ext: "jpg" });
  });
});
