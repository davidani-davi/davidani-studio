import { describe, expect, it } from "vitest";
import { assignPlate, housePlates, plateHash, spread } from "./plate-assign";

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
