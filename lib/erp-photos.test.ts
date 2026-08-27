import { describe, expect, it } from "vitest";
import {
  FOREIGN_GROUP,
  UNTAGGED_GROUP,
  fullSizeUrl,
  groupForDisplay,
  isErpPhotoUrl,
  looksLikeStyleCode,
  namedForStyle,
  regularizeStyle,
  nameTokens,
  parseErpPhoto,
  thumbUrl,
  type ErpPhoto,
} from "./erp-photos";

const DIR = "https://system.davidani.com/upload/style/";
const THUMB = `${DIR}T_DWTS67099 CHARCOAL_1.png`;
const FULL = `${DIR}DWTS67099 CHARCOAL_1.png`;

describe("thumbnail and original", () => {
  // Measured on the live ERP: 32 KB vs 4.8 MB, same directory, one prefix.
  it("swaps between the two by the filename prefix alone", () => {
    expect(fullSizeUrl(THUMB)).toBe(FULL);
    expect(thumbUrl(FULL)).toBe(THUMB);
  });

  it("is idempotent, so a round trip cannot double the prefix", () => {
    expect(fullSizeUrl(FULL)).toBe(FULL);
    expect(thumbUrl(THUMB)).toBe(THUMB);
    expect(thumbUrl(thumbUrl(FULL))).toBe(THUMB);
  });

  // A style code containing T_ must not be mistaken for the prefix.
  it("only strips the prefix from the front of the filename", () => {
    const odd = `${DIR}T_DWT_S99 BLACK_2.png`;
    expect(fullSizeUrl(odd)).toBe(`${DIR}DWT_S99 BLACK_2.png`);
  });
});

describe("reading a frame's identity", () => {
  // Sampled from the live ERP. The first version of this parser matched only
  // the first shape and returned null for the rest, which dropped 59 of
  // DDT9040's 60 frames — the style looked empty to the studio.
  it("reads the shape with a colourway and an underscore index", () => {
    expect(parseErpPhoto(THUMB, "DWTS67099")).toMatchObject({
      fullUrl: FULL,
      thumbUrl: THUMB,
      colorway: "CHARCOAL",
      index: 1,
    });
  });

  it("reads a parenthesised index and no colourway", () => {
    expect(parseErpPhoto(`${DIR}T_DDT9040 (7).JPG`, "DDT9040")).toMatchObject({
      colorway: null,
      index: 7,
    });
    // "IMAGE012" carries digits, so it reads as a code rather than a colour.
    expect(parseErpPhoto(`${DIR}T_image012(58).png`, "DT42174H")).toMatchObject({
      colorway: null,
      coStyled: ["IMAGE012"],
      index: 58,
    });
  });

  // "DT42174H, DP58531_13.jpg" — a comma separates as surely as a space, and
  // treating it as part of the code stopped the frame matching its own style.
  it("splits on commas, so a shared frame still names its style", () => {
    const photo = parseErpPhoto(`${DIR}T_DT42174H, DP58531_13.jpg`, "DT42174H")!;
    expect(photo.tokens).toEqual(["DT42174H", "DP58531"]);
    expect(namedForStyle(photo, "DT42174H")).toBe(true);
    // The second code is a garment styled with this one, not its colourway.
    expect(photo.colorway).toBeNull();
    expect(photo.coStyled).toEqual(["DP58531"]);
    expect(photo.index).toBe(13);
  });

  it("reads a bare style name with no index at all", () => {
    expect(parseErpPhoto(`${DIR}T_DT42174H.jpg`, "DT42174H")).toMatchObject({
      colorway: null,
      index: null,
    });
  });

  // Real names carry stray numbers: "DT42174H, DP50188 4_2.jpg" was heading a
  // group "4", which is not a colourway.
  it("does not read a bare number as a colourway", () => {
    expect(parseErpPhoto(`${DIR}T_DT42174H, DP50188 4_2.jpg`, "DT42174H")).toMatchObject({
      colorway: null,
      coStyled: ["DP50188"],
      index: 2,
    });
  });

  it("keeps a multi-word colourway together", () => {
    expect(parseErpPhoto(`${DIR}T_DDT9040 DUSTY BLUE_12.jpg`, "DDT9040")?.colorway).toBe(
      "DUSTY BLUE"
    );
  });

  it("reads a percent-encoded name, which is how the ERP links them", () => {
    expect(parseErpPhoto(`${DIR}T_DWTS67099%20CHARCOAL_3.png`, "DWTS67099")).toMatchObject({
      colorway: "CHARCOAL",
      index: 3,
    });
  });

  it("refuses only what is not an image", () => {
    expect(parseErpPhoto(`${DIR}notes.pdf`)).toBeNull();
    expect(parseErpPhoto("not a url")).toBeNull();
    // ...and without a style to strip, the code still reads as a code.
    expect(parseErpPhoto(THUMB)).toMatchObject({
      colorway: "CHARCOAL",
      coStyled: ["DWTS67099"],
    });
  });

  it("tokenises on every separator the ERP uses", () => {
    expect(nameTokens("DT42174H, DP58531_A B")).toEqual(["DT42174H", "DP58531", "A", "B"]);
  });
});

