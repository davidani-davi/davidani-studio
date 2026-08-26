/**
 * How long a typed style number stays valid.
 *
 * WHY THIS IS LOGIC AND NOT A ONE-LINER
 * -------------------------------------
 * The style number is the ERP routing key. It selects the category, and when
 * present it also builds a gallery contact sheet, so the garment is described
 * from that style's own photographs rather than the intake photo
 * (app/api/analyze/route.ts). Nothing used to clear it. Load the next SKU's
 * photo without retyping and the render went through the PREVIOUS style's
 * category and gallery — the garment was literally described from a different
 * style's pictures. The output came back confident, plausible and wrong.
 *
 * Clearing on any change to the field's surroundings is too blunt in both
 * directions, which is the whole reason this is a function with tests:
 *
 *  - Typing the style BEFORE uploading is a normal order of operations. A
 *    first upload must not wipe what the user just typed.
 *  - Emptying the slot is not a SKU change on its own. But the per-SKU loop an
 *    operator actually runs is Remove-then-Upload, so the empty state in the
 *    middle must not make the replacement look like a first upload. That is
 *    why callers track the last NON-EMPTY photo rather than the current one.
 */

/**
 * Whether a style number typed against `previousPhoto` still applies now that
 * `nextPhoto` is in the front slot.
 *
 * `previousPhoto` is the last non-empty front photo seen, or null if there has
 * not been one. `nextPhoto` is the current front photo.
 */
export function styleNumberSurvives(
  previousPhoto: string | null,
  nextPhoto: string | null
): boolean {
  // Slot emptied — the user may be mid-swap. Keep the value; the next non-empty
  // photo is what decides.
  if (!nextPhoto) return true;
  // First photo of the session: nothing has been replaced, so a style typed in
  // advance is still about this garment.
  if (!previousPhoto) return true;
  // Same photo re-reported (re-render, slot reassigned to the same URL).
  if (previousPhoto === nextPhoto) return true;
  // One photo replaced another: a different garment, so a different SKU.
  return false;
}
