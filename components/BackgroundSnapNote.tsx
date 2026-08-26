"use client";

import {
  summarizeBackgroundSnap,
  type BackgroundSnapReport,
  type BackgroundSnapTone,
} from "@/lib/background-snap";

/**
 * What the #edeeee backdrop snap did to the image currently on screen.
 *
 * Sits under "How this was routed" because it answers the other half of the
 * same question: routing says what the studio decided BEFORE generating, this
 * says what it found AFTERWARDS. The one case worth the pixels is a decline —
 * the render kept a background the pass could not touch, and nothing in a
 * thumbnail says so.
 */

const TONE: Record<BackgroundSnapTone, { wrap: string; dot: string }> = {
  // Only "warn" earns colour. A snap that worked is bookkeeping, and painting
  // every successful run amber would train the operator to ignore the amber.
  warn: { wrap: "border-amber-200 bg-amber-50", dot: "bg-amber-400" },
  snapped: { wrap: "border-neutral-200 bg-neutral-50", dot: "bg-brand-500" },
  clean: { wrap: "border-neutral-200 bg-neutral-50", dot: "bg-neutral-300" },
};

export default function BackgroundSnapNote({ snap }: { snap: BackgroundSnapReport }) {
  const summary = summarizeBackgroundSnap(snap);
  const tone = TONE[summary.tone];

  return (
    <div className={`mb-3 rounded-xl border p-3 ${tone.wrap}`}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        Backdrop
      </div>
      <div className="grid grid-cols-[0.5rem_1fr] items-start gap-x-2.5">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 rounded-full ${tone.dot}`} />
        <div>
          <span className="block text-[12px] font-semibold leading-snug text-neutral-800">
            {summary.headline}
          </span>
          {summary.detail && (
            <span className="mt-0.5 block text-[10px] leading-snug text-neutral-500">
              {summary.detail}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
