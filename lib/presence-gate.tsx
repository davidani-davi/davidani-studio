"use client";

import { useIsPresent } from "motion/react";
import type { ReactNode } from "react";

/**
 * Vendored from beui.dev/components.
 *
 * Reads the presence of the subtree it renders and hands it down, so an
 * overlay that AnimatePresence is still playing out stops taking pointer
 * events and drops out of the focus and accessibility trees in the same commit
 * the exit starts — an exiting dialog is not a dialog you can still type into.
 */
export interface PresenceGateRenderProps {
  isPresent: boolean;
  gate: {
    inert: boolean;
    style: { pointerEvents: "auto" | "none" };
  };
}

export function PresenceGate({
  children,
}: {
  children: (props: PresenceGateRenderProps) => ReactNode;
}) {
  const isPresent = useIsPresent();
  return children({
    isPresent,
    gate: {
      inert: !isPresent,
      style: { pointerEvents: isPresent ? "auto" : "none" },
    },
  });
}
