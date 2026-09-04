import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The gate on /api/model-shots.
 *
 * Not the generation — that costs money and belongs to the studio's own
 * routes. What is worth locking down here is who gets to spend it: this route
 * is reachable without a session cookie (the proxy skips it), so the token
 * check is the only thing between a stray request and a paid render.
 */

const ORIGINAL = { ...process.env };

async function load() {
  vi.resetModules();
  return await import("./route");
}

function req(headers: Record<string, string> = {}, body?: unknown) {
  return new Request("https://studio.test/api/model-shots", {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.MODEL_SHOTS_TOKEN;
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_SECRET;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("/api/model-shots auth", () => {
  it("refuses everything when no secret is configured", async () => {
    const { GET, POST } = await load();
    expect((await GET(req({ "X-DDTO-TOKEN": "anything" }))).status).toBe(401);
    expect((await POST(req({ "X-DDTO-TOKEN": "" }, { garmentImageUrls: ["/a.jpg"] }))).status).toBe(401);
  });

  it("takes MODEL_SHOTS_TOKEN, and refuses a wrong one", async () => {
    process.env.MODEL_SHOTS_TOKEN = "s3cret";
    const { GET } = await load();
    expect((await GET(req({ "X-DDTO-TOKEN": "s3cret" }))).status).toBe(200);
    expect((await GET(req({ "X-DDTO-TOKEN": "s3crey" }))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
  });

  it("falls back to APP_PASSWORD, which already unlocks the studio anyway", async () => {
    process.env.APP_PASSWORD = "team-password";
    const { GET } = await load();
    expect((await GET(req({ "X-DDTO-TOKEN": "team-password" }))).status).toBe(200);
  });

  it("prefers MODEL_SHOTS_TOKEN once it is set, so the extension key can be rotated alone", async () => {
    process.env.MODEL_SHOTS_TOKEN = "s3cret";
    process.env.APP_PASSWORD = "team-password";
    const { GET } = await load();
    expect((await GET(req({ "X-DDTO-TOKEN": "team-password" }))).status).toBe(401);
  });
});

describe("/api/model-shots request validation", () => {
  beforeEach(() => {
    process.env.MODEL_SHOTS_TOKEN = "s3cret";
  });

  it("needs a garment photo and a model to put it on", async () => {
    const { POST } = await load();
    const auth = { "X-DDTO-TOKEN": "s3cret" };
    const noPhoto = await POST(req(auth, { humanModelId: "kylie 1", poseId: "kylie 1" }));
    expect(noPhoto.status).toBe(400);
    expect((await noPhoto.json()).error).toMatch(/garmentImageUrls/);
    const noModel = await POST(req(auth, { garmentImageUrls: ["https://x/a.jpg"] }));
    expect(noModel.status).toBe(400);
    expect((await noModel.json()).error).toMatch(/humanModelId/);
  });

  it("answers a preflight, since the caller is an extension service worker", async () => {
    const { OPTIONS } = await load();
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-DDTO-TOKEN");
  });
});
