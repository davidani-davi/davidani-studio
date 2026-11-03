// @vitest-environment node
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referencePixels } from "@/lib/garment-only";
import type { UserModel } from "@/lib/user-assets";
import type { UserPose } from "@/lib/user-poses";

const mocks = vi.hoisted(() => ({ list: vi.fn(), savePoses: vi.fn(), setPoses: vi.fn(), detect: vi.fn(), store: vi.fn(), unstore: vi.fn() }));
vi.mock("@/lib/user-assets", async (original) => ({
  ...(await original<typeof import("@/lib/user-assets")>()),
  listUserModels: mocks.list, saveUserModelPoses: mocks.savePoses, setUserModelPoses: mocks.setPoses,
  storePosePhoto: mocks.store, removePosePhoto: mocks.unstore,
}));
vi.mock("@/lib/draft-contour", () => ({ detectAutoContour: mocks.detect }));

import { POST } from "./route";
import { GET as listPoses } from "./[id]/poses/route";
import { PATCH as changePose, POST as replacePose } from "./[id]/poses/[poseId]/route";

const TOKEN = { "x-ddto-token": "user-models-test" };
const png = () => sharp({ create: { width: 40, height: 60, channels: 4, background: "#c8b4a0" } }).png().toBuffer();
const pose = (id: string, view: UserPose["view"], framing: UserPose["framing"], extra: Partial<UserPose> = {}): UserPose => ({
  id, view, framing, stance: "standing", arms: "at-sides", url: `/user-assets/user-models/vision-dd70049/poses/${id}.png`,
  thumbUrl: `/user-assets/user-models/vision-dd70049/poses/${id}-thumb.jpg`,
  contour: { kind: "contour", width: 1, height: 1, sha256: id, source: "recast-mask-v1", detectedAt: "" }, checks: { pass: true }, ...extra,
});
const set = (): UserModel => {
  const poses = [pose("front-03", "front", "crop"), pose("front-08", "front", "full"), pose("side-05", "side", "crop"),
    pose("back-09", "back", "crop", { checks: { pass: false, outline: { ok: false, reason: "outline does not match the photo pixels" } } })];
  return { id: "vision-dd70049", name: "Vision · DD70049", createdAt: "", views: { front: poses[0].url, side: poses[2].url, full: poses[1].url }, poses };
};

beforeEach(() => { process.env.MODEL_SHOTS_TOKEN = "user-models-test"; delete process.env.AUTH_SECRET; });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("POST /api/user-models with a recast look", () => {
  const post = (body: unknown) => POST(new Request("https://studio/api/user-models", { method: "POST", body: JSON.stringify(body), headers: { ...TOKEN, "content-type": "application/json" } }));
  const photo = (id: string, view: string, extra: Record<string, unknown> = {}) =>
    ({ id, view, framing: "crop", stance: "standing", arms: "at-sides", url: `https://v3.fal.media/files/x/${id}.png`, checks: { pass: true }, ...extra });

  it("refuses a missing name or a bad pose list before downloading anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await post({ poses: [photo("front-01", "front")] })).status).toBe(400);
    const res = await post({ name: "Vision · DD70049", poses: [photo("front-01", "top")] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("poses[0].view must be one of");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("saves the look with each matching outline and reports every pose", async () => {
    const bytes = await png();
    const ref = await referencePixels(bytes);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes))));
    mocks.savePoses.mockImplementation(async (name: string, prepared: unknown[]) => ({ id: "vision-dd70049", name, poses: prepared }));
    const outline = { kind: "contour", width: 40, height: 60, sha256: ref.sha256, featherPixels: 4, source: "recast-mask-v1", points: [[10, 4], [30, 4], [30, 22], [10, 22]] };
    const res = await post({ name: "Vision · DD70049", poses: [photo("front-03", "front", { contour: outline }), photo("side-05", "side", { contour: { ...outline, sha256: "0".repeat(64) } })] });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.poses).toEqual([
      { id: "front-03", view: "front", framing: "crop", pass: true, outline: { ok: true, source: "recast-mask-v1" } },
      { id: "side-05", view: "side", framing: "crop", pass: false, outline: { ok: false, reason: "outline does not match the photo pixels (the file changed on the way)" } },
    ]);
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(mocks.savePoses.mock.calls[0][0]).toBe("Vision · DD70049");
  });
  it("refuses a look with no front that passed (422) and saves nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(await png()))));
    mocks.detect.mockResolvedValue(null);
    const res = await post({ name: "Vision · DD70049", poses: [photo("front-03", "front"), photo("side-05", "side")] });
    expect(res.status).toBe(422);
    expect((await res.json()).poses[0]).toMatchObject({ pass: false, outline: { ok: false, reason: "no outline sent; no outline found" } });
    expect(mocks.savePoses).not.toHaveBeenCalled();
  });
  it("passes a failed download on as 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const res = await post({ name: "Vision · DD70049", poses: [photo("front-03", "front")] });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("front-03: download failed (HTTP 404)");
  });
});

