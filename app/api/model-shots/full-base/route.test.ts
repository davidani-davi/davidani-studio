import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const put = vi.hoisted(() => vi.fn(async (key: string) => ({ url: `https://abc.public.blob.vercel-storage.com/${key}` })));
vi.mock("@vercel/blob", () => ({ put }));
import { POST } from "./route";
import { isFullBodyBase } from "@/lib/full-body-base";
function request(body: object, token = "test") {
  vi.stubEnv("MODEL_SHOTS_TOKEN", "test");
  return new Request("https://studio.test/api/model-shots/full-base", { method: "POST", headers: { "Content-Type": "application/json", "X-DDTO-TOKEN": token }, body: JSON.stringify(body) });
}
const photo = async (w: number, h: number) => "data:image/png;base64," + (await sharp({ create: { width: w, height: h, channels: 3, background: "#ccbbaa" } }).png().toBuffer()).toString("base64");
afterEach(() => { vi.unstubAllEnvs(); put.mockClear(); });
describe("full-body base upload", () => {
  it("stores a portrait photo in Blob and answers a URL the shot route accepts", async () => {
    const data = await (await POST(request({ dataUrl: await photo(1200, 1800) }))).json();
    expect(data.ok).toBe(true); expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toMatch(/^full-bases\/[0-9a-f]{24}\.jpg$/);
    expect(isFullBodyBase(data.url)).toBe(true);
  });
  it("refuses a missing token, a non-image and a landscape photo before storing", async () => {
    expect((await POST(request({ dataUrl: await photo(1200, 1800) }, "nope"))).status).toBe(401);
    expect((await POST(request({ dataUrl: "data:text/html;base64,PGI+" }))).status).toBe(400);
    expect((await POST(request({ dataUrl: await photo(1800, 1200) }))).status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });
  it("accepts ERP style photos and Blob images only", () => {
    expect(isFullBodyBase("https://system.davidani.com/upload/style/DP62024A_1.jpg")).toBe(true);
    expect(isFullBodyBase("https://system.davidani.com//upload//style/DP60245_12.png")).toBe(true);
    expect(isFullBodyBase("https://system.davidani.com/data/x.asp")).toBe(false);
    expect(isFullBodyBase("http://system.davidani.com/upload/style/a.jpg")).toBe(false);
    expect(isFullBodyBase("https://evil.example/upload/style/a.jpg")).toBe(false);
  });
});
