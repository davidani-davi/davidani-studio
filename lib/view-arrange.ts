/**
 * Puts the photos of an uploaded reference set under the right views (David, 2026-10-30). Jeonga's CELINE 4 was
 * saved with her back photo as Front, the full-length shot as Back and the waist-up shot as Full: the front had no
 * outline and Generate stayed grey, and every view would have rendered the wrong pose.
 *
 * Each photo is read once (lib/fal.ts readReferenceView): which way she faces and whether her feet show. Only clear
 * mix-ups move, and only when every photo was read: a back photo in a front/side/full slot swaps with the Back slot,
 * a side photo in the Front slot swaps with Side, and a full-length Front swaps with a Full that is not full-length.
 */
export type SetView = 'front' | 'side' | 'back' | 'full';
export type ViewRead = { facing: 'front' | 'side' | 'back'; feet: boolean };
export const SET_VIEWS: SetView[] = ['front', 'side', 'back', 'full'];

/** One line of JSON from the vision model, or null when it is not exactly the expected shape. */
export function parseViewRead(output: string): ViewRead | null {
  const m = String(output || '').match(/\{[^{}]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return ['front', 'side', 'back'].includes(j?.facing) && typeof j?.feet === 'boolean' ? { facing: j.facing, feet: j.feet } : null;
  } catch {
    return null;
  }
}

/** New view → the view its photo was saved under, for the views that move; null when nothing moves. */
export function arrangeViews(read: Partial<Record<SetView, ViewRead | null>>): Partial<Record<SetView, SetView>> | null {
  const slots = SET_VIEWS.filter((v) => v in read);
  if (slots.length < 2 || slots.some((v) => !read[v])) return null;
  const at = Object.fromEntries(slots.map((v) => [v, v])) as Record<SetView, SetView>;
  const r = (slot: SetView) => (slot in at ? read[at[slot]]! : undefined);
  const swap = (a: SetView, b: SetView) => { [at[a], at[b]] = [at[b], at[a]]; };
  // Her back to the camera belongs under Back.
  if (r('back') && r('back')!.facing !== 'back') {
    const c = slots.filter((s) => s !== 'back' && r(s)!.facing === 'back');
    if (c.length === 1) swap('back', c[0]);
  }
  // A turned pose in the Front slot belongs under Side.
  if (r('side') && r('front') && r('side')!.facing === 'front' && r('front')!.facing === 'side') swap('front', 'side');
  // Full is the full-length shot.
  if (r('full') && r('front') && !r('full')!.feet && r('full')!.facing !== 'back' && r('front')!.feet && r('front')!.facing !== 'back') swap('front', 'full');
  const moved = Object.fromEntries(slots.filter((s) => at[s] !== s).map((s) => [s, at[s]])) as Partial<Record<SetView, SetView>>;
  return Object.keys(moved).length ? moved : null;
}
