/**
 * Render quality for Simple garment swap (2026-11-03, DET60450 polka dots).
 *
 * Simple GPT renders run at GPT "medium" quality (resolution "2K" in
 * buildGptImageOptions, since 24097e8). Small all-over prints (polka dots,
 * ditsy florals) speckle and blur at medium. `quality: "high"` renders the
 * same 2048x3072 frame at GPT "high" quality: cleaner small prints, about the
 * same time, more cost per render. Nano keeps its own 1K path and has no
 * High option.
 *
 * Other modes read `body.quality` their own way (house reference sets use
 * lib/no-plate.ts noPlateQualityOf), so this only judges Simple requests.
 */
export type SimpleQuality = 'medium' | 'high';

export function simpleQualityOf(v: unknown): SimpleQuality {
  return v === 'high' ? 'high' : 'medium';
}

/** '' when the request may run; otherwise the message to send back with a 400. */
export function simpleQualityRefusal(o: { quality: unknown; editMode: unknown; nano: boolean }): string {
  if (o.editMode !== 'simple' || o.quality == null || o.quality === '') return '';
  if (o.quality !== 'standard' && o.quality !== 'medium' && o.quality !== 'high') return 'Choose Standard or High quality.';
  if (o.quality === 'high' && o.nano) return 'High quality works with GPT Image 2.5 or GPT 2, not Nano.';
  return '';
}

/** The `resolution` sent to generate-model for a Simple GPT render. */
export function simpleGptResolution(q: SimpleQuality): '2K' | '4K' {
  return q === 'high' ? '4K' : '2K';
}
