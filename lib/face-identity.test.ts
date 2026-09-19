import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FACE_IDENTITIES, assertNoNegations, identityPromptOf } from "./face-identity";
import { HOUSE_FACES } from "./no-plate";

const FACES = Object.keys(FACE_IDENTITIES) as (keyof typeof FACE_IDENTITIES)[];

describe("FACE_IDENTITIES", () => {
  it("covers every house face the picker offers", () => {
    expect(FACES.sort()).toEqual(Object.keys(HOUSE_FACES).sort());
  });

  it("samples every colour from the reference photo as a hex value", () => {
    for (const f of FACES) {
      const s = FACE_IDENTITIES[f];
      const hexes = [
        s.eyes.iris.limbal, s.eyes.iris.outer, s.eyes.iris.inner,
        s.brows.color, s.mouth.upperColor, s.mouth.lowerColor,
        s.skin.forehead, s.skin.cheek, s.hair.root, s.hair.mid, s.hair.lit,
      ];
      for (const h of hexes) expect(h, `${f}: ${h}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("gives each iris three distinct zones rather than one averaged brown", () => {
    // Averaging limbal, outer and inner yields a muddy value that matches
    // neither the photograph nor what a reader sees in it (2026-09-18).
    for (const f of FACES) {
      const { limbal, outer, inner } = FACE_IDENTITIES[f].eyes.iris;
      expect(new Set([limbal, outer, inner]).size, `${f} iris zones`).toBe(3);
    }
  });

  it("names a specific asymmetry, because a symmetric face reads as rendered", () => {
    for (const f of FACES) {
      expect(FACE_IDENTITIES[f].structure.asymmetry.length, f).toBeGreaterThan(40);
    }
  });

  it("points at a face reference that exists under the public faces folder", () => {
    for (const f of FACES) {
      expect(FACE_IDENTITIES[f].sampledFrom).toBe(`/models/hide/faces/${f}-face.png`);
    }
  });
});

describe("assertNoNegations", () => {
  // The rule that matters most: gpt25 and the Gemini-class editors have no
  // negative channel, so naming a thing to exclude it makes it MORE likely.
  // A spec listing "nose ring" among its negatives came back wearing a nose
  // stud (2026-09-18).
  it("passes every registered face", () => {
    for (const f of FACES) expect(() => assertNoNegations(FACE_IDENTITIES[f])).not.toThrow();
  });

  it("rejects a negation anywhere in a spec, however deeply nested", () => {
    const bad = structuredClone(FACE_IDENTITIES.vision);
    bad.nose.nostrils = "narrow and evenly set, no nose ring";
    expect(() => assertNoNegations(bad)).toThrow(/negation/);
  });

  it("rejects a quality booster", () => {
    const bad = structuredClone(FACE_IDENTITIES.celine);
    bad.skin.texture = "ultra-detailed pores across the nose";
    expect(() => assertNoNegations(bad)).toThrow(/booster/);
  });
});

describe("identityPromptOf", () => {
  it("carries the sampled hex values into the prompt", () => {
    const p = identityPromptOf("celine");
    const s = FACE_IDENTITIES.celine;
    for (const h of [s.eyes.iris.outer, s.skin.cheek, s.hair.mid]) expect(p).toContain(h);
  });

  it("stays silent on the silhouette, which pixels have to carry", () => {
    // A profile's outline must come from a reference AT that angle. Prose
    // describing bone gets reinterpreted: vision's recorded jaw ("narrow",
    // "small and tapered") contradicts her own photograph and a derive obeyed
    // the words, and celine's jaw is recorded correctly and her derived side
    // still slimmed. So the recorded silhouette VALUES are never emitted.
    //
    // Checked as values, not as words: "jaw", "chin" and "cheekbone" may still
    // appear, because the skin block places peach fuzz, moles and sheen by
    // landmark — that settles texture, not outline.
    for (const f of FACES) {
      const p = identityPromptOf(f);
      const st = FACE_IDENTITIES[f].structure;
      for (const k of ["shape", "forehead", "cheekbones", "jaw", "chin"] as const) {
        expect(p, `${f} prompt still carries structure.${k}`).not.toContain(st[k]);
      }
      expect(p, `${f} dropped the asymmetry tell`).toContain(st.asymmetry);
    }
  });

  it("stays silent on what the plate owns", () => {
    // Rule 1: pose, framing, garment, lighting and background come from the
    // plate (lib/plate-framing.ts). A spec that names them fights the plate.
    for (const f of FACES) {
      const p = identityPromptOf(f).toLowerCase();
      // "crop" is not on this list: the opening sentence deliberately points
      // at the face crop, which is the reference this text refines.
      for (const w of ["pose", "stance", "framing", "backdrop", "background", "octabox", "aperture", "jeans", "t-shirt", "sneakers"]) {
        expect(p, `${f} mentions ${w}`).not.toContain(w);
      }
    }
  });

  it("names the model so the text and the face crop read as one person", () => {
    expect(identityPromptOf("vision")).toContain("Vision");
    expect(identityPromptOf("celine")).toContain("Celine");
  });

  it("returns empty for anything that is not a house face", () => {
    expect(identityPromptOf("kylie" as never)).toBe("");
  });
});

describe("the published identity.json", () => {
  // plate_derive.py (faire-management) fetches this file rather than keeping a
  // second copy of the measurements. If a spec edit ships without
  // `npm run faces:identity`, the deriver silently uses the old face.
  it("matches what the module renders today", async () => {
    const { identityJson, IDENTITY_JSON_PATH } = await import("../scripts/emit-face-identity.mjs");
    // Compared as text, not parsed: the committed file must be byte-identical
    // to what the script writes, so a regeneration is never a no-op diff.
    expect(readFileSync(IDENTITY_JSON_PATH, "utf8"), "stale — run `npm run faces:identity`").toBe(identityJson());
  });

  it("publishes a prompt carrying the measured hexes for each face", () => {
    const doc = JSON.parse(readFileSync("public/models/hide/faces/identity.json", "utf8"));
    for (const f of FACES) {
      const s = FACE_IDENTITIES[f];
      for (const h of [s.eyes.iris.limbal, s.skin.cheek, s.hair.root]) {
        expect(doc.faces[f].prompt, `${f} missing ${h}`).toContain(h);
      }
    }
  });
});
