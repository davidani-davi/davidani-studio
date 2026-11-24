/**
 * Look sheet (Model Studio upgrade #3, 2026-11-24). After the front render is approved, one neutral sheet shows the
 * same garment from the front, back and side. Later Simple views send it as `anchorSheetUrl` (image 3) instead of the
 * front render, so back and side details match. Faces never come from it: the base photo's face is pixel-protected.
 * Opt-in and paid (one GPT Image 2.5 edit), so the route asks for `confirmSpend: true`.
 */
export interface LookSheetInput {
  frontRenderUrl: string;
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
    backPhotoUrl: isUrl(body.backPhotoUrl) ? body.backPhotoUrl : undefined,
    sidePhotoUrl: isUrl(body.sidePhotoUrl) ? body.sidePhotoUrl : undefined,
    title: typeof body.title === 'string' ? body.title.slice(0, 160) : undefined,
    color: typeof body.color === 'string' ? body.color.slice(0, 60) : undefined,
  };
}

/** Image 1 = the approved front render (canvas); then the product back and side photos when there are any. */
export function lookSheetInput(o: LookSheetInput) {
  const extras = [o.backPhotoUrl, o.sidePhotoUrl].filter(isUrl);
  const name = [o.color, o.title].filter(Boolean).join(' ') || 'garment';
  const roles = [
    'image 1 = this garment already rendered on the model for the front view: the truth for colour, fit, length and lighting',
    ...(o.backPhotoUrl ? ['image 2 = the product photographed from the back: the truth for every back detail'] : []),
    ...(o.sidePhotoUrl ? [`image ${o.backPhotoUrl ? 3 : 2} = the product photographed from the side: the truth for the side seam, sleeve and drape`] : []),
  ];
  const prompt = [
    `Make a look sheet of this ${name}: three panels side by side on one plain light-grey ground with soft, even studio light.`,
    'Left panel: the same woman and outfit seen from the front, neck to feet. Middle panel: the same outfit seen from directly behind, full length. Right panel: the same outfit in true side profile, full length.',
    `IMAGE ROLES: ${roles.join('. ')}. PRIORITY when they disagree: the product photographs for construction, then image 1 for colour, fit and length.`,
    'The garment is identical in all three panels: one colour, one fabric, one hem length, the same print scale and placement. Every other piece of clothing stays as in image 1.',
    'Exactly one figure per panel, no text, labels, arrows or borders.',
  ].join(' ');
  return { prompt, canvasImageUrl: o.frontRenderUrl, garmentImageUrls: extras.length ? extras : [o.frontRenderUrl] };
}

/** A sheet is three panels wide: 3:2 landscape at the GPT edit's native pixel budget. */
export const LOOK_SHEET_SIZE = { width: 1536, height: 1024 };
