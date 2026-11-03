/**
 * Garment facts (David, 2026-11-03): the length, fit and photo type of one style, checked by the operator.
 *
 * WHY THIS EXISTS
 * ---------------
 * Jeonga only has the photos she uploads, mostly office snapshots of the garment on a hanger. The image
 * model guessed the length and fit from those photos and she corrected it after the fact, one Redo note at
 * a time: DP62259 went "8부" → "7부" → "no, full length" → "straight, not barrel" over 15 notes, and a
 * Redo never sees the render it corrects, so "longer" or "shorten a little" had nothing to compare against.
 * Here the facts are settled once per style (pre-filled by a vision read, then confirmed by her) and every
 * view states them as fixed positions on the body. Without facts the Simple prompt is byte-identical.
 */

export type PhotoType = 'hanger' | 'flat' | 'mannequin' | 'worn';
export interface GarmentFacts {
  /** How the product photo was taken. */
  photo?: PhotoType;
  /** Hem of a top or the top piece of a set. */
  topLength?: string;
  /** Hem of pants, a skirt, a dress or the bottom piece of a set. */
  bottomLength?: string;
  sleeve?: string;
  /** Body fit of a top or dress. */
  fit?: string;
  /** Leg or skirt shape. */
  shape?: string;
  /** Free text the operator checked, e.g. "the flower print is only on the inside of the back leg". */
  details?: string;
}

type Scope = 'top' | 'bottoms' | 'outfit';

const PANTS: Record<string, string> = {
  shorts: 'shorts: both hems end at mid-thigh',
  knee: 'knee length: both hems end at the knee',
  capri: '7/10 (capri) length: both hems end at mid-calf, well above the ankle, so the lower calf shows',
  cropped: '8/10 (cropped ankle) length: both hems end a few centimetres above the ankle bone, so the ankle shows',
  ankle: '9/10 (ankle) length: both hems end at the ankle bone',
  full: 'full length: both hems reach the top of the foot and cover the ankle',
  floor: 'floor length: both hems fall to the floor over the shoes',
};
const SKIRT: Record<string, string> = {
  mini: 'mini: the hem ends at mid-thigh',
  knee: 'knee length: the hem ends at the knee',
  midi: 'midi: the hem ends at mid-calf',
  maxi: 'maxi: the hem reaches the ankle',
};
const TOP: Record<string, string> = {
  cropped: 'cropped: the hem ends above the navel, showing the midriff',
  waist: 'waist length: the hem ends at the navel or the waistband',
  hip: 'hip length: the hem ends at the hip bone',
  tunic: 'tunic length: the hem ends at mid-thigh',
  longline: 'longline: the hem ends at or below the knee',
};
const SLEEVE: Record<string, string> = {
  sleeveless: 'sleeveless: both arms are bare from the shoulder',
  short: 'short sleeves ending on the upper arm',
  elbow: 'elbow-length sleeves ending at the elbow',
  'three-quarter': '7/10 (three-quarter) sleeves ending halfway between the elbow and the wrist',
  long: 'long sleeves ending at the wrist bone',
  'extra-long': 'extra-long sleeves reaching past the wrist and covering the back of the hand',
};
const FIT: Record<string, string> = {
  fitted: 'fitted: close to the body',
  regular: 'regular fit: follows the body with a little ease',
  relaxed: 'relaxed: easy through the body, hanging slightly away from it',
  oversized: 'oversized: roomy on purpose, shoulder seams dropped past her shoulder line',
  boxy: 'boxy: straight and wide through the body, with no shaping at the waist',
};
const SHAPE: Record<string, string> = {
  skinny: 'skinny: close to the leg down to the hem',
  straight: 'straight leg: one even width from the knee to the hem',
  wide: 'wide leg: the legs fall wide and straight from the hip, well away from her legs',
  barrel: 'barrel leg: the legs curve out through the knee and narrow again at the hem',
  flare: 'flared: close through the thigh, widening from the knee to the hem',
  jogger: 'jogger: relaxed through the leg, gathered at an ankle cuff',
  balloon: 'balloon: full through the leg, gathered in at the hem',
  'a-line': 'A-line: fitted at the waist, widening evenly to the hem',
  pencil: 'pencil: close over the hips and thighs, straight to the hem',
};
const PHOTO: Record<PhotoType, string> = {
  hanger: "Image 2 is a snapshot of the garment hanging on a hanger: take only the garment's fabric, colour, print, seams and trims from it, and dress her in it as it falls when worn, with soft natural drape and folds that follow her body and pose.",
  flat: "Image 2 is the garment laid flat: its width there is the folded width, so dress her in it as it falls when worn, with soft natural drape and folds that follow her body and pose.",
  mannequin: "Image 2 shows the garment on a dress form: take only the garment's fabric, colour, print, seams and trims from it; the dress form and everything on its surface belong to the photo, not the product.",
  worn: '',
};