describe("proxy allowlist", () => {
  it("allows a style photo on the ERP", () => {
    expect(isErpPhotoUrl(THUMB)).toBe(true);
    expect(isErpPhotoUrl(FULL)).toBe(true);
  });

  // The proxy carries the ERP session cookie, so an unchecked src is an
  // authenticated read of any page in the ERP.
  it("refuses any other path on the ERP", () => {
    expect(isErpPhotoUrl("https://system.davidani.com/main.asp")).toBe(false);
    expect(isErpPhotoUrl("https://system.davidani.com/upload/style/../../main.asp")).toBe(false);
    expect(isErpPhotoUrl("https://system.davidani.com/data/Style.barcode.Json.asp")).toBe(false);
  });

  it("refuses another host entirely, lookalikes included", () => {
    expect(isErpPhotoUrl("https://evil.test/upload/style/x.png")).toBe(false);
    expect(isErpPhotoUrl("https://system.davidani.com.evil.test/upload/style/x.png")).toBe(false);
    expect(isErpPhotoUrl("http://system.davidani.com/upload/style/x.png")).toBe(false);
    expect(isErpPhotoUrl(null)).toBe(false);
  });
});

describe("grouping", () => {
  const p = (file: string, style = "DDT9040"): ErpPhoto =>
    parseErpPhoto(`${DIR}T_${file}`, style)!;

  it("puts every untagged frame of a style in one group, not one group each", () => {
    const groups = groupForDisplay([p("DDT9040 (2).JPG"), p("DDT9040 (1).JPG")], "DDT9040");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: UNTAGGED_GROUP, kind: "all" });
    expect(groups[0].photos.map((x) => x.index)).toEqual([1, 2]);
  });

  it("groups by colourway when the names carry one", () => {
    const groups = groupForDisplay(
      [p("DDT9040 BLACK_1.png"), p("DDT9040 CREAM_1.png"), p("DDT9040 BLACK_2.png")],
      "DDT9040"
    );
    expect(groups.map((g) => g.label)).toEqual(["BLACK", "CREAM"]);
    expect(groups[0].kind).toBe("colorway");
  });

  // DJ52056's frames are one green bomber shot over a top and jeans that have
  // their own codes. Read as a colourway, eleven frames of the bomber were
  // headed "DT52025 DP50116" — two garments that are not the product.
  it("says a styled look is a styled look, not a colourway", () => {
    const groups = groupForDisplay(
      [
        p("DJ52056 DT52025 DP50116_1.jpg", "DJ52056"),
        p("DJ52056 DT52025 DP50116_2.jpg", "DJ52056"),
        p("DJ52056 DWT52362 DP40212A_1.jpg", "DJ52056"),
      ],
      "DJ52056"
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Styled with DT52025 · DP50116",
      "Styled with DWT52362 · DP40212A",
    ]);
    expect(groups[0].kind).toBe("styled");
    expect(groups[0].styledWith).toEqual(["DT52025", "DP50116"]);
    // The split itself is worth keeping — those really are two looks.
    expect(groups[0].photos).toHaveLength(2);
  });

  it("prefers a real colourway over the codes beside it", () => {
    const [group] = groupForDisplay([p("DJ52056 ARMY GREEN DT52025_1.jpg", "DJ52056")], "DJ52056");
    expect(group).toMatchObject({ label: "ARMY GREEN", kind: "colorway", styledWith: [] });
  });

  // Foreign files do leak into shared galleries — "T_2597.png" really sits in
  // DWJ62171's. Mixed in with the style's own frames the gallery looks wrong.
  it("separates files not named for this style, and puts them last", () => {
    const groups = groupForDisplay([p("2597.png"), p("DDT9040 (1).JPG")], "DDT9040");
    expect(groups.map((g) => g.label)).toEqual([UNTAGGED_GROUP, FOREIGN_GROUP]);
    expect(groups[1].kind).toBe("foreign");
  });

  it("sorts an unnumbered frame last rather than first", () => {
    const groups = groupForDisplay([p("DDT9040.jpg"), p("DDT9040 (3).JPG")], "DDT9040");
    expect(groups[0].photos.map((x) => x.index)).toEqual([3, null]);
  });

  it("does not mutate its input", () => {
    const input = [p("DDT9040 (2).JPG"), p("DDT9040 (1).JPG")];
    const copy = [...input];
    groupForDisplay(input, "DDT9040");
    expect(input).toEqual(copy);
  });
});

describe("telling a style code from a colour name", () => {
  it("knows the codes that appear beside a style", () => {
    for (const t of ["DT52025", "DP40212A", "DWT52362", "DJ52056D"]) {
      expect(looksLikeStyleCode(t)).toBe(true);
    }
  });

  // Colour names carry no digits, which is what makes this reliable.
  it("does not mistake a colourway for one", () => {
    for (const t of ["CHARCOAL", "MOCHA", "BEIGE", "ARMY", "GREEN", "BUTTER"]) {
      expect(looksLikeStyleCode(t)).toBe(false);
    }
  });
});
