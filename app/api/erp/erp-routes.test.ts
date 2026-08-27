import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/erp-category", () => ({
  ERP_BASE: "https://system.davidani.com",
  erpFetchBytes: vi.fn(),
}));
vi.mock("@/lib/erp-gallery", () => ({ fetchGalleryUrls: vi.fn() }));
vi.mock("@/lib/fal", () => ({ uploadToFal: vi.fn() }));
const { erpFetchBytes } = await import("@/lib/erp-category");
const { fetchGalleryUrls } = await import("@/lib/erp-gallery");
const { uploadToFal } = await import("@/lib/fal");
const { GET: getPhoto } = await import("./photo/route");
const { GET: getPhotos } = await import("./photos/route");
const { POST: postImport } = await import("./import/route");

const DIR = "https://system.davidani.com/upload/style/";
const THUMB = `${DIR}T_DWTS67099 CHARCOAL_1.png`;
const FULL = `${DIR}DWTS67099 CHARCOAL_1.png`;

afterEach(() => vi.resetAllMocks());

describe("photo proxy", () => {
  it("serves an ERP style photo it was allowed to fetch", async () => {
    vi.mocked(erpFetchBytes).mockResolvedValue(Buffer.from("PNGDATA"));
    const res = await getPhoto(
      new Request(`https://s.test/api/erp/photo?src=${encodeURIComponent(THUMB)}`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    // Authenticated content must never land in a shared cache.
    expect(res.headers.get("cache-control")).toContain("private");
  });

  // The proxy carries the ERP session, so this is the check that keeps it from
  // being an authenticated read of the whole ERP.
  it("refuses a non-photo path without touching the ERP", async () => {
    const res = await getPhoto(
      new Request("https://s.test/api/erp/photo?src=https%3A%2F%2Fsystem.davidani.com%2Fmain.asp")
    );
    expect(res.status).toBe(400);
    expect(erpFetchBytes).not.toHaveBeenCalled();
  });
});

describe("style listing", () => {
  it("groups a style's frames by colourway and proxies every thumbnail", async () => {
    vi.mocked(fetchGalleryUrls).mockResolvedValue([
      `${DIR}T_DWTS67099 CHARCOAL_2.png`,
      `${DIR}T_DWTS67099 CHARCOAL_1.png`,
      `${DIR}T_DWTS67099 BLACK_1.png`,
      `${DIR}logo.png`,
    ]);
    const res = await getPhotos(new Request("https://s.test/api/erp/photos?style=dwts67099"));
    const body = await res.json();
    expect(body.style).toBe("DWTS67099");
    // "logo.png" is not named for this style — foreign files really do leak
    // into shared galleries, and mixed in they make the gallery look wrong.
    expect(body.groups.map((g: any) => g.colorway)).toEqual([
      "CHARCOAL",
      "BLACK",
      "Other files in this gallery",
    ]);
    expect(body.groups[2].foreign).toBe(true);
    // Frames in the ERP's own order, and the stray non-frame file dropped.
    expect(body.groups[0].photos.map((p: any) => p.index)).toEqual([1, 2]);
    expect(body.groups[0].photos[0].thumb).toBe(
      `/api/erp/photo?src=${encodeURIComponent(`${DIR}T_DWTS67099 CHARCOAL_1.png`)}`
    );
    expect(body.groups[0].photos[0].full).toBe(FULL);
  });

  // Photos live on the regular twin, so a Plus code otherwise looks empty.
  it("sends a Plus code to its regular twin and says it did", async () => {
    vi.mocked(fetchGalleryUrls).mockResolvedValue([]);
    const res = await getPhotos(new Request("https://s.test/api/erp/photos?style=PEP42167"));
    const body = await res.json();
    expect(fetchGalleryUrls).toHaveBeenCalledWith("DEP42167");
    expect(body.style).toBe("DEP42167");
    expect(body.regularizedFrom).toBe("PEP42167");
  });

  it("asks for a style rather than crawling for nothing", async () => {
    const res = await getPhotos(new Request("https://s.test/api/erp/photos?style=%20"));
    expect(res.status).toBe(400);
    expect(fetchGalleryUrls).not.toHaveBeenCalled();
  });
});

describe("import", () => {
  // The picker browses 32 KB thumbnails; what the model reads has to be the
  // 4.8 MB original.
  it("fetches the original even when handed a thumbnail", async () => {
    vi.mocked(erpFetchBytes).mockResolvedValue(Buffer.from("BIG"));
    vi.mocked(uploadToFal).mockResolvedValue("https://fal.media/x.png");
    const res = await postImport(
      new Request("https://s.test/api/erp/import", {
        method: "POST",
        body: JSON.stringify({ src: THUMB }),
      })
    );
    expect(erpFetchBytes).toHaveBeenCalledWith(FULL);
    expect(await res.json()).toMatchObject({
      ok: true,
      url: "https://fal.media/x.png",
      colorway: "DWTS67099 CHARCOAL",
      index: 1,
    });
    // Keeps the ERP's own filename, so the intake is traceable to its frame.
    expect(vi.mocked(uploadToFal).mock.calls[0][1]).toBe("DWTS67099-CHARCOAL_1.png");
  });

  it("refuses a source outside the style photo directory", async () => {
    const res = await postImport(
      new Request("https://s.test/api/erp/import", {
        method: "POST",
        body: JSON.stringify({ src: "https://evil.test/upload/style/x.png" }),
      })
    );
    expect(res.status).toBe(400);
    expect(erpFetchBytes).not.toHaveBeenCalled();
  });

  it("reports an ERP read that came back empty", async () => {
    vi.mocked(erpFetchBytes).mockResolvedValue(null);
    const res = await postImport(
      new Request("https://s.test/api/erp/import", {
        method: "POST",
        body: JSON.stringify({ src: FULL }),
      })
    );
    expect(res.status).toBe(502);
  });
});
