import type { HouseFace } from "./no-plate";

/**
 * Locked identity specs for the house faces (2026-09-18).
 *
 * The pixel face anchor (lib/face-anchor.ts) carries the LIKENESS: a close
 * crop of the head cut from the approved front render, named by FACE_RULE.
 * It is the only thing that makes the person that person, and nothing here
 * replaces it. What the crop cannot carry is DETAIL: on a full-length view
 * the head is about a hundred pixels tall, so the generator gets the bone
 * structure but invents the skin, the freckles, the brow density and the
 * stray hairs — and it invents them toward its own default, which is
 * smoother and more idealised than our models actually are.
 *
 * This module supplies that detail as text. Verified 2026-09-18 by an A/B/C
 * run on celine's real face reference: pixel anchor alone came back visibly
 * smoother and more idealised; pixel anchor plus this spec came back with the
 * freckles, pore texture and brow density the spec names, likeness intact.
 *
 * TWO RULES GOVERN EVERYTHING IN HERE.
 *
 * 1. IDENTITY ONLY. Never pose, framing, crop, garment, lighting, camera or
 *    background. The PLATE owns all of those (lib/plate-framing.ts), and a
 *    spec that also names them fights the plate instead of helping it.
 *
 * 2. NO NEGATIONS, EVER. gpt25 and the Gemini-class editors have no separate
 *    negative channel, so a negation is just more tokens naming the thing —
 *    and naming it makes it MORE likely, not less. In the 09-18 run a spec
 *    listing "nose ring" among its negatives came back wearing a nose stud,
 *    and "stray hairs above and below the line" grew spiky brow artefacts.
 *    The same spec with every negation deleted and absence written positively
 *    ("nostrils bare, smooth unbroken skin") came back clean and kept the
 *    texture. State what IS there; describe absence as bare, smooth, plain.
 *    assertNoNegations() enforces this and the tests run it over every spec.
 *
 * Colour values are sampled from the real reference photographs, not guessed.
 * An iris is recorded as three zones — limbal ring, outer iris, inner ring —
 * because averaging them yields a muddy brown that matches neither the photo
 * nor what the eye sees in it.
 */

export interface IrisZones {
  /** The dark outer boundary of the iris. */
  limbal: string;
  /** The main body of the iris, between limbal ring and pupil. */
  outer: string;
  /** The warm ring immediately around the pupil. */
  inner: string;
}

export interface FaceIdentity {
  face: HouseFace;
  label: string;
  /** Public path of the photograph these values were sampled from. */
  sampledFrom: string;
  /** Broad read of the person, one short phrase each. */
  subject: { apparentAge: number; ethnicity: string };
  /**
   * Bone structure, in the order a reader would describe a face.
   *
   * RECORDED, NOT SENT. `identityPromptOf` deliberately leaves the silhouette
   * fields (shape, forehead, cheekbones, jaw, chin) out of the prompt: a
   * profile's outline has to arrive as PIXELS at the angle being rendered, not
   * as prose. Celine's jaw here is measured correctly — "strong and straight,
   * wider at the gonion than the forehead" — and a derived side view still came
   * back narrow-jawed, so accurate words did not hold the silhouette either.
   * Words describing bone only give the generator something to reinterpret.
   * `asymmetry` IS sent: it is a fine identity tell the crop is too small to
   * carry, and it settles nothing about her outline.
   */
  structure: {
    shape: string;
    forehead: string;
    cheekbones: string;
    jaw: string;
    chin: string;
    /** Named, specific, and always present — a symmetric face reads as rendered. */
    asymmetry: string;
  };
  eyes: {
    shape: string;
    lid: string;
    tilt: string;
    iris: IrisZones;
    lashes: string;
    underEye: string;
  };
  brows: { shape: string; position: string; thickness: string; color: string; texture: string };
  nose: { bridge: string; tip: string; nostrils: string };
  mouth: { shape: string; ratio: string; upperColor: string; lowerColor: string; finish: string };
  skin: {
    forehead: string;
    cheek: string;
    undertone: string;
    texture: string;
    freckles: string;
    marks: string;
    shine: string;
  };
  hair: {
    root: string;
    mid: string;
    lit: string;
    length: string;
    texture: string;
    volume: string;
    part: string;
    imperfections: string;
  };
  ears: string;
  neck: string;
}

