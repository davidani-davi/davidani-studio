import { describe, expect, it, beforeEach } from "vitest";
import { DELETE, GET, POST } from "./route";

// The Listing Team portal saves draft reference sets here with X-DDTO-TOKEN; the route
// is public in proxy.ts, so it must refuse anything without the token or a session.
describe("user-models auth", () => {
  beforeEach(() => { process.env.MODEL_SHOTS_TOKEN = "user-models-test"; delete process.env.AUTH_SECRET; });
  it("refuses requests without the token", async () => {
    expect((await GET(new Request("https://studio/api/user-models"))).status).toBe(401);
    expect((await POST(new Request("https://studio/api/user-models", { method: "POST", body: new FormData() }))).status).toBe(401);
    expect((await DELETE(new Request("https://studio/api/user-models?id=x", { method: "DELETE" }))).status).toBe(401);
    expect((await POST(new Request("https://studio/api/user-models", { method: "POST", body: new FormData(), headers: { "x-ddto-token": "wrong" } }))).status).toBe(401);
  });
  it("accepts the token and validates the form", async () => {
    const res = await POST(new Request("https://studio/api/user-models", { method: "POST", body: new FormData(), headers: { "x-ddto-token": "user-models-test" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name/);
  });
});
