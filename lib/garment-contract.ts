import type { PresetView } from "./models-registry";

/**
 * What the render is told the garment IS.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until this, the entire product identity of a model shot was one noun phrase
 * written by a vision model looking at one photo — 13 words out of a
 * 1,348-word prompt. On DWJ62218 that phrase read the open placket of a
 * cardigan as a "keyhole cutout detail", and the render came back as a closed
 * pullover with a keyhole. Nothing downstream could recover it: the other
 * 1,335 words are about hems and layering, not about this garment.
 *
 * The correction was sitting in our own systems the whole time. The style code
 * says WJ (cardigan). The listing title we wrote says "Two-Tone Striped
 * Button-Front Cardigan". The ERP holds the fabric and the colourway names. So
 * vision keeps the job it is good at — what the surface looks like, where the
 * print sits, what trims are visible — and everything we already know
 * overrides what it guessed.
 *
 * Every override is recorded in `corrections`, because a silent correction is
 * indistinguishable from a bug the day the known facts are wrong.
 */

export interface KnownGarment {
  /** ERP style code, e.g. "DWJ62218". */
  styleCode?: string;
  /** Garment type from the style code / taxonomy, e.g. "Cardigan - Women's". */
  type?: string;
  /** The listing title we approved, e.g. "Two-Tone Striped Button-Front Cardigan". */
  title?: string;
  /** ERP fibre content, e.g. "45% Polyester 55% Acrylic". */
  fabric?: string;
  /** The colourway being shot, e.g. "NAVY/BLUE". */
  color?: string;
  /** The listing description, read for closure and fit words. */
  description?: string;
  /** Where the hem ends when the caller already decided ("long" / "short"); else read from the copy. */
  hem?: string;
}

export interface VisionGarment {
  garment: string;
  features: string;
}

export interface GarmentContract {
  garment: string;
  features: string;
  /** Human-readable list of what the known facts changed. */
  corrections: string[];
}

/**
 * Garment nouns we can recognise inside a vision phrase, longest first so
 * "sweater vest" wins over "vest" and "t-shirt" over "shirt".
 */
const TYPE_WORDS = [
  "sweater vest", "shirt jacket", "shacket", "denim jacket", "bomber jacket", "puffer jacket",
  "trench coat", "button down shirt", "button-down shirt", "t-shirt", "tee shirt",
  "cardigan", "sweatshirt", "sweater", "pullover", "hoodie", "jacket", "blazer", "coat",
  "kimono", "vest", "dress", "romper", "jumpsuit", "bodysuit", "blouse", "shirt", "tee",
  "top", "tank", "camisole", "skirt", "shorts", "trousers", "pants", "jeans", "leggings",
  "set", "jogger",
];

/** Types that open down the front unless the copy says otherwise. */
const OPEN_FRONT_TYPES = new Set([
  "cardigan", "jacket", "blazer", "coat", "kimono", "shacket", "shirt jacket",
  "denim jacket", "bomber jacket", "puffer jacket", "trench coat", "vest",
]);

/** Closure words worth asserting, in the order we prefer to name them. */
const CLOSURES: Array<{ re: RegExp; label: string }> = [
  { re: /\bbutton[- ]?front\b|\bbutton[- ]?up\b|\bbuttoned front\b/i, label: "button-front" },
  { re: /\bzip[- ]?front\b|\bfull[- ]?zip\b|\bzip[- ]?up\b/i, label: "zip-front" },
  { re: /\bsnap[- ]?front\b/i, label: "snap-front" },
  { re: /\btie[- ]?front\b|\bwrap\b/i, label: "tie-front" },
  { re: /\bopen[- ]?front\b|\bopen front\b/i, label: "open-front" },
  { re: /\bpullover\b|\bpull[- ]?on\b/i, label: "pullover" },
];

