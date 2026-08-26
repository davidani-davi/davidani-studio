/**
 * Whether the composer should duck out of the way.
 *
 * The composer is ~470px of permanently docked bar. That is the right trade
 * while you are setting up the next run and the wrong one while you are
 * scrolling back through the ledger looking for what a change did — it takes
 * half the column to show controls you are not touching.
 *
 * DECISION: reveal on scroll-UP, not on idle.
 *
 * Idle-reveal is the more common pattern and it is wrong here: you stop
 * scrolling exactly when you have found the run you were looking for, so the
 * panel would spring back over the card at the moment you started reading it.
 * Scrolling up is an unambiguous "I am done going backwards".
 */

/** Ignore jitter and trackpad rubber-banding. */
export const DOCK_THRESHOLD = 10;
/** Within this of the newest run, the composer is always up. */
export const DOCK_TOP_ZONE = 24;

export interface DockInput {
  hidden: boolean;
  top: number;
  lastTop: number;
  /** How much the feed can actually scroll. */
  overflow: number;
}

export function nextDockHidden({ hidden, top, lastTop, overflow }: DockInput): boolean {
  // Nothing to scroll past means nothing to get out of the way of — and a feed
  // that barely overflows would otherwise flicker the composer on every nudge.
  if (overflow <= DOCK_THRESHOLD) return false;
  // The top of the feed is the newest run, which is the one you are most
  // likely to be acting on. Never hide the controls there.
  if (top <= DOCK_TOP_ZONE) return false;
  const delta = top - lastTop;
  if (delta > DOCK_THRESHOLD) return true;
  if (delta < -DOCK_THRESHOLD) return false;
  return hidden;
}
