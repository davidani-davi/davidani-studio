import type { ShotRequest } from "./types";

/**
 * Front variants (Model Studio upgrade #4, 2026-11-24): 1-3 takes of the same front, each its own async task
 * (`<requestId>-v1`…). Same inputs, so the face lock and pose stay put; only the model's own variation differs.
 * Default 1, cap 3, and the page shows the cost before the run.
 */
export const MAX_VARIANTS = 3;
/** fal GPT Image 2.5 edit at medium/2K, per render (studio rough figure; refresh from fal billing when it moves). */
export const RENDER_COST_USD = 0.12;

export const clampVariants = (n: unknown): number => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_VARIANTS, Math.max(1, v)) : 1;
};

export function variantRequests(base: ShotRequest, n: unknown): ShotRequest[] {
  const count = clampVariants(n);
  if (count === 1) return [base];
  return Array.from({ length: count }, (_, i) => ({ ...base, requestId: `${base.requestId}-v${i + 1}` }));
}

export const variantCostText = (n: unknown): string => {
  const count = clampVariants(n);
  return `${count} render${count > 1 ? "s" : ""} · about $${(count * RENDER_COST_USD).toFixed(2)}`;
};

/** "Use this": the picked take becomes the front; the others are kept only as history. */
export function pickVariant<T extends { url?: string }>(takes: T[], index: number): { chosen: T; others: T[] } {
  const chosen = takes[index];
  if (!chosen?.url) throw Error("That take has no image yet.");
  return { chosen, others: takes.filter((t, i) => i !== index && Boolean(t?.url)) };
}