/** "Cardigan - Women's" / "Top & Pant Set (NOT Loungewear) - Women's" -> "cardigan" / "set". */
export function normalizeType(type: string | undefined): string {
  const head = String(type || "").split(" - ")[0].trim().toLowerCase();
  if (!head) return "";
  // Longest match wins ("sweater vest" over "vest"); among equals the LAST one
  // wins, because a compound label names its head noun at the end ("Top & Pant
  // Set" is a set, not a top).
  const hits = TYPE_WORDS.map((word) => ({ word, at: head.search(new RegExp(`\\b${word}\\b`)) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => b.word.length - a.word.length || b.at - a.at);
  return hits[0]?.word || head;
}

/** The garment noun a phrase is claiming, or "" when it names none. */
export function typeIn(phrase: string): string {
  const text = String(phrase || "").toLowerCase();
  return TYPE_WORDS.find((word) => new RegExp(`\\b${word}\\b`).test(text)) || "";
}

/** How the garment closes, from the copy we wrote plus the type's default. */
export function closureFor(known: KnownGarment, type: string): string {
  const copy = `${known.title || ""} ${known.description || ""}`;
  for (const { re, label } of CLOSURES) {
    if (re.test(copy)) return label;
  }
  return OPEN_FRONT_TYPES.has(type) ? "open-front" : "";
}

function tidy(text: string): string {
  return text.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();
}

/**
 * Merge what we know with what vision saw.
 *
 * Precedence, high to low: the style code's garment type, the closure named in
 * our own listing copy, the ERP's fabric and colourway, then vision for
 * everything else (print, trims, pockets, sleeves, hem).
 */
export function buildGarmentContract(
  known: KnownGarment,
  vision: VisionGarment
): GarmentContract {
  const corrections: string[] = [];
  let garment = tidy(vision.garment || "");
  let features = tidy(vision.features || "");

  const knownType = normalizeType(known.type);
  const sawType = typeIn(garment);

  // 1. Type. The style code knows what this body is; a vision phrase that
  //    names a different garment is overruled rather than argued with.
  if (knownType && sawType && sawType !== knownType) {
    garment = garment.replace(new RegExp(`\\b${sawType}\\b`, "i"), knownType);
    corrections.push(`type: "${sawType}" → "${knownType}" (style code)`);
  } else if (knownType && !sawType) {
    garment = tidy(`${garment} ${knownType}`);
    corrections.push(`type: named "${knownType}" (style code); vision named none`);
  }

  const type = knownType || sawType;
  const closure = closureFor(known, type);

  // 2. Closure. This is the failure that motivated the whole module: an open
  //    cardigan rendered as a closed pullover because vision called the
  //    placket a keyhole. When we know the garment opens, say so in the phrase
  //    AND strike the misread from the features.
  if (closure && closure !== "pullover") {
    const opens = OPEN_FRONT_TYPES.has(type) || closure === "open-front";
    const closureRe = /\b(button|zip|snap|tie)[- ]?(front|up)\b|\bfull[- ]?zip\b|\bopen[- ]?front\b|\bwrap\b/gi;
    const keyholeRe = /\b(keyhole|cut[- ]?out)s?\b/gi;

    // Rebuild the phrase rather than patch it: put the closure directly in
    // front of the garment noun, and drop the trailing "with …" clause when
    // striking the misreads leaves nothing but connectives behind. Patching in
    // place left "…cardigan with button front and detail".
    const [rawHead, ...restOf] = garment.split(/\s+with\s+/i);
    let head = rawHead.replace(closureRe, " ");
    if (opens) head = head.replace(keyholeRe, " ");
    head = tidy(head);
    head = type && new RegExp(`\\b${type}\\b`, "i").test(head)
      ? tidy(head.replace(new RegExp(`\\b${type}\\b`, "i"), `${closure} ${type}`))
      : tidy(`${head} ${closure} ${type}`.trim());

    let tail = restOf.join(" with ").replace(closureRe, " ");
    if (opens) tail = tail.replace(keyholeRe, " ");
    // Only connectives left means the clause was entirely about what we just
    // struck, so it goes with it.
    const meat = tail.replace(/\b(and|or|a|an|the|detail|details|with)\b/gi, " ").trim();
    garment = meat ? tidy(`${head} with ${tidy(tail)}`) : head;

    if (!new RegExp(closure.replace("-", "[- ]?"), "i").test(rawHead)) {
      corrections.push(`closure: "${closure}" asserted (listing copy)`);
    }
    if (opens && keyholeRe.test(`${rawHead} ${features}`)) {
      features = tidy(features.replace(/[^,]*\b(keyhole|cut[- ]?out)\b[^,]*,?/gi, ""));
      corrections.push('dropped "keyhole/cutout": an open placket read as a neckline cutout');
    }
    const openClause = opens
      ? `front closure: a ${closure} placket at center front — this garment OPENS down the full center front and is worn open or fastened, never rendered as a closed pullover with a continuous front panel`
      : `front closure: ${closure}`;
    features = features ? `${features}. ${openClause}` : openClause;
  } else if (closure === "pullover") {
    features = features
      ? `${features}. front closure: a closed pullover front with no opening placket`
      : "front closure: a closed pullover front with no opening placket";
    corrections.push("closure: pullover asserted (listing copy)");
  }

  // 3. Fabric. Vision guesses texture from a photograph; the ERP holds the
  //    fibre content, which is what makes a knit read as a knit.
  if (known.fabric && known.fabric.trim()) {
    features = `${features}. fabric: ${known.fabric.trim()}`;
    corrections.push(`fabric: "${known.fabric.trim()}" (ERP)`);
  }

  // 4. Colourway. Named so the render is checkable against the colour the
  //    buyer will order, not just "blue-ish".
  if (known.color && known.color.trim()) {
    const color = known.color.trim().toLowerCase().replace(/\s*\/\s*/g, " and ");
    features = `${features}. colourway: ${color}, matching the uploaded reference exactly`;
    corrections.push(`colourway: "${known.color.trim()}" (ERP)`);
  }

  // 5. Length. Vision re-reads the hem for every view and drifts: on DJ67094
  //    one longline coat came back "knee length", "hip length" and "mid-calf"
  //    across four views, and the side render was a shacket. The title says
  //    "Longline"; it overrules the phrase and is spelled out in the features.
  const length = lengthFor(known);
  if (length) {
    const had = LENGTH_WORDS_RE.test(garment);
    garment = tidy(garment.replace(LENGTH_WORDS_RE, " ")).replace(/(\s*,)?\s*\bwith\b\s*$/i, "").replace(/[\s,]+$/, "");
    const noun = typeIn(garment) || type;
    garment = noun && new RegExp(`\\b${noun}\\b`, "i").test(garment)
      ? tidy(garment.replace(new RegExp(`\\b${noun}\\b`, "i"), `${length.adj} ${noun}`))
      : tidy(`${length.adj} ${garment}`);
    features = features ? `${features}. length: ${length.adj}, ${length.hem}` : `length: ${length.adj}, ${length.hem}`;
    corrections.push(`length: "${length.adj}" asserted (listing copy)${had ? "; vision's length struck" : ""}`);
  }

  // 6. Fit. Vision cannot size a garment from a hanger shot and the render
  //    tends to a tent; the copy says how it is meant to sit on the body.
  const fit = fitFor(known);
  if (fit) {
    features = features ? `${features}. fit: ${fit.phrase}` : `fit: ${fit.phrase}`;
    corrections.push(`fit: "${fit.word}" asserted (listing copy)`);
  }

  return { garment: tidy(garment), features: tidy(features), corrections };
}

/**
 * Length words we act on, longest first, and what each means on the body. The
 * title and taxonomy name describe the garment itself; the description also
 * talks about what it layers over, so only the title is read here. An
 * explicit `hem` from the planner ("long" with no length word, i.e. a plain
 * "coat") asserts a knee-length hem, the shortest a coat comes.
 */
const LENGTHS: Array<[RegExp, { adj: string; hem: string }]> = [
  [/\bcropped\b|\bcrop\b/i, { adj: "cropped", hem: "the hem sits at the natural waist" }],
  [/long-?line|\bduster\b/i, { adj: "longline", hem: "the hem falls at mid-calf, well below the knee" }],
  [/floor-?length|full-?length|\bmaxi\b/i, { adj: "floor-length", hem: "the hem reaches the ankle" }],
  [/ankle-?length/i, { adj: "ankle-length", hem: "the hem sits at the ankle bone" }],
  [/mid-?calf|calf-?length|\bmidi\b/i, { adj: "midi-length", hem: "the hem falls at mid-calf" }],
  [/knee-?length|below[- ]the[- ]knee|below-?knee/i, { adj: "knee-length", hem: "the hem falls at or just below the knee" }],
];
/** Any length a vision phrase may carry, so an asserted one replaces rather than joins it. */
const LENGTH_WORDS_RE =
  /\b(hip|thigh|waist|knee|mid-?calf|calf|ankle|floor|midi|maxi|mini|cropped|crop|long-?line|full|tunic|mid|short|long|regular|standard)[- ]?length\b|\b(longline|long-line|midi|maxi|cropped|hip-length|thigh-length)\b/gi;

export function lengthFor(known: KnownGarment | null | undefined): { adj: string; hem: string } | null {
  const k = known || {};
  const text = `${k.type || ""} ${k.title || ""}`;
  for (const [re, len] of LENGTHS) if (re.test(text)) return len;
  if (String(k.hem || "").toLowerCase() === "long") return { adj: "knee-length", hem: "the hem falls at or just below the knee" };
  return null;
}

/**
 * Fit words, first match wins; each says where the garment sits on the body.
 * The roomy words are read from the title and the description alike; the
 * close-fitting ones only from the title, because a description says "pairs
 * with slim jeans" about the trousers, not the top.
 */
const FITS: Array<[RegExp, string, string, "title" | "any"]> = [
  [/\boversized?\b/i, "oversized", "oversized and roomy through the body on purpose, yet worn in the model's own size: shoulder seams at or just off her natural shoulder line, sleeves ending at the wrist", "any"],
  [/\brelaxed\b/i, "relaxed", "relaxed through the body, shoulder seams at her natural shoulder line, sleeves ending at the wrist bone", "any"],
  [/\bboxy\b/i, "boxy", "boxy and straight through the body, shoulder seams at her natural shoulder line", "any"],
  [/\b(slim|fitted|tailored|bodycon|body-hugging)\b/i, "fitted", "fitted close to the body, shoulder seams at her natural shoulder line", "title"],
];

export function fitFor(known: KnownGarment | null | undefined): { word: string; phrase: string } | null {
  const k = known || {};
  const title = String(k.title || "");
  const any = `${title} ${k.description || ""}`;
  for (const [re, word, phrase, scope] of FITS) if (re.test(scope === "title" ? title : any)) return { word, phrase };
  return null;
}

/** True when there is enough known truth to be worth overriding vision with. */
export function hasKnownFacts(known: KnownGarment | undefined | null): boolean {
  if (!known) return false;
  return Boolean(known.type || known.title || known.fabric || known.color);
}

export type { PresetView };
