"use client";

import { useEffect, useRef, useState } from "react";
import { seamScore, SEAM_SCORE_THRESHOLD } from "@/lib/cad-export";

interface Props {
  imageUrl: string;
  onReroll: () => void;
  rerolling: boolean;
}

type Score = { value: number } | "unavailable" | null;

export default function CadTilingPreview({ imageUrl, onReroll, rerolling }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState<Score>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;

      // Visible 2×2 preview, downscaled.
      const canvas = canvasRef.current;
      if (canvas) {
        const cell = 300;
        canvas.width = cell * 2;
        canvas.height = cell * 2;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          for (let x = 0; x < 2; x++) {
            for (let y = 0; y < 2; y++) {
              ctx.drawImage(img, x * cell, y * cell, cell, cell);
            }
          }
        }
      }

      // Seam score from full-res edges (needs untainted canvas).
      try {
        const off = document.createElement("canvas");
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const octx = off.getContext("2d");
        if (!octx) throw new Error("no ctx");
        octx.drawImage(img, 0, 0);
        const w = off.width;
        const h = off.height;
        const left = octx.getImageData(0, 0, 1, h).data;
        const right = octx.getImageData(w - 1, 0, 1, h).data;
        const top = octx.getImageData(0, 0, w, 1).data;
        const bottom = octx.getImageData(0, h - 1, w, 1).data;
        const value = seamScore([
          { a: Array.from(left), b: Array.from(right) },
          { a: Array.from(top), b: Array.from(bottom) },
        ]);
        if (!cancelled) setScore({ value });
      } catch {
        if (!cancelled) setScore("unavailable");
      }
    };
    img.onerror = () => {
      if (!cancelled) setScore("unavailable");
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const seamless = score && score !== "unavailable" && score.value <= SEAM_SCORE_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">Tiling preview (2×2)</h3>
        {score === "unavailable" ? (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">Check visually</span>
        ) : score ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              seamless ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {seamless ? "Seamless ✓" : `Seam visible ⚠ (${score.value})`}
          </span>
        ) : null}
      </div>
      <canvas ref={canvasRef} className="block w-full rounded-lg border border-neutral-200" />
      <button
        type="button"
        onClick={onReroll}
        disabled={rerolling}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
      >
        {rerolling ? "Re-rolling…" : "Re-roll for tighter seam"}
      </button>
    </div>
  );
}
