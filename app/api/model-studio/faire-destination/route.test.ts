import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const req = (style: string) => new Request(`http://localhost/api/model-studio/faire-destination?style=${encodeURIComponent(style)}`);
let upstream: { status: number; body: unknown };
let seen: { url: string; init: RequestInit }[];
beforeEach(() => {
  vi.stubEnv("FAIRE_DAILY_TOKEN", "test-token");
  upstream = { status: 200, body: { productId: "p_abc", state: "DRAFT", ready: {} } };
  seen = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => { seen.push({ url, init }); return Promise.resolve(new Response(JSON.stringify(upstream.body), { status: upstream.status })); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/model-studio/faire-destination", () => {
  it("asks Faire Daily's read-only listing lookup and returns the listing link", async () => {
    const res = await GET(req("dt78080"));
    expect(await res.json()).toEqual({ ok: true, style: "DT78080", productId: "p_abc", state: "DRAFT", url: "https://www.faire.com/brand-portal/my-shop/products/p_abc" });
    expect(seen[0].url).toBe("https://faire-daily.vercel.app/api/listing-assets");
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ type: "listing-destination", style: "DT78080" });
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("answers 503 without the token and never calls out", async () => {
    vi.stubEnv("FAIRE_DAILY_TOKEN", "");
    const res = await GET(req("DT78080"));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not-configured");
    expect(seen).toHaveLength(0);
  });

  it("refuses a bad style and drops a malformed listing id", async () => {
    expect((await GET(req("../x"))).status).toBe(400);
    upstream = { status: 200, body: { productId: "javascript:alert(1)", state: "DRAFT" } };
    expect(await (await GET(req("DT1"))).json()).toMatchObject({ ok: true, productId: null, url: null });
  });

  it("passes on Faire Daily's refusals as errors", async () => {
    upstream = { status: 401, body: { error: "Private access required." } };
    const res = await GET(req("DT1"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Private access required.");
  });
});