describe("GET /api/user-models/<id>/poses", () => {
  const get = (q = "", id = "vision-dd70049") => listPoses(new Request(`https://studio/api/user-models/${id}/poses${q}`, { headers: TOKEN }), { params: Promise.resolve({ id }) });

  it("needs the token", async () => {
    expect((await listPoses(new Request("https://studio/api/user-models/x/poses"), { params: Promise.resolve({ id: "x" }) })).status).toBe(401);
  });
  it("lists the poses a view can shoot on, with the default marked", async () => {
    mocks.list.mockResolvedValue([set()]);
    const body = await (await get("?view=front")).json();
    expect(body.poses.map((p: { id: string; default: string[] }) => [p.id, p.default])).toEqual([["front-03", ["front"]], ["front-08", ["full"]]]);
    expect(body.poses[0]).toMatchObject({ framing: "crop", arms: "at-sides", thumbUrl: expect.stringContaining("front-03-thumb.jpg") });
    expect(body.poses[0].checks).toBeUndefined();
    expect((await (await get("?view=full")).json()).poses.map((p: { id: string }) => p.id)).toEqual(["front-08"]);
  });
  it("lists every pose with why it failed when no view is given", async () => {
    mocks.list.mockResolvedValue([set()]);
    const body = await (await get()).json();
    expect(body.poses).toHaveLength(4);
    expect(body.poses[3]).toMatchObject({ id: "back-09", live: false, checks: { pass: false, outline: { reason: "outline does not match the photo pixels" } } });
  });
  it("refuses an unknown view or set", async () => {
    mocks.list.mockResolvedValue([set()]);
    expect((await get("?view=top")).status).toBe(400);
    expect((await get("", "nope")).status).toBe(404);
  });
});