export const FACE_IDENTITIES: Record<HouseFace, FaceIdentity> = {
  vision: {
    face: "vision",
    label: "Vision",
    sampledFrom: "/models/hide/faces/vision-face.png",
    subject: { apparentAge: 25, ethnicity: "White, Northern European" },
    structure: {
      // These four disagree with vision-face.png, which shows a wide jaw and a
      // broad chin. They were the text a derive obeyed to render a slimmer
      // stranger in profile, which is what took the silhouette out of the
      // prompt. Left here as the record of the mis-measurement; not emitted.
      shape: "long oval, length to width about 1.45 to 1",
      forehead: "medium height and flat, hairline a little higher at the temples",
      cheekbones: "high and moderately wide, soft rather than sculpted",
      jaw: "narrow with a gently rounded angle",
      chin: "small and tapered, slightly pointed",
      asymmetry:
        "her right eye sits about a millimetre lower than her left, her left nostril is marginally the wider, and her left mouth corner lifts a little more",
    },
    eyes: {
      shape: "almond, set about one eye-width apart, height to width about 0.42",
      lid: "a clear upper crease, the lid covering the top sixth of the iris",
      tilt: "level, outer corner even with the inner corner",
      iris: { limbal: "#402A1C", outer: "#775C49", inner: "#8D6F5B" },
      lashes: "natural length with a moderate curl, darker than the brow, bare of mascara",
      underEye: "a faint cool shadow around #C99C8C, the skin there smooth and flat",
    },
    brows: {
      shape: "straight with a soft low arch through the outer third",
      position: "close to the eye, about 8 mm above the lash line",
      thickness: "full, about 11 mm deep at the inner third",
      color: "#6B4A31",
      texture: "hairs brushed upward at the inner third, the outer edge soft and naturally grown out",
    },
    nose: {
      bridge: "straight, narrow and high",
      tip: "slightly rounded with little downward rotation",
      nostrils: "narrow and evenly set, the skin bare and smooth",
    },
    mouth: {
      shape: "a defined cupid's bow, moderately full",
      ratio: "upper to lower about 1 to 1.4",
      upperColor: "#AD544D",
      lowerColor: "#CA6C69",
      finish: "satin, the vermilion border slightly deeper than the lip body",
    },
    skin: {
      forehead: "#E9BA9F",
      cheek: "#DB967E",
      undertone: "warm peach",
      texture:
        "pores clearly visible across the nose, the nostril creases and the inner cheeks, with fine peach fuzz along the jaw and upper lip",
      freckles: "about twenty small freckles scattered over the nose bridge and upper cheeks, denser on her right cheek",
      marks: "one small mole about a centimetre below her left lower lash line",
      shine: "a faint sheen on the nose bridge, centre forehead and chin, the rest matte",
    },
    hair: {
      root: "#714E33",
      mid: "#AA8767",
      lit: "#C9A87E",
      length: "past the collarbone, ending mid-chest",
      texture: "straight, flat at the roots, with a slight bend through the mid-lengths and dry thinning ends",
      volume: "low at the crown, lying close to the head",
      part: "centre, offset about 1.5 cm to her right",
      imperfections:
        "flyaways standing up along the part and above both temples, the length falling in four to six loose clumped sections",
    },
    ears: "her left ear is covered by hair; her right is partly visible with a single small gold stud in the lobe",
    neck: "medium length and slender, with a faint horizontal crease at the base",
  },

  celine: {
    face: "celine",
    label: "Celine",
    sampledFrom: "/models/hide/faces/celine-face.png",
    subject: { apparentAge: 23, ethnicity: "racially ambiguous, Mediterranean or Latin American presenting" },
    structure: {
      shape: "oval with a squared lower third, length to width about 1.38 to 1",
      forehead: "medium height with slight central fullness, the hairline low and even",
      cheekbones: "high, wide and clearly defined, catching the key light",
      jaw: "strong and straight with a soft angle, wider at the gonion than the forehead",
      chin: "rounded and moderately full",
      asymmetry:
        "her right brow sits about two millimetres higher than her left, the nose tip leans a degree to her right, and her left mouth corner sits marginally lower",
    },
    eyes: {
      shape: "long almond, set a little under one eye-width apart, height to width about 0.38",
      lid: "a heavy upper lid with a partly hooded crease, covering the top fifth of the iris",
      tilt: "the outer corner sitting about a degree below the inner corner",
      iris: { limbal: "#432819", outer: "#86624C", inner: "#A27D6D" },
      lashes: "long with a moderate curl, dark, the lower lashes clearly visible",
      underEye: "a warm shadow around #A97A65 with slight natural fullness",
    },
    brows: {
      shape: "thick and straight, the line running nearly flat from the squared inner edge to the outer",
      position: "low, about 6 mm above the lash line",
      thickness: "full, about 14 mm deep at the inner third",
      color: "#3C291D",
      texture: "hairs growing upward and outward with visible gaps at the inner edge, the outer edge left to its natural grown-in shape",
    },
    nose: {
      bridge: "straight and narrow with a slight dorsal rise",
      tip: "refined and very slightly downturned",
      nostrils: "narrow and evenly set, the skin bare and smooth",
    },
    mouth: {
      shape: "full with a soft cupid's bow, the lower lip noticeably the fuller",
      ratio: "upper to lower about 1 to 1.7",
      upperColor: "#A66156",
      lowerColor: "#C8766A",
      finish: "natural matte with a faint central sheen on the lower lip",
    },
    skin: {
      forehead: "#E8BCA5",
      cheek: "#C68369",
      undertone: "olive with a golden cast",
      texture:
        "pores clearly visible across the nose, the nasolabial area and the inner cheeks, with fine peach fuzz along the jaw",
      freckles:
        "about forty small freckles densely scattered over the nose bridge and both cheeks, carrying on onto the upper lip area",
      marks: "one small mole on her right jawline and one about two centimetres below her left eye",
      shine: "a sheen along both cheekbones, the nose bridge and the chin, the outer cheeks matte",
    },
    hair: {
      root: "#3C291D",
      mid: "#4F3B30",
      lit: "#9C6D53",
      length: "past the chest, ending below the bust line",
      texture: "straight and flat at the roots with a loose bend through the mid-lengths and slightly wavy split ends",
      volume: "flat at the crown, widening below the ears",
      part: "centre and even, the scalp line visible along it",
      imperfections:
        "flyaways along the part and both temples, the length falling in five to eight loose clumped sections, with a soft frizz halo at the crown",
    },
    ears: "her left ear is covered by hair; her right is partly visible with a single thin gold hoop about 18 mm across in the lobe",
    neck: "medium length and slender, the sternocleidomastoid faintly visible on her right",
  },
};

