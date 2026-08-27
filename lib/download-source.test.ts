import { describe, expect, it } from "vitest";
import { resolveDownloadSource, safeDownloadName } from "./download-source";

describe("download source allowlist", () => {
  it("accepts the hosts that actually serve renders", () => {
    for (const url of [
      "https://v3.fal.media/files/x/y.jpg",
      "https://fal.media/files/y.jpg",
      "https://abc.public.blob.vercel-storage.com/z.png",
    ]) {
      expect(resolveDownloadSource(url).ok).toBe(true);
    }
  });

  // The whole reason this module exists: an open fetch proxy can be pointed at
  // the deploy's own network.
  it("refuses anything else", () => {
    expect(resolveDownloadSource("https://169.254.169.254/latest/meta-data/")).toEqual({
      ok: false,
      reason: "host",
    });
    expect(resolveDownloadSource("https://evil.test/x.jpg").ok).toBe(false);
    expect(resolveDownloadSource("http://v3.fal.media/x.jpg")).toEqual({
      ok: false,
      reason: "protocol",
    });
    expect(resolveDownloadSource("file:///etc/passwd").ok).toBe(false);
    expect(resolveDownloadSource("data:image/png;base64,AAAA").ok).toBe(false);
  });

  // "evil-fal.media" ends with "fal.media" as a string but is not a subdomain.
  it("does not treat a lookalike domain as a subdomain", () => {
    expect(resolveDownloadSource("https://evilfal.media/x.jpg").ok).toBe(false);
    expect(resolveDownloadSource("https://fal.media.evil.test/x.jpg").ok).toBe(false);
  });

  it("allows kie.ai's tempfile host, where every Model Studio render lives", () => {
    // generate-model passes outputSize: null, so resizeGeneratedImages hands
    // kie's URL back untouched — these are never re-hosted onto fal.
    const real =
      "https://tempfile.aiquickdraw.com/h/9b1d464aeae6c794cdbd28855bf8f9cb_1786723589.png";
    expect(resolveDownloadSource(real).ok).toBe(true);
  });

  it("does not let a lookalike host ride in on the kie entry", () => {
    expect(resolveDownloadSource("https://tempfile.aiquickdraw.com.evil.test/x.png").ok).toBe(
      false
    );
    expect(resolveDownloadSource("https://eviltempfile.aiquickdraw.com/x.png").ok).toBe(false);
  });

  it("refuses nothing at all", () => {
    expect(resolveDownloadSource(null).ok).toBe(false);
    expect(resolveDownloadSource("").ok).toBe(false);
    expect(resolveDownloadSource("not a url").ok).toBe(false);
  });
});

describe("download filename", () => {
  it("keeps an ordinary studio filename intact", () => {
    expect(safeDownloadName("DWTS67099-7ea3-1.jpg", "x.jpg")).toBe("DWTS67099-7ea3-1.jpg");
  });

  it("cannot climb out of a directory or split the header", () => {
    expect(safeDownloadName("../../etc/passwd", "x.jpg")).toBe("etc-passwd");
    expect(safeDownloadName('a"\r\nContent-Type: text/html', "x.jpg")).toBe(
      "aContent-Typetext-html"
    );
  });

  it("falls back rather than returning an empty name", () => {
    expect(safeDownloadName("///", "davidani.jpg")).toBe("davidani.jpg");
    expect(safeDownloadName("...", "davidani.jpg")).toBe("davidani.jpg");
    expect(safeDownloadName(null, "davidani.jpg")).toBe("davidani.jpg");
  });
});
