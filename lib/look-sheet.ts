/**
 * Look sheet (Model Studio upgrade #3, 2026-11-24). After the front render is approved, one neutral sheet shows the
 * same garment from the front, back and side. Later Simple views send it as `anchorSheetUrl` (image 3) instead of the
 * front render, so back and side details match. Faces never come from it: the base photo's face is pixel-protected.
 * Opt-in and paid (one GPT Image 2.5 edit), so the route asks for `confirmSpend: true`.
 *
 * Length (A/B 2026-11-24, DT70171): the first sheets took the hem from the front render alone and drew a mid-calf
 * duster at the knee, and the back render then copied the short hem. So the product's own front photo now rides as
 * image 2 and decides the hem, with the planned hem (lib/plate-framing.ts hemFor) stated as a body position.
 */
export type SheetHem = 'long' | 'mid' | 'short';
export interface LookSheetInput {
  frontRenderUrl: string;
  /** The product photographed from the front: the truth for hem length. */
  frontPhotoUrl?: string;
  /** The hem the run was planned with (hemFor). */
  hem?: SheetHem;
  backPhotoUrl?: string;
  sidePhotoUrl?: string;
  title?: string;
  color?: string;
}

const isUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//.test(u);

export function parseLookSheet(body: Record<string, unknown>): LookSheetInput | string {
  if (!isUrl(body.frontRenderUrl)) return 'Render and approve the front first: the look sheet is made from it.';
  return {
    frontRenderUrl: body.frontRenderUrl,
    frontPhotoUrl: isUrl(body.frontPhotoUrl) ? body.frontPhotoUrl : undefined,
    hem: body.hem === 'long' || body.hem === 'mid' || body.hem === 'short' ? body.hem : undefined,
    backPhotoUrl: isUrl(body.backPhotoUrl) ? body.backPhotoUrl : undefined,
    sidePhotoUrl: isUrl(body.sidePhotoUrl) ? body.sidePhotoUrl : undefined,
    title: typeof body.title === 'string' ? body.title.slice(0, 160) : undefined,
    color: typeof body.color === 'string' ? body.color.slice(0, 60) : undefined,
  };
}

const HEM: Record<SheetHem, string> = {
  long: 'This is a long garment: its hem falls well below the knee, at mid-calf or lower. Never end it at the hip, thigh or knee.',
  mid: 'Its hem falls at the knee.',
  short: 'It is cropped: its hem ends above the waist.',
};

/** Image 1 = the approved front render (canvas); then the product front, back and side photos when there are any. */
export function lookSheetInput(o: LookSheetInput) {
  const photos = ([['front', o.frontPhotoUrl], ['back', o.backPhotoUrl], ['side', o.sidePhotoUrl]] as const)
    .filter((e): e is readonly ['front' | 'back' | 'side', string] => isUrl(e[1]));
  const name = [o.color, o.title].filter(Boolean).join(' ') || 'garment';
  const truth = { front: 'the truth for the hem length and the front construction', back: 'the truth for every back detail', side: 'the truth for the side seam, sleeve and drape' };
  const roles = [
    `image 1 = this garment already rendered on the model for the front view: the truth for colour, fit${o.frontPhotoUrl ? '' : ', length'} and lighting`,
    ...photos.map(([kind], i) => `image ${i + 2} = the product photographed from the ${kind}: ${truth[kind]}`),
  ];
  const frontN = o.frontPhotoUrl ? 2 : 0;
  const length = [
    frontN ? `HEM LENGTH: measure where the hem of image ${frontN} falls against the body (hip, mid-thigh, knee, mid-calf or ankle) and put it at that same point in all three panels, even where image 1 shows it shorter.` : '',
    o.hem ? HEM[o.hem] : '',
  ].filter(Boolean).join(' ');
  const prompt = [
    `Make a look sheet of this ${name}: three panels side by side on one plain light-grey ground with soft, even studio light.`,
    'Left panel: the same woman and outfit seen from the front, neck to feet. Middle panel: the same outfit seen from directly behind, full length. Right panel: the same outfit in true side profile, full length.',
    `IMAGE ROLES: ${roles.join('. ')}. PRIORITY when they disagree: the product photographs for construction${frontN ? ' and hem length' : ''}, then image 1 for colour${frontN ? ' and fit' : ', fit and length'}.`,
    ...(length ? [length] : []),
    'The garment is identical in all three panels: one colour, one fabric, one hem length, the same print scale and placement. Every other piece of clothing stays as in image 1.',
    'Exactly one figure per panel, no text, labels, arrows or borders.',
  ].join(' ');
  return { prompt, canvasImageUrl: o.frontRenderUrl, garmentImageUrls: photos.length ? photos.map(([, u]) => u) : [o.frontRenderUrl] };
}

/** A sheet is three panels wide: 3:2 landscape at the GPT edit's native pixel budget. */
export const LOOK_SHEET_SIZE = { width: 1536, height: 1024 };
