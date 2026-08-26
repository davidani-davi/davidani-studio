import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function call(query: string) {
  return GET(new Request(`https://studio.test/api/download?${query}`));
}
const REAL = "https://v3.fal.media/files/rabbit/run.jpg";
const encoded = `url=${encodeURIComponent(REAL)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubUpstream(init: {
  status?: number;
  type?: string | null;
  body?: string | null;
}) {
  const fetchMock = vi.fn(async () => {
    const headers = new Headers();
    if (init.type) headers.set("content-type", init.type);
    return new Response(init.body === null ? null : init.body ?? "JPEGBYTES", {
      status: init.status ?? 200,
      headers,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("download route", () => {
  it("streams an allowlisted image back as an attachment", async () => {
    const fetchMock = stubUpstream({ type: "image/jpeg" });
    const res = await call(`${encoded}&name=DWTS67099-7ea3-1.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="DWTS67099-7ea3-1.jpg"'
    );
    expect(await res.text()).toBe("JPEGBYTES");
    // manual, so an allowlisted host cannot redirect this onto one that isn't.
    expect(fetchMock).toHaveBeenCalledWith(new URL(REAL), { redirect: "manual" });
  });

  it("refuses a host that is not ours, without fetching it", async () => {
    const fetchMock = stubUpstream({ type: "image/jpeg" });
    const res = await call(`url=${encodeURIComponent("https://169.254.169.254/latest/")}`);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a URL that resolves to something other than an image", async () => {
    stubUpstream({ type: "text/html" });
    expect((await call(encoded)).status).toBe(415);
  });

  it("reports an upstream failure rather than a broken file", async () => {
    stubUpstream({ status: 404, type: "image/jpeg" });
    expect((await call(encoded)).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect((await call(encoded)).status).toBe(502);
  });

  it("falls back to a usable name when none is given", async () => {
    stubUpstream({ type: "image/png" });
    const res = await call(encoded);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="davidani-render.jpg"'
    );
  });
});
