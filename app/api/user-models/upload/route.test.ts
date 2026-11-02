// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { GET, POST } from "./route";
import { POST as SAVE } from "../route";
import { localIncomingFile } from "@/lib/user-model-upload";

const auth = { "x-ddto-token": "upload-test" };
beforeEach(() => { process.env.MODEL_SHOTS_TOKEN = "upload-test"; delete process.env.AUTH_SECRET; delete process.env.BLOB_READ_WRITE_TOKEN; });
afterEach(() => { delete process.env.MODEL_SHOTS_TOKEN; });

describe("Add model upload route", () => {
  it("refuses requests without the token or a session", async () => {
    expect((await GET(new Request("https://studio/api/user-models/upload"))).status).toBe(401);
    expect((await POST(new Request("https://studio/api/user-models/upload", { method: "POST", body: new FormData() }))).status).toBe(401);
  });

  it("says whether photos go to Blob", async () => {
    expect(await (await GET(new Request("https://studio/api/user-models/upload", { headers: auth }))).json()).toEqual({ cloud: false });
  });

  it("stores a posted original untouched on local dev and refuses other types", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const form = new FormData();
    form.append("file", new File([bytes], "front.png", { type: "image/png" }));
    const res = await POST(new Request("https://studio/api/user-models/upload", { method: "POST", body: form, headers: auth }));
    const body = await res.json();
    const { url } = body;
    expect(url).toMatch(/^\/user-assets\/user-models\/incoming\/[a-f0-9-]{36}\.png$/);
    const file = localIncomingFile(url.replace("/user-assets/", ""));
    expect(new Uint8Array(await fs.readFile(file))).toEqual(bytes);
    await fs.rm(file, { force: true });
    const heic = new FormData();
    heic.append("file", new File([bytes], "front.heic", { type: "image/heic" }));
    expect((await POST(new Request("https://studio/api/user-models/upload", { method: "POST", body: heic, headers: auth }))).status).toBe(400);
  });

  it("refuses a save whose photo link is not one of this form's uploads", async () => {
    const form = new FormData();
    form.append("name", "Upload test");
    form.append("frontUrl", "https://example.com/front.png");
    const res = await SAVE(new Request("https://studio/api/user-models", { method: "POST", body: form, headers: auth }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Front photo: Upload the photo again/);
  });
});
