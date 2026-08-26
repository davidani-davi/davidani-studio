"use client";

import { useCallback, useEffect, useRef } from "react";
import { LEDGER_DEFAULT, clampLedgerWidth } from "@/lib/pane-size";

/**
 * The draggable seam between the ledger and the stage.
 *
 * The split was fixed at minmax(376px, 428px), which is one opinion about a
 * question that has more than one right answer: reading a long garment
 * description wants a wider ledger, judging a print placement wants a wider
 * stage, and the same operator wants both within a minute of each other.
 *
 * Pointer capture rather than window listeners, so a fast drag that outruns
 * the cursor keeps delivering moves to this element instead of dropping them
 * on whatever it passes over. Arrow keys move it too — this is a real
 * separator, not a mouse-only affordance — and a double-click resets it.
 */
export default function PaneSplitter({
  width,
  onWidth,
  onCommit,
}: {
  width: number;
  onWidth: (width: number) => void;
  /** Called once when the drag ends, so persistence is not written per pixel. */
  onCommit: (width: number) => void;
}) {
  const dragging = useRef(false);
  const latest = useRef(width);
  latest.current = width;

  const apply = useCallback(
    (next: number) => {
      const clamped = clampLedgerWidth(next, window.innerWidth);
      latest.current = clamped;
      onWidth(clamped);
      return clamped;
    },
    [onWidth]
  );

  // A window that shrinks under a wide ledger has to give the stage its room
  // back, or the renders end up narrower than the ledger on a laptop.
  useEffect(() => {
    function onResize() {
      const clamped = clampLedgerWidth(latest.current, window.innerWidth);
      if (clamped !== latest.current) {
        latest.current = clamped;
        onWidth(clamped);
      }
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      // Unmounting mid-drag must not leave the whole app unselectable.
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [onWidth]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the run ledger"
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        // Without this a drag across the stage selects every caption it
        // passes over, and the cursor flickers between col-resize and text.
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        // Measured from the layout's left edge rather than accumulated from a
        // delta, so the seam cannot drift away from the cursor over a long drag.
        const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
        apply(e.clientX - left);
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        onCommit(latest.current);
      }}
      onDoubleClick={() => onCommit(apply(LEDGER_DEFAULT))}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === "ArrowLeft") onCommit(apply(latest.current - step));
        else if (e.key === "ArrowRight") onCommit(apply(latest.current + step));
        else if (e.key === "Home") onCommit(apply(LEDGER_DEFAULT));
        else return;
        e.preventDefault();
      }}
      title="Drag to resize · double-click to reset"
      className="group relative z-10 hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-neutral-200 transition hover:bg-brand-400 focus-visible:bg-brand-500 focus-visible:outline-none lg:block"
    >
      {/* A wider invisible target than the seam is drawn, because a 6px hit
          area is a fiddly thing to grab. */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-400 opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}
