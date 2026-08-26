"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A right-hand slide-over for the surfaces the Split Ledger demoted.
 *
 * The rail and the output panel were not deleted — everything they do beyond
 * the ledger's own loop is real (canvas override, model and export settings,
 * feedback regeneration, batch grids, the full routing trail). What changed is
 * that they no longer hold permanent space. They are summoned.
 *
 * Deliberately not a modal in the aria sense of trapping the world: the run on
 * the stage stays visible beside it, because "compare this against what the
 * rail says" is the reason to open it at all.
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
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Move focus in so the panel is reachable from the keyboard immediately.
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/25 backdrop-blur-[1px]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        className={`relative flex h-full w-full flex-col border-l border-neutral-200 bg-white shadow-2xl outline-none ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
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
      </div>
    </div>
  );
}
