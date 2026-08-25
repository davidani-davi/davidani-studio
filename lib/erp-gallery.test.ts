// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetErpCache } from "./erp-category";
import { buildGalleryContactSheet, fetchGalleryUrls } from "./erp-gallery";

const OLD = { id: process.env.ERP_USER_ID, pw: process.env.ERP_PASSWORD };
beforeEach(() => __resetErpCache());
afterEach(() => {
  vi.unstubAllGlobals();
  process.env.ERP_USER_ID = OLD.id;
  process.env.ERP_PASSWORD = OLD.pw;
});

const LOGIN = {
  ok: true,
  url: "https://system.davidani.com/xt.login.asp",
  headers: { getSetCookie: () => ["ASPSESSIONIDX=abc; path=/"], get: () => "text/html" },
  text: async () => "",
};
const MAIN = {
  ok: true,
  url: "https://system.davidani.com/main.asp",
  headers: { getSetCookie: () => [], get: () => "text/html" },
  text: async () => "<html>dashboard</html>",
};

function stub(handlers: Array<(url: string) => any | null>) {
  process.env.ERP_USER_ID = "u";
  process.env.ERP_PASSWORD = "p";
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: any) => {
      const url = String(input);
      n += 1;
      if (n === 1) return LOGIN;
      if (n === 2) return MAIN;
      for (const h of handlers) {
        const r = h(url);
        if (r) return r;
      }
      return { ok: false, url, headers: { getSetCookie: () => [], get: () => "" }, text: async () => "" };
    })
  );
}

const text = (body: string) => ({
  ok: true,
  url: "x",
  headers: { getSetCookie: () => [], get: () => "text/html" },
  text: async () => body,
});

describe("gallery URL discovery", () => {
  it("is inert without credentials", async () => {
    process.env.ERP_USER_ID = "";
    process.env.ERP_PASSWORD = "";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchGalleryUrls("DDT9040")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns nothing for a blank style", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchGalleryUrls("")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("collects T_ thumbnails across colourways and de-duplicates", async () => {
    stub([
      (u) =>
        u.includes("Style.barcode.Json.asp")
          ? text(`({"results":[{"idStyle":"DDT9040","color":"1"},{"idStyle":"DDT9040","color":"2"},{"idStyle":"OTHER","color":"9"}]})`)
          : null,
      (u) =>
        u.includes("styleimage.asp")
          ? text(
              `<img src="https://system.davidani.com/upload//style//T_a.jpg">` +
                `<img src="https://system.davidani.com/upload/style/T_b.png">` +
                `<img src="https://system.davidani.com/upload/style/T_a.jpg">` +
                `<img src="https://system.davidani.com/upload/style/full.jpg">`
            )
          : null,
    ]);
    const urls = await fetchGalleryUrls("DDT9040");
    // doubled slashes collapsed, https:// preserved, non-T_ ignored, deduped
    expect(urls).toEqual([
      "https://system.davidani.com/upload/style/T_a.jpg",
      "https://system.davidani.com/upload/style/T_b.png",
    ]);
    expect(urls.some((u) => u.includes("full.jpg"))).toBe(false);
  });

  it("ignores rows belonging to a different style", async () => {
    stub([
      (u) =>
        u.includes("Style.barcode.Json.asp")
          ? text(`({"results":[{"idStyle":"SOMETHINGELSE","color":"7"}]})`)
          : null,
    ]);
    expect(await fetchGalleryUrls("DDT9040")).toEqual([]);
  });

  it("survives an unparseable barcode response", async () => {
    stub([(u) => (u.includes("Style.barcode.Json.asp") ? text("<html>error</html>") : null)]);
    expect(await fetchGalleryUrls("DDT9040")).toEqual([]);
  });
});

describe("contact sheet", () => {
  // Below three frames there is nothing to cross-reference, so the caller
  // should fall back to the intake photo rather than build a useless sheet.
  it("declines to build from too few frames", async () => {
    stub([
      (u) =>
        u.includes("Style.barcode.Json.asp")
          ? text(`({"results":[{"idStyle":"X","color":"1"}]})`)
          : null,
      (u) =>
        u.includes("styleimage.asp")
          ? text(`<img src="https://system.davidani.com/upload/style/T_only.jpg">`)
          : null,
    ]);
    expect(await buildGalleryContactSheet("X")).toBeNull();
  });

  it("returns null when the style has no gallery at all", async () => {
    stub([
      (u) => (u.includes("Style.barcode.Json.asp") ? text(`({"results":[]})`) : null),
    ]);
    expect(await buildGalleryContactSheet("X")).toBeNull();
  });

  it("never throws — a mid-flight failure yields null", async () => {
    process.env.ERP_USER_ID = "u";
    process.env.ERP_PASSWORD = "p";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    expect(await buildGalleryContactSheet("DDT9040")).toBeNull();
  });
});
