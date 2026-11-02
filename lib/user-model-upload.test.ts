// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { localIncomingFile, readIncomingPhoto, removeIncoming, validIncomingPath } from "./user-model-upload";

const written: string[] = [];
async function incoming(bytes: Buffer, ext: string): Promise<string> {
  const key = `user-models/incoming/${randomUUID()}.${ext}`;
  await fs.mkdir(path.dirname(localIncomingFile(key)), { recursive: true });
  await fs.writeFile(localIncomingFile(key), bytes);
  written.push(localIncomingFile(key));
  return `/user-assets/${key}`;
}
const png = (width: number, height: number, alpha = 1) =>
  sharp({ create: { width, height, channels: 4, background: { r: 240, g: 230, b: 215, alpha } } }).png().toBuffer();

beforeEach(() => { delete process.env.BLOB_READ_WRITE_TOKEN; });
afterEach(async () => {
  for (const f of written.splice(0)) await fs.rm(f, { force: true });
  vi.unstubAllGlobals();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("Add model direct uploads", () => {
  it("only accepts this form's incoming paths", () => {
    expect(validIncomingPath(`user-models/incoming/${randomUUID()}.png`)).toBe(true);
    expect(validIncomingPath(`user-models/incoming/${randomUUID()}.jpg`)).toBe(true);
    expect(validIncomingPath(`user-models/abc/front.png`)).toBe(false);
    expect(validIncomingPath(`user-models/incoming/../x.png`)).toBe(false);
    expect(validIncomingPath(`user-models/incoming/${randomUUID()}.gif`)).toBe(false);
  });

  it("keeps a large PNG with transparency byte for byte", async () => {
    const bytes = await png(3000, 4000, 0.98);
    const file = await readIncomingPhoto(await incoming(bytes, "png"), "front");
    expect(file.name).toBe("front.png");
    expect(file.type).toBe("image/png");
    expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
  });

  it("scales a photo over 4096 px per side to fit, in its own format", async () => {
    const file = await readIncomingPhoto(await incoming(await png(5000, 200), "png"), "side");
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 4096, 164]);
  });

  it("turns a camera-rotated JPEG upright", async () => {
    const jpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#ddd" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const file = await readIncomingPhoto(await incoming(jpeg, "jpg"), "back");
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    expect([file.type, meta.width, meta.height, meta.orientation ?? 1]).toEqual(["image/jpeg", 400, 600, 1]);
  });

  it("refuses links that are not this form's uploads, without fetching them", async () => {
    await expect(readIncomingPhoto("/user-assets/user-models/abc/front.png", "front")).rejects.toThrow(/only photos uploaded from this form/);
    await expect(readIncomingPhoto("https://example.com/x.png", "front")).rejects.toThrow(/only photos uploaded from this form/);
    process.env.BLOB_READ_WRITE_TOKEN = "test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(readIncomingPhoto(`https://evil.example.com/user-models/incoming/${randomUUID()}.png`, "front")).rejects.toThrow(/only photos uploaded from this form/);
    await expect(readIncomingPhoto(`https://abc.public.blob.vercel-storage.com/user-models/x/front.png`, "front")).rejects.toThrow(/only photos uploaded from this form/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a still PNG, JPEG or WebP", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    await expect(readIncomingPhoto(await incoming(gif, "png"), "front")).rejects.toThrow(/PNG, JPEG or WebP/);
  });

  it("removes the incoming copy after a save and ignores other paths", async () => {
    const url = await incoming(await png(10, 10), "png");
    await removeIncoming([url, "/user-assets/user-models/keep/front.png"]);
    await expect(fs.stat(localIncomingFile(url.replace("/user-assets/", "")))).rejects.toThrow();
  });
});
