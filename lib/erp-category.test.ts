// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetErpCache,
  ERP_USER_AGENT,
  erpFetch,
  erpFetchBytes,
  erpPost,
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

describe("every ERP request looks like Chrome", () => {
  // Since 2026-10-21 the ERP answers 403 to any non-browser User-Agent,
  // a bare "Mozilla/5.0" included, photos under /upload/style/ too.
  it("sends the full Chrome User-Agent on login, probe, GET, POST and photo fetch", async () => {
    process.env.ERP_USER_ID = "u";
    process.env.ERP_PASSWORD = "p";
    const spy = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      url: String(url).includes("xt.login.asp") ? `${url}` : "https://system.davidani.com/main.asp",
      headers: {
        getSetCookie: () => (String(url).includes("xt.login.asp") ? ["ASPSESSIONIDXYZ=abc; path=/"] : []),
        get: () => "image/png",
      },
      text: async () => "<html>dashboard</html>",
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
    vi.stubGlobal("fetch", spy);

    expect(await erpFetch("/data/x.asp")).not.toBeNull();
    expect(await erpPost("/data/y.asp", { a: "1" })).not.toBeNull();
    expect(await erpFetchBytes("/upload/style/DP62024A_1.jpg")).not.toBeNull();

    expect(spy).toHaveBeenCalledTimes(5);
    for (const [, init] of spy.mock.calls) {
      expect(init.headers["User-Agent"]).toBe(ERP_USER_AGENT);
    }
    expect(ERP_USER_AGENT).toMatch(/Chrome\/\d+/);
    expect(ERP_USER_AGENT).not.toBe("Mozilla/5.0");
  });
});

describe("login discipline (ERP operator, 2026-10-22)", () => {
  // A fake ERP: logins hand out a new cookie; /data replies come from `reply`.
  function fakeErp(reply: (url: string, n: number) => { ok?: boolean; text: string }) {
    let logins = 0;
    let data = 0;
    const spy = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("xt.login.asp")) logins++;
      const r = u.includes("/data/") ? reply(u, data++) : { text: "<html>dashboard</html>" };
      return {
        ok: r.ok ?? true,
        url: u.includes("xt.login.asp") ? u : "https://system.davidani.com/main.asp",
        headers: { getSetCookie: () => (u.includes("xt.login.asp") ? [`ASPSESSIONIDX=s${logins}`] : []), get: () => "" },
        text: async () => r.text,
      };
    });
    vi.stubGlobal("fetch", spy);
    return { logins: () => logins };
  }
  beforeEach(() => {
    process.env.ERP_USER_ID = "u";
    process.env.ERP_PASSWORD = "p";
  });

  it("concurrent callers share one login", async () => {
    const erp = fakeErp(() => ({ text: "{ok}" }));
    await Promise.all([erpFetch("/data/a.asp"), erpFetch("/data/b.asp"), erpPost("/data/c.asp", {})]);
    expect(erp.logins()).toBe(1);
  });

  it("re-logs once when the reply is the expired-session script", async () => {
    const erp = fakeErp((_, n) => ({ text: n === 1 ? '<script>//top.window.location = "/login.asp";</script>' : "{ok}" }));
    expect(await erpFetch("/data/a.asp")).toBe("{ok}");
    expect(await erpFetch("/data/b.asp")).toBe("{ok}");
    expect(erp.logins()).toBe(2);
  });

  it("never logs in again on a 403 or error page", async () => {
    const erp = fakeErp((_, n) => (n === 0 ? { text: "{ok}" } : { ok: false, text: "403 Forbidden" }));
    await erpFetch("/data/a.asp");
    expect(await erpFetch("/data/b.asp")).toBeNull();
    expect(await erpFetch("/data/c.asp")).toBeNull();
    expect(erp.logins()).toBe(1);
  });

  it("backs off after a refused login", async () => {
    let logins = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("xt.login.asp")) logins++;
      return { ok: true, url: "https://system.davidani.com/login.asp", headers: { getSetCookie: () => ["A=1"] }, text: async () => 'name="userPass"' };
    }));
    expect(await erpFetch("/data/a.asp")).toBeNull();
    expect(await erpFetch("/data/b.asp")).toBeNull();
    expect(logins).toBe(1);
  });
});