/**
 * Words that turn a description into a negation. gpt25 and the Gemini-class
 * editors have no negative channel, so each one only succeeds in naming the
 * thing it meant to exclude. Kept as whole-word patterns so "nonetheless" and
 * "cannot" in ordinary prose do not trip the guard.
 */
const NEGATION_PATTERNS: RegExp[] = [
  /\bno\b/i,
  /\bnot\b/i,
  /\bnever\b/i,
  /\bnone\b/i,
  /\bwithout\b/i,
  /\bfree of\b/i,
  /\bavoid\b/i,
  /\bexclude\b/i,
  /\bremove\b/i,
  /\bun(?:retouched|shaped|broken|even)\b/i,
];

/** Booster words that buy the HDR, over-sharpened look instead of realism. */
const BOOSTER_PATTERNS: RegExp[] = [
  /\b\d+k\b/i,
  /\bultra[- ]?detailed\b/i,
  /\bhyper[- ]?detailed\b/i,
  /\bphotorealistic\b/i,
  /\bmasterpiece\b/i,
  /\bbest quality\b/i,
  /\bsharp focus\b/i,
  /\bflawless\b/i,
  /\bstunning\b/i,
  /\bperfect\b/i,
];

/** Every string value in a spec, for the authoring guards. */
function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsOf(v, out);
  return out;
}

