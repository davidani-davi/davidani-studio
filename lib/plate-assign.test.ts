import { describe, expect, it } from "vitest";
import { assignPlate, HOUSE_USER_SETS, housePlates, plateHash, spread } from "./plate-assign";

const PLATES = Array.from({ length: 8 }, (_, i) => ({
  id: `studio ${String(i + 1).padStart(2, "0")}`,
  poses: [{ id: "front" }, { id: "front2" }],
}));

describe("assignPlate", () => {
  it("gives a style the same model every time", () => {
    const a = assignPlate("DWJ62218", PLATES);
    const b = assignPlate("dwj62218 ", PLATES);
    expect(a).toEqual(b);
    expect(a!.humanModelId).toMatch(/^studio /);
  });

  it("shoots a Plus twin on the same model as its regular", () => {
    expect(assignPlate("PWJ62218", PLATES)).toEqual(assignPlate("DWJ62218", PLATES));
  });

  it("spreads a catalogue across the whole plate set", () => {
    const codes = Array.from({ length: 240 }, (_, i) => `DWJ${60000 + i * 7}`);
    const hist = spread(codes, PLATES);
    expect(Object.keys(hist).length).toBe(PLATES.length);   // every plate gets work
    const counts = Object.values(hist);
    // no plate carries more than twice its even share
    expect(Math.max(...counts)).toBeLessThan((codes.length / PLATES.length) * 2);
  });

  it("a bottom whose title names a silhouette shoots on the plate tagged with it", () => {
    const tagged = PLATES.map((p, i) => ({ ...p, wears: "pants", lowOk: true, silhouette: i === 5 ? "barrel" : undefined }));
    const barrel = assignPlate("DP62206", tagged, { category: "pants", silhouette: "barrel" });
    expect(barrel!.humanModelId).toBe("studio 06");
    // its Plus twin lands on the same body
    expect(assignPlate("PP62206", tagged, { category: "pants", silhouette: "barrel" })).toEqual(barrel);
    // no silhouette word, or none tagged: the ordinary trouser-plate spread
    const plain = assignPlate("DP62206", tagged, { category: "pants" });
    expect(plain!.humanModelId).toMatch(/^studio /);
    expect(assignPlate("DP62206", tagged, { category: "pants", silhouette: "flare" })).toEqual(plain);
    // a top never takes the silhouette route
    expect(assignPlate("DWT60401", tagged, { category: "top", silhouette: "barrel" }))
      .toEqual(assignPlate("DWT60401", tagged, { category: "top" }));
  });

  it("can be held to one family of plates", () => {
    const mixed = [...PLATES, { id: "pants 1", poses: [{ id: "front" }] }];
    const got = assignPlate("DP62206", mixed, { preferPrefix: "pants" });
    expect(got!.humanModelId).toBe("pants 1");
  });

  it("falls back rather than failing when the preference matches nothing", () => {
    expect(assignPlate("DA1", PLATES, { preferPrefix: "nobody" })!.humanModelId).toMatch(/^studio /);
    expect(assignPlate("DA1", [])).toBeNull();
    expect(assignPlate("DA1", [{ id: "empty", poses: [] }])).toBeNull();
  });

  it("hashes stably, because the extension must agree with the server", () => {
    expect(plateHash("DWJ62218")).toBe(plateHash("dwj62218"));
    expect(plateHash("DWJ62218")).not.toBe(plateHash("DWJ62219"));
  });

  it("assigns only from the house set, never the old head-to-thigh plates", () => {
    // The first plate-comparison run assigned DCT58018A to "kylie 1" and
    // DET60356 to "sydney" — the exact plates the new set replaces.
    const mixed = [
      { id: "kylie 1", poses: [{ id: "kylie 1" }] },
      { id: "sydney", poses: [{ id: "sydney" }] },
      ...PLATES,
    ];
    const codes = ["DCT58018A", "DET60356", "DWJ62218", "DD60433", "DET62209"];
    for (const code of codes) {
      expect(assignPlate(code, mixed)!.humanModelId).toMatch(/^studio /);
    }
    expect(housePlates(mixed).map((p) => p.id)).toEqual(PLATES.map((p) => p.id));
  });

  it("puts Jeonga's VISION and CELINE sets in the Auto pool, but not her other drafts", () => {
    const mixed = [
      ...PLATES,
      { id: "draft-jeonga-celine-7-mwtj90t6", poses: [{ id: "draft-jeonga-celine-7-mwtj90t6-pose" }] },
      { id: "draft-jeonga-vision-6-mwdqmit0", poses: [{ id: "draft-jeonga-vision-6-mwdqmit0-pose" }] },
      { id: "draft-jeonga-bottom-1-x", poses: [{ id: "draft-jeonga-bottom-1-x-pose" }] },
      { id: "celine-dct78115-mvy5e2r2", poses: [{ id: "celine-dct78115-mvy5e2r2-pose" }] },
    ];
    const house = housePlates(mixed).map((p) => p.id);
    expect(house).toContain("draft-jeonga-celine-7-mwtj90t6");
    expect(house).toContain("draft-jeonga-vision-6-mwdqmit0");
    expect(house).not.toContain("draft-jeonga-bottom-1-x");
    expect(house).not.toContain("celine-dct78115-mvy5e2r2");
    expect(HOUSE_USER_SETS.size).toBe(12);
    const picked = new Set(Array.from({ length: 200 }, (_, i) => assignPlate(`DT${70000 + i}`, mixed)!.humanModelId));
    expect(picked.has("draft-jeonga-celine-7-mwtj90t6")).toBe(true);
  });

  it("still uses whatever exists when no house plate is installed", () => {
    const old = [{ id: "kylie 1", poses: [{ id: "kylie 1" }] }];
    expect(assignPlate("DA1", old)!.humanModelId).toBe("kylie 1");
  });
});

