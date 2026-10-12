import { describe, expect, it, vi } from "vitest";
import { uploadImages, type UploadDeps } from "@/lib/upload-images";
import { canUploadDirect, directUploadFileName } from "@/lib/direct-upload";

const file = (name: string, type: string, bytes = 1000) =>
  new File([new Uint8Array(bytes)], name, { type });

function deps(over: Partial<UploadDeps> = {}) {
  return {
    initiate: vi.fn(async (files: { name: string; type: string; size: number }[]) =>
      files.map((f) =>
        canUploadDirect(f)
          ? { name: f.name, uploadUrl: `https://up/${f.name}`, url: `https://cdn/${f.name}` }
          : null
      )
    ),
    put: vi.fn(async (_url: string, f: File, onLoaded: (n: number) => void) => onLoaded(f.size)),
    viaServer: vi.fn(async (_label: string, files: File[]) =>
      files.map((f) => ({ name: f.name, url: `https://server/${f.name}` }))
    ),
    ...over,
  };
}

describe("uploadImages", () => {
  it("sends PNG/JPEG straight to storage and never touches /api/upload", async () => {
    const d = deps();
    const progress: number[] = [];
    const out = await uploadImages("Upload", [file("front.jpg", "image/jpeg"), file("back.png", "image/png")], {
      deps: d,
      onProgress: (f) => progress.push(f),
    });
    expect(out).toEqual([
      { name: "front.jpg", url: "https://cdn/front.jpg" },
      { name: "back.png", url: "https://cdn/back.png" },
    ]);
    expect(d.put).toHaveBeenCalledTimes(2);
    expect(d.viaServer).not.toHaveBeenCalled();
    expect(progress.at(-1)).toBe(1);
  });

  it("routes only the files that can't go direct through /api/upload, keeping order", async () => {
    const d = deps();
    const out = await uploadImages("Upload", [file("a.webp", "image/webp"), file("b.jpg", "image/jpeg")], { deps: d });
    expect(out.map((u) => u.url)).toEqual(["https://server/a.webp", "https://cdn/b.jpg"]);
    expect(d.viaServer.mock.calls[0][1].map((f: File) => f.name)).toEqual(["a.webp"]);
  });

  it("falls back to /api/upload for a file whose direct upload fails", async () => {
    const d = deps({
      put: vi.fn(async (url: string) => {
        if (url.endsWith("b.jpg")) throw new Error("network error");
      }),
    });
    const out = await uploadImages("Upload", [file("a.jpg", "image/jpeg"), file("b.jpg", "image/jpeg")], { deps: d });
    expect(out.map((u) => u.url)).toEqual(["https://cdn/a.jpg", "https://server/b.jpg"]);
  });

  it("uses /api/upload for everything when signing fails", async () => {
    const d = deps({ initiate: vi.fn(async () => { throw new Error("HTTP 500"); }) });
    const out = await uploadImages("Upload", [file("a.jpg", "image/jpeg")], { deps: d });
    expect(out).toEqual([{ name: "a.jpg", url: "https://server/a.jpg" }]);
  });

  it("does not ask for signed URLs when no file can go direct", async () => {
    const d = deps();
    await uploadImages("Upload", [file("a.gif", "image/gif")], { deps: d });
    expect(d.initiate).not.toHaveBeenCalled();
  });

  it("fails loudly when /api/upload returns the wrong number of files", async () => {
    const d = deps({ viaServer: vi.fn(async () => []) });
    await expect(uploadImages("Upload", [file("a.gif", "image/gif")], { deps: d })).rejects.toThrow(
      "Upload: upload returned 0 of 1 files"
    );
  });
});

describe("direct upload rules", () => {
  it("lets only PNG and JPEG within the size cap go direct", () => {
    expect(canUploadDirect({ name: "a.png", type: "image/png", size: 10 })).toBe(true);
    expect(canUploadDirect({ name: "a.jpg", type: "IMAGE/JPEG", size: 10 })).toBe(true);
    expect(canUploadDirect({ name: "a.webp", type: "image/webp", size: 10 })).toBe(false);
    expect(canUploadDirect({ name: "a.jpg", type: "", size: 10 })).toBe(false);
    expect(canUploadDirect({ name: "a.jpg", type: "image/jpeg", size: 0 })).toBe(false);
    expect(canUploadDirect({ name: "a.jpg", type: "image/jpeg", size: 26 * 1024 * 1024 })).toBe(false);
  });

  it("names the stored file with the extension of its real type", () => {
    expect(directUploadFileName("DWTS67099 front.jpg", "image/jpeg")).toBe("DWTS67099 front.jpg");
    expect(directUploadFileName("photo.jpeg", "image/png")).toBe("photo.png");
    expect(directUploadFileName("a/b\\c.png", "image/png")).toBe("a-b-c.png");
    expect(directUploadFileName("", "image/jpeg")).toBe("upload.jpg");
  });
});
