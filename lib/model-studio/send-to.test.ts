import { describe, expect, it } from "vitest";
import { crc32, exportRows, exportZipName, faireHandoffUrl, faireStateLabel, manifestCsv, savedIdsFor, zipFiles } from "./send-to";
import type { Slot } from "./types";

const slot = (view: string, url: string, over: Partial<Slot> = {}) => ({ view, status: "done", url, error: "", approved: true, editMode: "simple", ...over }) as unknown as Slot;

describe("ERP file export", () => {
  it("names each kept view with the extension's file-name rules and numbers a second take", () => {
    const rows = exportRows("dt78080", "Navy Blue", [slot("front", "https://fal.media/f.png"), slot("back", "https://fal.media/b.png"), slot("front", "https://fal.media/f2.png")], "studio 97");
    expect(rows.map((r) => r.file)).toEqual(["DT78080 NAVY BLUE MODEL FRONT.png", "DT78080 NAVY BLUE MODEL BACK.png", "DT78080 NAVY BLUE MODEL FRONT 2.png"]);
    expect(rows[0]).toMatchObject({ style: "DT78080", color: "Navy Blue", model: "studio 97" });
  });

  it("writes a manifest that a sheet opens as text, never as a formula", () => {
    const rows = exportRows("DT1", "=HYPERLINK(\"x\")", [slot("front", "https://fal.media/a,b.png")]);
    const csv = manifestCsv(rows);
    const [head, line] = csv.trim().split("\r\n");
    expect(head).toBe("Style,Color,View,File,Link,Model,Engine");
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain('"https://fal.media/a,b.png"');
  });

  it("names the ZIP after the style and colour", () => {
    expect(exportZipName("DT78080", "navy/white")).toBe("DT78080 NAVY WHITE MODEL VIEWS.zip");
    expect(exportZipName("DT78080", "")).toBe("DT78080 MODEL VIEWS.zip");
  });

  it("builds a ZIP whose entries, sizes and CRCs read back", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const a = new TextEncoder().encode("hello");
    const b = new Uint8Array([1, 2, 3, 4]);
    const zip = zipFiles([{ name: "A FRONT.png", data: a }, { name: "manifest.csv", data: b }], new Date(2026, 10, 27, 10, 30, 0));
    const v = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(14, true)).toBe(crc32(a));
    expect(v.getUint32(18, true)).toBe(5);
    const nameLen = v.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLen))).toBe("A FRONT.png");
    expect(new TextDecoder().decode(zip.slice(30 + nameLen, 35 + nameLen))).toBe("hello");
  });
});

describe("Faire handoff", () => {
  it("opens the listing with the saved shot ids for the extension", () => {
    expect(faireHandoffUrl("p_abc123", ["s1", "s-2"])).toBe("https://www.faire.com/brand-portal/my-shop/products/p_abc123#ddto-studio=s1,s-2");
    expect(faireHandoffUrl("p_abc123", [])).toBe("https://www.faire.com/brand-portal/my-shop/products/p_abc123#ddto-studio");
    expect(() => faireHandoffUrl("https://evil.example", ["s1"])).toThrow();
    expect(faireHandoffUrl("p_abc", ["ok", "bad id", "x/y"])).toMatch(/#ddto-studio=ok$/);
  });

  it("finds the saved shot for each kept view by id or url", () => {
    const kept = [slot("front", "https://fal.media/f.png", { savedId: "s1" }), slot("back", "https://fal.media/b.png")];
    const saved = [{ id: "s1", view: "front", url: "https://blob/f.png", savedAt: 1 }, { id: "s2", view: "back", url: "https://blob/b.png", source: "https://fal.media/b.png", savedAt: 2 }];
    expect(savedIdsFor(kept, saved)).toEqual(["s1", "s2"]);
  });

  it("labels Faire states in plain words", () => {
    expect(faireStateLabel("DRAFT")).toBe("Draft");
    expect(faireStateLabel("PUBLISHED")).toBe("Published");
    expect(faireStateLabel(null)).toBe("");
  });
});