describe("assignPlate for bottoms", () => {
  const TAGGED = PLATES.map((p, i) => ({ ...p, wears: i % 3 === 0 ? "pants" : "dress", lowOk: i % 3 === 0 }));
  const okIds = new Set(TAGGED.filter((p) => p.lowOk).map((p) => p.id));

  it("shoots pants and skirts only where the model wears trousers", () => {
    const cases: Array<[string, string]> = [["DP62140AP", "pants"], ["DS42505S", "skirt"], ["DP67160", "pants"], ["DP60023A", "pants"]];
    for (const [code, category] of cases) {
      const got = assignPlate(code, TAGGED, { category })!;
      expect(okIds.has(got.humanModelId)).toBe(true);
    }
  });

  it("still spreads bottoms across every trouser plate", () => {
    const hist: Record<string, number> = {};
    for (let i = 0; i < 120; i++) {
      const got = assignPlate(`DP${60000 + i * 7}`, TAGGED, { category: "pants" })!;
      hist[got.humanModelId] = (hist[got.humanModelId] || 0) + 1;
    }
    expect(Object.keys(hist).sort()).toEqual([...okIds].sort());
  });

  it("leaves tops on the whole house set", () => {
    const hist = spread(Array.from({ length: 240 }, (_, i) => `DWT${60000 + i * 7}`), TAGGED);
    expect(Object.keys(hist).length).toBe(TAGGED.length);
  });

  it("falls back to the house set when no plate is tagged", () => {
    expect(assignPlate("DP62140AP", PLATES, { category: "pants" })).toEqual(assignPlate("DP62140AP", PLATES));
  });

  it("keeps a Plus twin on its regular's plate", () => {
    expect(assignPlate("PP62140AP", TAGGED, { category: "pants" })).toEqual(assignPlate("DP62140AP", TAGGED, { category: "pants" }));
  });

  it("an explicit family preference still wins over the bottoms rule", () => {
    const got = assignPlate("DP62140AP", TAGGED, { category: "pants", preferPrefix: "studio 02" })!;
    expect(got.humanModelId).toBe("studio 02");
  });
});

describe("plates kept out of automatic assignment (studio 65, 2026-09-08)", () => {
  const plates = [
    ...PLATES,
    { id: "studio 65", poses: [{ id: "studio 65" }], autoPool: false },
    { id: "studio 66", poses: [{ id: "studio 66" }], autoPool: false, lowOk: true },
  ];
  it("never lands a style on an auto:false plate, for a top or a bottom", () => {
    const codes = Array.from({ length: 400 }, (_, i) => `DWT${60000 + i * 3}`);
    for (const c of codes) {
      expect(assignPlate(c, plates)!.humanModelId).not.toMatch(/studio 6[56]/);
      expect(assignPlate(c, plates, { category: "pants" })!.humanModelId).not.toMatch(/studio 6[56]/);
    }
  });
  it("still reaches it when asked for by prefix", () => {
    expect(assignPlate("DWT62170", plates, { preferPrefix: "studio 65" })!.humanModelId).toBe("studio 65");
  });
});

describe("long hems draw from full-length sets (DT70171, 2026-11-24)", () => {
  const pose = [{ id: "p" }];
  const plates = [
    { id: "studio 97", poses: pose },
    { id: "studio 99", poses: pose },
    { id: "studio 110", poses: pose, autoPool: false, fullLength: true },
    { id: "studio 114", poses: pose, autoPool: false, fullLength: true },
  ];
  it("a long top or coat lands only on a full-length set, even one kept out of the everyday pool", () => {
    for (const code of ["DT70171", "DJ67094", "DCJ1", "DT2", "DT3", "DT4", "DT5", "DT6"]) {
      const c = assignPlate(code, plates, { category: "outerwear", hem: "long" });
      expect(["studio 110", "studio 114"]).toContain(c?.humanModelId);
    }
  });
  it("any other hem keeps the everyday pool", () => {
    for (const code of ["DT70171", "DT2", "DT3", "DT4"]) {
      expect(["studio 97", "studio 99"]).toContain(assignPlate(code, plates, { category: "top", hem: "" })?.humanModelId);
      expect(["studio 97", "studio 99"]).toContain(assignPlate(code, plates, { category: "top", hem: "mid" })?.humanModelId);
    }
  });
  it("falls back to the everyday pool when no set is full length", () => {
    const c = assignPlate("DT70171", plates.slice(0, 2), { category: "outerwear", hem: "long" });
    expect(["studio 97", "studio 99"]).toContain(c?.humanModelId);
  });
  it("an explicit prefix still wins", () => {
    expect(assignPlate("DT70171", plates, { category: "top", hem: "long", preferPrefix: "studio 97" })?.humanModelId).toBe("studio 97");
  });
});
