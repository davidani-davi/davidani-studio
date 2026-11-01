import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referencePixels } from "@/lib/garment-only";
import type { UserModel } from "@/lib/user-assets";
import type { UserPose } from "@/lib/user-poses";

const mocks = vi.hoisted(() => ({ list: vi.fn(), savePoses: vi.fn(), setPoses: vi.fn(), detect: vi.fn() }));
vi.mock("@/lib/user-assets", async (original) => ({
  ...(await original<typeof import("@/lib/user-assets")>()),
  listUserModels: mocks.list, saveUserModelPoses: mocks.savePoses, setUserModelPoses: mocks.setPoses,
}));
vi.mock("@/lib/draft-contour", () => ({ detectAutoContour: mocks.detect }));

import { POST } from "./route";
import { GET as listPoses } from "./[id]/poses/route";
import { PATCH as changePose } from "./[id]/poses/[poseId]/route";

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
