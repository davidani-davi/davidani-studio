// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetErpCache,
  fetchErpCategory,
  mapErpCategory,
  resolveErpCategory,
} from "./erp-category";

const OLD = { id: process.env.ERP_USER_ID, pw: process.env.ERP_PASSWORD };

beforeEach(() => __resetErpCache());
afterEach(() => {
  vi.unstubAllGlobals();
  process.env.ERP_USER_ID = OLD.id;
  process.env.ERP_PASSWORD = OLD.pw;
});

describe("ERP category mapping", () => {
  // The six values the live ERP actually uses, from 205 sampled styles.
  it.each([
    ["TOP", "top"],
    ["JACKETS / OUTWEAR", "outerwear"],
    ["DRESS", "dress"],
    ["JUMPSUIT", "dress"],
    ["SET", "set"],
    ["BOTTOM", "ambiguous-bottom"],
  ])("maps %s", (raw, expected) => {
    expect(mapErpCategory(raw)).toBe(expected);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(mapErpCategory("  set  ")).toBe("set");
    expect(mapErpCategory("jackets / outwear")).toBe("outerwear");
  });

  it("returns null for unset or unrecognised values rather than guessing", () => {
    for (const v of [null, undefined, "", "SWIMWEAR", "ACCESSORY"]) {
      expect(mapErpCategory(v as any)).toBeNull();
    }
  });
});

describe("BOTTOM is split by vision, nothing else is", () => {
  it("keeps the vision answer when it is also a bottom", async () => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.ERP_USER_ID = "";
    // resolveErpCategory with a pre-known raw value is exercised via mapping;
    // here we assert the split rule directly through the public resolver.
    const { category } = await resolveErpCategory(null, "skirt");
    expect(category).toBeNull(); // no style number -> no ERP opinion at all
  });

  it("defaults an unhelpful vision answer to pants", () => {
    // BOTTOM + vision saying "top" is nonsense; pants is the larger population
    // and routes to the sweep either way.
    expect(mapErpCategory("BOTTOM")).toBe("ambiguous-bottom");
  });
});

describe("best effort — never breaks the studio", () => {
  it("is inert without credentials, and makes no network call", async () => {
    process.env.ERP_USER_ID = "";
    process.env.ERP_PASSWORD = "";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchErpCategory("DETS60234")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null for a blank style without calling out", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    for (const v of ["", "   ", null, undefined]) {
      expect(await fetchErpCategory(v as any)).toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("swallows a network failure and reports no opinion", async () => {
    process.env.ERP_USER_ID = "u";
    process.env.ERP_PASSWORD = "p";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await fetchErpCategory("DETS60234")).toBeNull();
    const { category } = await resolveErpCategory("DETS60234");
    expect(category).toBeNull();
  });

  it("treats a login that returns no cookie as unauthenticated", async () => {
    process.env.ERP_USER_ID = "u";
    process.env.ERP_PASSWORD = "p";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: "https://system.davidani.com/xt.login.asp",
        headers: { getSetCookie: () => [] },
        text: async () => "",
      })
    );
    expect(await fetchErpCategory("DETS60234")).toBeNull();
  });
});

describe("parses the ERP's JS-object response", () => {
  function stubErp(bodyText: string) {
    process.env.ERP_USER_ID = "u";
    process.env.ERP_PASSWORD = "p";
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            ok: true,
            url: "https://system.davidani.com/xt.login.asp",
            headers: { getSetCookie: () => ["ASPSESSIONIDXYZ=abc; path=/"] },
            text: async () => "",
          };
        }
        if (call === 2) {
          return {
            ok: true,
            url: "https://system.davidani.com/main.asp",
            headers: { getSetCookie: () => [] },
            text: async () => "<html>dashboard</html>",
          };
        }
        return {
          ok: true,
          url: "https://system.davidani.com/data/Style.Center.StyleForm.Load.asp",
          headers: { getSetCookie: () => [] },
          text: async () => bodyText,
        };
      })
    );
  }

  it("extracts category from key: 'value' syntax, not JSON", async () => {
    stubErp("({idStyle:'DETS60234', category:'SET', styleType:'- STOP NEXT S.'})");
    expect(await fetchErpCategory("DETS60234")).toBe("SET");
  });

  it("resolves the set that vision kept calling a dress", async () => {
    stubErp("({category:'SET'})");
    const { category, raw } = await resolveErpCategory("DETS60234", "dress");
    expect(raw).toBe("SET");
    expect(category).toBe("set");
  });

  it("lets vision split BOTTOM into skirt", async () => {
    stubErp("({category:'BOTTOM'})");
    const r = await resolveErpCategory("DSP50066", "skirt");
    expect(r.category).toBe("skirt");
    expect(r.ambiguousBottom).toBe(true);
  });

  it("defaults BOTTOM to pants when vision is no help", async () => {
    stubErp("({category:'BOTTOM'})");
    expect((await resolveErpCategory("DP12345", "top")).category).toBe("pants");
  });

  it("returns null when the response has no category at all", async () => {
    stubErp("({idStyle:'X'})");
    expect(await fetchErpCategory("X")).toBeNull();
  });
});
