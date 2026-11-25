// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory Blob store: put writes, list lists, fetch reads by URL, del removes.
const blobs = new Map<string, { pathname: string; url: string; uploadedAt: Date; body: string }>();
let clock = 1_000;
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: string) => {
    const url = `https://blob.test/${pathname}`;
    blobs.set(url, { pathname, url, uploadedAt: new Date(clock++), body });
    return { url, pathname };
  }),
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({
    blobs: [...blobs.values()].filter((b) => b.pathname.startsWith(prefix)).map(({ body: _b, ...rest }) => rest),
    hasMore: false,
  })),
  del: vi.fn(async (urls: string[]) => urls.forEach((u) => blobs.delete(u))),
}));

import { GET, PUT } from "./route";

const TOKEN = "studio-token";
const headers = (token: string | null = TOKEN) => ({ "content-type": "application/json", ...(token ? { "x-ddto-token": token } : {}) });
const get = (style: string, token?: string | null) => GET(new Request(`https://studio/api/model-studio/workspace?style=${style}`, { headers: headers(token) }));
const put = (body: unknown, token?: string | null) =>
  PUT(new Request("https://studio/api/model-studio/workspace", { method: "PUT", headers: headers(token), body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  blobs.clear();
  process.env.MODEL_SHOTS_TOKEN = TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "blob";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const hit = blobs.get(url);
    return hit ? new Response(hit.body, { status: 200 }) : new Response("missing", { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("model studio workspace route", () => {
  it("refuses a request with no session or studio key", async () => {
    delete process.env.AUTH_SECRET;
    expect((await get("DT78080", null)).status).toBe(401);
    expect((await put({ style: "DT78080", revision: 0, studio: {} }, "wrong-token")).status).toBe(401);
  });

  it("reads an unsaved style as revision 0 with no setup", async () => {
    const res = await get("dt78080");
    expect(await res.json()).toEqual({ ok: true, style: "DT78080", revision: 0, savedAt: null, studio: null });
  });

  it("saves a setup and reads back the newest version", async () => {
    const first = await (await put({ style: "DT78080", revision: 0, studio: { color: "NAVY" } })).json();
    expect(first).toMatchObject({ ok: true, style: "DT78080", revision: 1 });
    const second = await (await put({ style: "DT78080", revision: 1, studio: { color: "BLACK" } })).json();
    expect(second.revision).toBe(2);
    const read = await (await get("DT78080")).json();
    expect(read).toMatchObject({ revision: 2, studio: { color: "BLACK" } });
    // Each save is a new file; the older one is tidied away.
    const files = [...blobs.values()].map((b) => b.pathname);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^model-studio\/DT78080\/[0-9a-z]+-[0-9a-z]+\.json$/);
  });

  it("answers 409 with the saved version when the revision is stale", async () => {
    await put({ style: "DT78080", revision: 0, studio: { color: "NAVY" } });
    const res = await put({ style: "DT78080", revision: 0, studio: { color: "RED" } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "conflict", current: { revision: 1, studio: { color: "NAVY" } } });
    expect((await (await get("DT78080")).json()).studio).toEqual({ color: "NAVY" });
  });

  it("rejects bad input", async () => {
    expect((await get("??")).status).toBe(400);
    expect((await put("not json")).status).toBe(400);
    expect((await put({ style: "DT78080", revision: -1, studio: {} })).status).toBe(400);
    expect((await put({ style: "DT78080", revision: 0, studio: [] })).status).toBe(400);
    expect((await put({ style: "DT78080", revision: 0, studio: { big: "x".repeat(300_000) } })).status).toBe(413);
  });

  it("reports a failed Blob read as 502", async () => {
    await put({ style: "DT78080", revision: 0, studio: {} });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    expect((await get("DT78080")).status).toBe(502);
  });

  it("keeps the record on local disk when there is no Blob token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ms-ws-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      expect((await (await get("DP43109")).json()).revision).toBe(0);
      expect((await (await put({ style: "DP43109", revision: 0, studio: { color: "BLACK" } })).json()).revision).toBe(1);
      expect((await put({ style: "DP43109", revision: 0, studio: {} })).status).toBe(409);
      expect((await (await get("DP43109")).json()).studio).toEqual({ color: "BLACK" });
      expect(blobs.size).toBe(0);
    } finally {
      cwd.mockRestore();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