describe("PATCH /api/user-models/<id>/poses/<poseId>", () => {
  const patch = (poseId: string, body: unknown) => changePose(
    new Request(`https://studio/api/user-models/vision-dd70049/poses/${poseId}`, { method: "PATCH", body: JSON.stringify(body), headers: TOKEN }),
    { params: Promise.resolve({ id: "vision-dd70049", poseId }) },
  );

  it("removes a pose for everyone, logged with who and when", async () => {
    mocks.list.mockResolvedValue([set()]);
    mocks.setPoses.mockImplementation(async (model: UserModel, poses: UserPose[]) => ({ ...model, poses }));
    const res = await patch("front-03", { removed: true, by: "Jeonga" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pose.removed).toMatchObject({ by: "Jeonga", at: expect.stringMatching(/^\d{4}-/) });
    const saved: UserPose[] = mocks.setPoses.mock.calls[0][1];
    expect(saved.filter((p) => p.removed).map((p) => p.id)).toEqual(["front-03"]);
  });
  it("puts a removed pose back", async () => {
    const s = set();
    s.poses![0] = { ...s.poses![0], removed: { by: "Jeonga", at: "2026-10-31T00:00:00Z" } };
    mocks.list.mockResolvedValue([s]);
    mocks.setPoses.mockImplementation(async (model: UserModel, poses: UserPose[]) => ({ ...model, poses }));
    expect((await (await patch("front-03", { removed: false })).json()).pose.removed).toBeUndefined();
  });
  it("changes nothing when the pose is already in that state", async () => {
    mocks.list.mockResolvedValue([set()]);
    expect(await (await patch("front-03", { removed: false })).json()).toMatchObject({ ok: true, unchanged: true });
    expect(mocks.setPoses).not.toHaveBeenCalled();
  });
  it("refuses a bad body, an unknown pose, and the last live front", async () => {
    mocks.list.mockResolvedValue([set()]);
    expect((await patch("front-03", {})).status).toBe(400);
    expect((await patch("front-99", { removed: true })).status).toBe(404);
    mocks.setPoses.mockRejectedValue(new Error("That is the last live front pose of this set. Delete the set instead."));
    const res = await patch("front-03", { removed: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("last live front");
  });
});

describe("Replace photo and Undo on a recast pose", () => {
  // A textured "photo": smooth random blobs, so a resize or shift keeps it recognisable and another seed does not.
  const photo = async (seed: number, w = 400, h = 600) => {
    const px = Buffer.alloc(50 * 75 * 3);
    let r = seed;
    for (let i = 0; i < px.length; i++) { r = (r * 1103515245 + 12345) & 0x7fffffff; px[i] = 40 + (r % 180); }
    return sharp(px, { raw: { width: 50, height: 75, channels: 3 } }).resize(w, h, { kernel: "cubic" }).png().toBuffer();
  };
  const shifted = async (bytes: Buffer, dx: number) =>
    sharp(await sharp(bytes).extend({ left: dx, background: "#808080" }).png().toBuffer()).extract({ left: 0, top: 0, width: 400, height: 600 }).png().toBuffer();
  const BOX: [number, number][] = [[120, 80], [280, 80], [280, 300], [120, 300]];
  const outlined = async (bytes: Buffer, extra: Partial<UserPose> = {}) => {
    const ref = await referencePixels(bytes);
    const model = set();
    model.poses![0] = { ...model.poses![0], contour: { kind: "contour", width: ref.width, height: ref.height, sha256: ref.sha256, featherPixels: 8,
      source: "recast-mask-v1", detectedAt: "", points: BOX }, ...extra };
    return model;
  };
  /** Serves the given photos by path, like the blob store. */
  const serve = (photos: Record<string, Buffer>) => vi.stubGlobal("fetch", vi.fn(async (u: URL | string) => {
    const path = new URL(String(u)).pathname;
    return photos[path] ? new Response(new Uint8Array(photos[path])) : new Response("missing", { status: 404 });
  }));
  const CURRENT = "/user-assets/user-models/vision-dd70049/poses/front-03.png";
  const send = (bytes: Buffer, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(bytes)], "edit.png", { type: "image/png" }));
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return replacePose(new Request("https://studio/api/user-models/vision-dd70049/poses/front-03", { method: "POST", body: form, headers: TOKEN }),
      { params: Promise.resolve({ id: "vision-dd70049", poseId: "front-03" }) });
  };
  const patch = (body: unknown, poseId = "front-03") => changePose(new Request(`https://studio/api/user-models/vision-dd70049/poses/${poseId}`,
    { method: "PATCH", body: JSON.stringify(body), headers: TOKEN }), { params: Promise.resolve({ id: "vision-dd70049", poseId }) });
  const edited = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: "#b8a490" } }).png().toBuffer();

  beforeEach(() => {
    mocks.store.mockResolvedValue({ url: "/user-assets/user-models/vision-dd70049/poses/front-03-rnew.png", thumbUrl: "/user-assets/t.jpg" });
    mocks.setPoses.mockImplementation(async (model: UserModel, poses: UserPose[]) => ({ ...model, poses }));
  });

  it("keeps the face outline, scaled and bound to the new pixels, when the edit is the same shot at another size", async () => {
    const old = await photo(1);
    serve({ [CURRENT]: old });
    mocks.list.mockResolvedValue([await outlined(old)]);
    const bytes = await sharp(old).resize(800, 1200).png().toBuffer();
    const res = await send(bytes);
    const body = await res.json();
    expect(res.status).toBe(200);
    const ref = await referencePixels(bytes);
    expect(body.pose.contour).toMatchObject({ width: 800, height: 1200, sha256: ref.sha256, featherPixels: 16, points: [[240, 160], [560, 160], [560, 600], [240, 600]] });
    expect(body.pose.url).toContain("front-03-rnew");
    expect(body.pose.checks).toMatchObject({ pass: true, outline: { ok: true, reason: "kept from the photo it replaced", carried: { from: CURRENT, moved: false } } });
    expect(body.pose.checks.outline.carried.score).toBeGreaterThan(0.95);
    expect(body.pose.history).toHaveLength(1);
    expect(body.pose.history[0].url).toContain("/front-03.png");
    expect(mocks.detect).not.toHaveBeenCalled();
  });

  it("moves the outline with the face when the same shot was shifted", async () => {
    const old = await photo(1);
    serve({ [CURRENT]: old });
    mocks.list.mockResolvedValue([await outlined(old)]);
    const res = await send(await shifted(old, 24));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pose.checks.outline).toMatchObject({ reason: "moved with the face from the photo it was drawn on", carried: { moved: true } });
    for (const [i, [x, y]] of body.pose.contour.points.entries()) {
      expect(Math.abs(x - (BOX[i][0] + 24))).toBeLessThan(2);
      expect(Math.abs(y - BOX[i][1])).toBeLessThan(2);
    }
  });

  it("asks before the paid automatic outline when the new photo is a different shot, and saves nothing", async () => {
    const old = await photo(1);
    serve({ [CURRENT]: old });
    mocks.list.mockResolvedValue([await outlined(old)]);
    const res = await send(await photo(2));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ ok: false, needsAutoOutline: true });
    expect(body.reason).toContain("different shot");
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.setPoses).not.toHaveBeenCalled();
  });

  it("checks against the photo the outline was drawn on, not one it was carried to", async () => {
    // The pose's outline was carried from front-03.png onto a different photo by the old rule; the same photo sent again
    // must still be refused, because the outline never fitted it.
    const first = await photo(1), wrong = await photo(3);
    const wrongRef = await referencePixels(wrong);
    const model = await outlined(first);
    const original = model.poses![0];
    model.poses![0] = { ...original, url: "/user-assets/user-models/vision-dd70049/poses/front-03-r1.png",
      contour: { ...original.contour!, sha256: wrongRef.sha256 },
      checks: { pass: true, outline: { ok: true, reason: "kept from the photo it replaced" } },
      history: [{ url: original.url, contour: original.contour, checks: original.checks }] };
    serve({ [CURRENT]: first, "/user-assets/user-models/vision-dd70049/poses/front-03-r1.png": wrong });
    mocks.list.mockResolvedValue([model]);
    const res = await send(wrong);
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toContain("different shot");
  });

  it("asks before the paid automatic outline when the shape changed, and saves nothing", async () => {
    const old = await photo(1);
    serve({ [CURRENT]: old });
    mocks.list.mockResolvedValue([await outlined(old)]);
    const res = await send(await edited(60, 60));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ ok: false, needsAutoOutline: true });
    expect(body.reason).toContain("shape changed");
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(mocks.setPoses).not.toHaveBeenCalled();
  });

  it("saves nothing when the photo the outline was drawn on cannot be read", async () => {
    serve({});
    mocks.list.mockResolvedValue([await outlined(await photo(1))]);
    const res = await send(await photo(1));
    expect(res.status).toBe(502);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("finds a new outline only when asked, and drops the upload when none is found", async () => {
    const old = await photo(1);
    serve({ [CURRENT]: old });
    mocks.list.mockResolvedValue([await outlined(old)]);
    mocks.detect.mockResolvedValue(null);
    const res = await send(await edited(60, 60), { autoOutline: "1" });
    expect(res.status).toBe(422);
    expect(mocks.detect).toHaveBeenCalledOnce();
    expect(mocks.unstore).toHaveBeenCalledWith("/user-assets/user-models/vision-dd70049/poses/front-03-rnew.png");
    expect(mocks.setPoses).not.toHaveBeenCalled();
  });

  it("refit: asks before the paid outline when the current photo's outline does not fit, then saves the found one", async () => {
    const first = await photo(1), wrong = await photo(3);
    const wrongRef = await referencePixels(wrong);
    const model = await outlined(first);
    const original = model.poses![0];
    const NOW = "/user-assets/user-models/vision-dd70049/poses/front-03-r1.png";
    model.poses![0] = { ...original, url: NOW, contour: { ...original.contour!, sha256: wrongRef.sha256 },
      checks: { pass: true, outline: { ok: true, reason: "kept from the photo it replaced" } },
      history: [{ url: original.url, contour: original.contour, checks: original.checks }] };
    serve({ [CURRENT]: first, [NOW]: wrong });
    mocks.list.mockResolvedValue([model]);
    const asked = await patch({ outline: "refit" });
    expect(asked.status).toBe(409);
    expect((await asked.json()).needsAutoOutline).toBe(true);
    expect(mocks.detect).not.toHaveBeenCalled();
    const found = { kind: "contour", width: 400, height: 600, sha256: wrongRef.sha256, points: [[100, 60], [260, 60], [260, 280]], featherPixels: 8, source: "auto-draft-v1", detectedAt: "now" };
    mocks.detect.mockResolvedValue(found);
    const res = await patch({ outline: "refit", autoOutline: true });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pose.contour).toEqual(found);
    expect(body.pose.url).toBe(NOW);
    expect(body.pose.history).toHaveLength(1);
    expect(body.pose.checks.outline).toMatchObject({ ok: true, reason: "found automatically" });
  });

  it("Undo puts the replaced photo and its outline back", async () => {
    const old = await photo(1);
    serve({ [CURRENT]: old });
    const model = await outlined(old);
    const original = model.poses![0];
    mocks.list.mockResolvedValue([model]);
    const replaced = (await (await send(await sharp(old).resize(800, 1200).png().toBuffer())).json()).pose as UserPose;
    mocks.list.mockResolvedValue([{ ...model, poses: model.poses!.map((p) => (p.id === "front-03" ? replaced : p)) }]);
    const res = await patch({ undo: true });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pose).toEqual(original);
  });

  it("refuses Undo on a photo that was never replaced", async () => {
    mocks.list.mockResolvedValue([set()]);
    const res = await patch({ undo: true }, "side-05");
    expect(res.status).toBe(409);
  });
});
