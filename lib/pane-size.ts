/**
 * How wide the run ledger is allowed to be.
 *
 * The Split Ledger's whole argument is that the renders get the room, so the
 * bounds here are not decoration: below LEDGER_MIN the composer's two intake
 * tiles stop fitting side by side, and STAGE_MIN is roughly where two
 * 2160x2700 renders shown together stop being large enough to judge — which is
 * the failure the layout was rebuilt to fix.
 */
export const LEDGER_MIN = 336;
export const LEDGER_MAX = 640;
export const LEDGER_DEFAULT = 428;
export const STAGE_MIN = 420;

/**
 * The width to actually use, given what the operator dragged to and how much
 * window there is.
 *
 * Clamped against the viewport as well as the fixed bounds, because a width
 * saved on a wide monitor must not swallow the stage on a laptop later.
 */
export function clampLedgerWidth(width: number, available: number): number {
  if (!Number.isFinite(width)) return LEDGER_DEFAULT;
  // A window too narrow to honour both minimums gives the ledger its minimum
  // and lets the stage take what is left; the stacked layout takes over below
  // 1024px anyway.
  const ceiling = Math.max(LEDGER_MIN, Math.min(LEDGER_MAX, available - STAGE_MIN));
  return Math.round(Math.min(ceiling, Math.max(LEDGER_MIN, width)));
}

/** Parse a persisted width, ignoring anything that is not one. */
export function readLedgerWidth(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
