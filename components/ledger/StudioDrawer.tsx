"use client";

import type { ReactNode } from "react";
import { Drawer } from "@/components/motion/drawer";

/**
 * A titled right-hand slide-over for the surfaces the Split Ledger demoted.
 *
 * The rail and the output panel were not deleted — everything they do beyond
 * the ledger's own loop is real (canvas override, model and export settings,
 * feedback regeneration, batch grids, the full routing trail). What changed is
 * that they no longer hold permanent space. They are summoned.
 *
 * The panel itself is beUI's Drawer. The hand-rolled version this replaced was
 * a worse copy of it: no spring, no body scroll lock, and — the part that
 * actually matters — nothing releasing pointer events and focus while an
 * exiting panel was still on screen. beUI's PresenceGate does that in the same
 * commit the exit begins. This component is now only the header.
 */
export default function StudioDrawer({
  open,
  title,
  subtitle,
  wide,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Run details needs more room than Setup. */
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      ariaLabel={title}
      className={wide ? "w-[46rem]" : "w-[26rem]"}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-neutral-200 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="rounded-md px-2 py-1 text-[16px] leading-none text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </Drawer>
  );
}