/**
 * Throws if a spec negates anything or reaches for a quality booster. Called
 * by the tests over every registered face; call it too on anything authored
 * later, so rule 2 survives the next person to add a model.
 */
export function assertNoNegations(spec: FaceIdentity): void {
  for (const s of stringsOf(spec)) {
    for (const re of NEGATION_PATTERNS) {
      if (re.test(s)) throw new Error(`${spec.face}: negation ${re} in ${JSON.stringify(s)} — state what IS there instead`);
    }
    for (const re of BOOSTER_PATTERNS) {
      if (re.test(s)) throw new Error(`${spec.face}: booster ${re} in ${JSON.stringify(s)} — describe the capture, not the quality`);
    }
  }
}

/**
 * The spec as one prompt paragraph. Ordered the way a person describes a
 * face — eyes, brows, nose, mouth, skin, hair, ears, neck — so related traits
 * stay adjacent and the generator reads them as one person rather than a list
 * of unrelated facts. The silhouette fields of `structure` are omitted on
 * purpose; see the note on that field.
 */
export function identityPromptOf(face: HouseFace): string {
  const s = FACE_IDENTITIES[face];
  if (!s) return "";
  const { structure: st, eyes: e, brows: b, nose: n, mouth: m, skin: k, hair: h } = s;
  return [
    `IDENTITY DETAIL for ${s.label}, the model in the face crop. These are her measured colouring and surface detail; hold every one of them at this view's angle.`,
    `She reads about ${s.subject.apparentAge}, ${s.subject.ethnicity}.`,
    `Her face is asymmetric in a specific way: ${st.asymmetry}.`,
    `Eyes ${e.shape}, ${e.lid}, ${e.tilt}. Each iris has three zones: a dark limbal ring ${e.iris.limbal}, an outer iris ${e.iris.outer}, and a warmer ring ${e.iris.inner} around the pupil. Lashes ${e.lashes}. Under the eye, ${e.underEye}.`,
    `Brows ${b.shape}, sitting ${b.position}, ${b.thickness}, coloured ${b.color}, with ${b.texture}.`,
    `Nose bridge ${n.bridge}, tip ${n.tip}, nostrils ${n.nostrils}.`,
    `Mouth ${m.shape}, ${m.ratio}, the upper lip ${m.upperColor} and the lower ${m.lowerColor}, finished ${m.finish}.`,
    `Skin ${k.forehead} at the forehead and ${k.cheek} at the cheek, ${k.undertone} in undertone, with ${k.texture}. She has ${k.freckles}. ${k.marks}. There is ${k.shine}.`,
    `Hair ${h.root} at the roots, ${h.mid} through the mid-lengths, lifting to ${h.lit} where the light grazes it, ${h.length}, ${h.texture}, ${h.volume}, parted ${h.part}, with ${h.imperfections}.`,
    `Ears: ${s.ears}. Neck ${s.neck}.`,
  ].join(" ");
}

/**
 * The rule that frames the detail block, so the generator knows the text
 * refines the face crop rather than competing with it or with the plate.
 */
export const IDENTITY_RULE =
  "The identity detail that follows describes the same person as the face crop, at photographic detail the crop is too small to carry. " +
  "It settles her skin texture, freckles, brow density, iris colouring and the stray hairs around her part — the things a small crop leaves the render free to invent. " +
  "It is a likeness reference only: it sets nothing about her pose, her framing, her expression, the garment, the lighting or the background, all of which come from the other images. ";
