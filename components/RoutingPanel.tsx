"use client";

import {
  summarizeRouting,
  type CanvasSummary,
  type RoutingPayload,
  type RoutingRow,
} from "@/lib/routing-summary";

/**
 * Shows how the studio arrived at this render.
 *
 * Replaces the product-shot preset grid. That grid offered a canvas choice
 * that outranked the routed one, which stopped making sense once the category
 * came from the ERP and the style code: the useful correction is to the INPUT
 * (a wrong style number, a wrong category), not to the canvas that fell out of
 * it. So this panel is read-only by design — it explains, and the fix lives
 * one section up in the style field.
 */

const STATE_DOT: Record<RoutingRow["state"], string> = {
  decided: "bg-brand-500",
  overridden: "bg-neutral-300",
  fallback: "bg-amber-400",
  muted: "bg-neutral-300",
};

export default function RoutingPanel({
  routing,
  canvas,
  pending,
}: {
  routing: RoutingPayload | null;
  canvas: CanvasSummary | null;
  /** True while an analyze call is in flight, so the panel can hold its shape. */
  pending?: boolean;
}) {
  const rows = summarizeRouting(routing, canvas);

  if (pending) {
    return (
      <p className="text-[11px] text-neutral-500">Working out the category and canvas…</p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Upload a product photo to see which category, canvas and description source this style
        resolves to.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {rows.map((row, i) => (
        <li
          key={row.key}
          className={`grid grid-cols-[0.5rem_1fr] items-start gap-x-2.5 py-2 ${
            i < rows.length - 1 ? "border-b border-neutral-100" : "pb-0"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-1.5 h-2 w-2 rounded-full ${STATE_DOT[row.state]}`}
          />
          <div>
            <span className="block text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
              {row.label}
            </span>
            <span className="block text-[12px] font-semibold leading-snug text-neutral-800">
              {row.struck && (
                <span className="mr-1.5 font-medium text-neutral-400 line-through">
                  {row.struck}
                </span>
              )}
              {row.value}
            </span>
            {row.note && (
              <span className="mt-0.5 block text-[10px] leading-snug text-neutral-500">
                {row.note}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