/** Every code the client may send, per field, so the extension's chips and this table stay in step. */
export const FACT_CODES = {
  photo: Object.keys(PHOTO), topLength: Object.keys(TOP), bottomLength: [...new Set([...Object.keys(PANTS), ...Object.keys(SKIRT)])],
  sleeve: Object.keys(SLEEVE), fit: Object.keys(FIT), shape: Object.keys(SHAPE),
} as const;

const clean = (s: unknown, max: number) => String(s ?? '').replace(/["\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Keeps only known codes and a short details line. Null when nothing is left. */
export function cleanFacts(input: unknown): GarmentFacts | null {
  if (!input || typeof input !== 'object') return null;
  const x = input as Record<string, unknown>, out: GarmentFacts = {};
  for (const k of ['photo', 'topLength', 'bottomLength', 'sleeve', 'fit', 'shape'] as const) {
    const v = clean(x[k], 20).toLowerCase();
    if (v && (FACT_CODES[k] as readonly string[]).includes(v)) (out as Record<string, string>)[k] = v;
  }
  const details = clean(x.details, 200);
  if (details) out.details = details;
  return Object.keys(out).length ? out : null;
}

/** True when the facts settle where a hem falls, so the prompt stops telling image 2 to decide it. */
export function factsSetLength(f: GarmentFacts | null | undefined, scope: Scope): boolean {
  if (!f) return false;
  return scope === 'bottoms' ? Boolean(f.bottomLength) : scope === 'top' ? Boolean(f.topLength || f.sleeve) : Boolean(f.topLength || f.bottomLength || f.sleeve);
}

/**
 * The GARMENT FACTS block of a Simple prompt. Only the fields that apply to this garment are stated: a top
 * ignores bottom length and shape, bottoms ignore sleeves and body fit. A skirt or dress reads the skirt
 * lengths, pants the trouser lengths (a code that only exists for the other is dropped).
 */
export function factsBlock(f: GarmentFacts | null | undefined, scope: Scope, category?: string): string {
  if (!f) return '';
  const skirtLike = category === 'skirt' || category === 'dress';
  const lines: string[] = [];
  const top = scope !== 'bottoms' && category !== 'dress';
  const bottom = scope !== 'top';
  if (top && f.topLength && TOP[f.topLength]) lines.push(`${category === 'set' ? 'Top length' : 'Length'}: ${TOP[f.topLength]}.`);
  if (scope !== 'bottoms' && f.sleeve && SLEEVE[f.sleeve]) lines.push(`Sleeves: ${SLEEVE[f.sleeve]}.`);
  if (scope !== 'bottoms' && f.fit && FIT[f.fit]) lines.push(`Fit: ${FIT[f.fit]}.`);
  const len = bottom && f.bottomLength ? (skirtLike ? SKIRT : PANTS)[f.bottomLength] : undefined;
  if (len) lines.push(`${category === 'set' ? 'Bottom length' : category === 'dress' ? 'Length' : skirtLike ? 'Skirt length' : 'Leg length'}: ${len}.`);
  if (bottom && f.shape && SHAPE[f.shape]) lines.push(`${skirtLike ? 'Shape' : 'Leg shape'}: ${SHAPE[f.shape]}.`);
  if (f.details) lines.push(`Detail: ${f.details}.`);
  const photo = f.photo ? PHOTO[f.photo] : '';
  if (!lines.length && !photo) return '';
  const head = lines.length
    ? ` GARMENT FACTS (checked against the real garment by the operator): ${lines.join(' ')} These decide the garment's length, fit and where its details sit, over anything image 2, image 1 or a cropped frame seems to show; image 2 still decides the fabric, colour, print, seams and trims.`
    : '';
  return `${head}${photo ? ` ${photo}` : ''}`;
}

/** The vision read that pre-fills the card. The operator confirms it; nothing here reaches a render unchecked. */
export const FACTS_READ_PROMPT = (known: { title?: string; category?: string; description?: string }) =>
  'This is a product photo of one garment from a clothing wholesaler, often a quick office snapshot on a hanger, a dress form, laid flat, or worn. ' +
  `Listing title: "${clean(known.title, 120)}". Category: ${clean(known.category, 20) || 'unknown'}. ` +
  'Read the garment and reply with ONE line of JSON and nothing else: ' +
  '{"photo":"hanger|flat|mannequin|worn","topLength":"cropped|waist|hip|tunic|longline|null","bottomLength":"shorts|knee|capri|cropped|ankle|full|floor|mini|midi|maxi|null",' +
  '"sleeve":"sleeveless|short|elbow|three-quarter|long|extra-long|null","fit":"fitted|regular|relaxed|oversized|boxy|null",' +
  '"shape":"skinny|straight|wide|barrel|flare|jogger|balloon|a-line|pencil|null","details":"",' +
  '"why":{"<field>":{"en":"<one short reason with what you measured>","ko":"<the same reason in Korean>"}},"sure":{"<field>":"high|medium|low"}}. ' +
  'Fill only the fields that apply: a top has no bottomLength or shape, pants have no sleeve or fit. ' +
  'PANT LENGTH: do not trust how long the pants look. Measure in the photo, along one leg: R = from the top of the waistband down to the crotch point, L = from the top of the waistband down to the hem. ' +
  'L/R about 1.4 = shorts, 2.0 = knee, 2.7 = capri (7/10, mid-calf), 3.0 = cropped (8/10, above the ankle), 3.3 = ankle (9/10), 3.5 or more = full. ' +
  'Put L, R and the ratio in the reason. Skirts and dresses: mini, knee, midi or maxi by the same idea against the waist-to-hip depth. ' +
  'SLEEVES: compare the sleeve to the body: a long sleeve reaches about as far below the shoulder as the body is long from shoulder to hip. ' +
  'SHAPE: wide = the leg is already wide at the hip and stays wide; straight = the same width from knee to hem; barrel = widest at the knee and narrower at the hem; flare = narrow at the knee, wider at the hem. ' +
  'details = only a construction fact that is easy to get wrong, in under 15 words (e.g. which side a print or panel is on, a slit, a tie); else "". ' +
  'Use null for anything you cannot see. The description below is marketing copy and may be wrong about length or fit: trust the photo. ' +
  `Description: "${clean(known.description, 400)}"`;

export interface FactsRead { facts: GarmentFacts | null; why: Record<string, { en?: string; ko?: string }>; sure: Record<string, string> }

/** Parses the read; anything malformed or unknown is dropped, never guessed. */
export function parseFactsRead(text: string): FactsRead | null {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let raw: any;
  try { raw = JSON.parse(m[0]); } catch { return null; }
  const facts = cleanFacts(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null && v !== 'null')));
  const keep = new Set(Object.keys(facts || {}));
  const why: FactsRead['why'] = {}, sure: FactsRead['sure'] = {};
  for (const k of keep) {
    const w = raw?.why?.[k];
    if (w && typeof w === 'object') why[k] = { en: clean(w.en, 200) || undefined, ko: clean(w.ko, 200) || undefined };
    const s = clean(raw?.sure?.[k], 10).toLowerCase();
    if (['high', 'medium', 'low'].includes(s)) sure[k] = s;
  }
  return { facts, why, sure };
}
