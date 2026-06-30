# CAD Phase 1 — Print-Ready Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CAD Pattern Extractor output digital print files a manufacturer can print directly — with a real-world repeat size (cm), a verified-seamless check, and a one-click export of a DPI-stamped image plus a spec sheet.

**Architecture:** Three focused client components under `components/cad/` (scale measurement overlay, 2×2 tiling preview, export panel) plus a pure-helpers module `lib/cad-export.ts` and one server route `app/api/cad-export/route.ts` (sharp DPI-stamp + spec-sheet PNG). `components/CadExtractorClient.tsx` is modified only to own a little state and render the three children after a result exists. Colorway reuses the existing `analyzeTextileSpec` / `/api/cad-spec`.

**Tech Stack:** Next.js (App Router, client components), TypeScript, React, `sharp ^0.34.5`, Tailwind, fal.ai via `lib/fal.ts`.

## Global Constraints

- **No test framework**: repo scripts are only `dev`, `build`, `lint` (matches the existing `2026-06-26-cad-pattern-extractor` plan). Verification is `npx tsc --noEmit` (typecheck), `npm run lint`, `npm run build`, targeted `node -e` checks for pure math, and a manual dev-server smoke test. Do NOT add Jest/Vitest.
- **Tile size is `2048 × 2048`**: every image result is square 2048² (the existing `CAD_STUDIO_OUTPUT_SIZE` lock). DPI derives from this constant via `repeatCmToDpi`.
- **No new npm dependencies**: `sharp` (already installed) covers DPI metadata and spec-sheet PNG rendering. No PDF library.
- **Server routes**: `export const runtime = "nodejs"` and `export const maxDuration = 300`.
- **Colorway is hex-only** in Phase 1 (no Pantone). Reuse `CadSpec.palette` (`{hex,name}[]`) and `CadSpec.colorCount`.
- **Seamless is verify-only** in Phase 1 — never auto-modify the artwork. The preview shows a 2×2 tile + a seam-score badge and offers a re-roll action.
- **Scale math is a pure ratio** measured on the original garment photo: `repeatCm = (repeatPx / referencePx) * referenceCm`. The 2048² seamless tile represents one repeat unit.
- **Follow existing patterns**: reuse the `fetchJson` non-JSON guard and the error-toast pattern already in `CadExtractorClient.tsx`.

## File Structure

- **Create** `lib/cad-export.ts` — pure helpers: `repeatCmToDpi`, `seamScore`, `SEAM_SCORE_THRESHOLD`, `buildSpecSheetSvg`, `SpecSheetInput`. No DOM/server deps.
- **Create** `app/api/cad-export/route.ts` — `POST` returns DPI-stamped print PNG + spec-sheet PNG (both base64 data URLs).
- **Create** `components/cad/CadScaleMeasure.tsx` — two-line measurement overlay on the garment photo → `{repeatCm, dpi}`.
- **Create** `components/cad/CadTilingPreview.tsx` — 2×2 canvas + seam-score badge + re-roll button.
- **Create** `components/cad/CadExportPanel.tsx` — spec card (hex colorway) + export button.
- **Modify** `components/CadExtractorClient.tsx` — own `scale` + `spec` state, fetch colorway once per result, render the three children after a result.

---

## Task 1: Pure helpers — `lib/cad-export.ts`

**Files:**
- Create: `lib/cad-export.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function repeatCmToDpi(repeatCm: number, tilePx?: number): number`
  - `const SEAM_SCORE_THRESHOLD: number`
  - `function seamScore(pairs: { a: number[]; b: number[] }[]): number`
  - `interface SpecSheetInput { repeatCm: number | null; dpi: number | null; widthPx: number; heightPx: number; repeatType: string; palette: { hex: string; name: string }[]; colorCount: number }`
  - `function buildSpecSheetSvg(input: SpecSheetInput): string`

- [ ] **Step 1: Create `lib/cad-export.ts`**

```typescript
// Pure helpers for CAD print-ready export. No DOM or server (sharp/fal/node)
// imports, so this module is safe to import from both client components and
// server routes. All functions are deterministic and side-effect free.

const CM_PER_INCH = 2.54;

/**
 * Physical print resolution for a square tile that represents one repeat.
 * A 2048px tile printed at `repeatCm` wide => dpi = px / inches.
 */
export function repeatCmToDpi(repeatCm: number, tilePx = 2048): number {
  if (!(repeatCm > 0) || !(tilePx > 0)) return 0;
  return Math.round(tilePx / (repeatCm / CM_PER_INCH));
}

/**
 * Seam quality for a tile, 0 (perfect) to 100 (worst). Each pair is two edge
 * strips that should match when the tile repeats: the left edge vs the right
 * edge, and the top edge vs the bottom edge. Arrays are flat channel samples
 * (e.g. RGBA bytes). Returns mean absolute per-channel difference scaled 0-100.
 */
export function seamScore(pairs: { a: number[]; b: number[] }[]): number {
  let total = 0;
  let count = 0;
  for (const { a, b } of pairs) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      total += Math.abs(a[i] - b[i]);
      count++;
    }
  }
  if (count === 0) return 0;
  return Math.round(((total / count) / 255) * 100);
}

/** At or below this score the tile is treated as seamless. */
export const SEAM_SCORE_THRESHOLD = 8;

export interface SpecSheetInput {
  repeatCm: number | null;
  dpi: number | null;
  widthPx: number;
  heightPx: number;
  repeatType: string;
  palette: { hex: string; name: string }[];
  colorCount: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Spec-sheet markup, rendered to PNG by sharp in the export route. Fixed
 * 1600x520 canvas: brand header, repeat/dpi/size line, repeat type, and a
 * row of up to 10 colorway swatches with hex labels.
 */
export function buildSpecSheetSvg(input: SpecSheetInput): string {
  const { repeatCm, dpi, widthPx, heightPx, repeatType, palette, colorCount } = input;
  const scaleLine =
    repeatCm && dpi
      ? `Repeat: ${repeatCm.toFixed(1)} × ${repeatCm.toFixed(1)} cm   ·   ${dpi} DPI   ·   ${widthPx} × ${heightPx} px`
      : `Repeat: scale not set   ·   ${widthPx} × ${heightPx} px`;
  const swatches = palette.slice(0, 10);
  const swW = 130;
  const swGap = 14;
  const swX0 = 60;
  const swY = 360;
  const swatchSvg = swatches
    .map((c, i) => {
      const x = swX0 + i * (swW + swGap);
      const hex = escapeXml(c.hex || "#000000");
      return `
    <rect x="${x}" y="${swY}" width="${swW}" height="90" rx="8" fill="${hex}" stroke="#d8d2c8"/>
    <text x="${x + swW / 2}" y="${swY + 118}" font-family="monospace" font-size="20" fill="#5b5249" text-anchor="middle">${hex}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="520" viewBox="0 0 1600 520">
  <rect width="1600" height="520" fill="#f6f2ea"/>
  <text x="60" y="90" font-family="Georgia, serif" font-size="40" fill="#2b2622" letter-spacing="3">DAVI &amp; DANI — TEXTILE PRINT SPEC</text>
  <line x1="60" y1="120" x2="1540" y2="120" stroke="#d8d2c8" stroke-width="2"/>
  <text x="60" y="190" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#3a342e">${escapeXml(scaleLine)}</text>
  <text x="60" y="250" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#6b6258">Repeat type: ${escapeXml(repeatType || "unknown")}</text>
  <text x="60" y="330" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#6b6258">Colorway (${colorCount} colors)</text>${swatchSvg}
</svg>`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. The module is self-contained; nothing imports it yet.

- [ ] **Step 3: Sanity-check the math**

Run: `node -e "const {repeatCmToDpi,seamScore}=require('esbuild-register')||{};" 2>/dev/null; npx --yes tsx -e "import {repeatCmToDpi,seamScore} from './lib/cad-export'; console.log('dpi', repeatCmToDpi(31.6)); console.log('seam-equal', seamScore([{a:[10,20],b:[10,20]}])); console.log('seam-diff', seamScore([{a:[0,0],b:[255,255]}]))" 2>/dev/null || echo "tsx unavailable — verify by reading: repeatCmToDpi(31.6) ≈ 2048/(31.6/2.54)=165; seamScore equal=0; diff=100"`

Expected: `dpi ≈ 165`, `seam-equal 0`, `seam-diff 100`. If `tsx` is unavailable, confirm by reading the formulas (the echo prints the expected values).

- [ ] **Step 4: Commit**

```bash
git add lib/cad-export.ts
git commit -m "feat(cad): add print-export pure helpers (DPI, seam score, spec sheet)"
```

---

## Task 2: Export route — `app/api/cad-export/route.ts`

**Files:**
- Create: `app/api/cad-export/route.ts`

**Interfaces:**
- Consumes: `buildSpecSheetSvg`, `SpecSheetInput` from `lib/cad-export`; `sharp`.
- Produces: `POST /api/cad-export` → `{ ok: true, printFile: string, specSheet: string, dpi: number | null }` (data-URL PNGs) or `{ ok: false, error }`. Body: `{ imageUrl: string; repeatCm: number | null; dpi: number | null; repeatType: string; palette: { hex: string; name: string }[]; colorCount: number }`.

- [ ] **Step 1: Create `app/api/cad-export/route.ts`**

```typescript
import { NextResponse } from "next/server";
import sharp from "sharp";
import { buildSpecSheetSvg } from "@/lib/cad-export";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, repeatCm, dpi, repeatType, palette, colorCount } = body as {
      imageUrl: string;
      repeatCm: number | null;
      dpi: number | null;
      repeatType: string;
      palette: { hex: string; name: string }[];
      colorCount: number;
    };

    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }

    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `Could not fetch result image (HTTP ${resp.status})` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const widthPx = meta.width ?? 2048;
    const heightPx = meta.height ?? 2048;

    // Print file: re-encode as PNG, stamping physical density when scale is set.
    let printPipeline = sharp(buf);
    if (dpi && dpi > 0) {
      printPipeline = printPipeline.withMetadata({ density: dpi });
    }
    const printPng = await printPipeline.png().toBuffer();

    // Spec sheet: render the SVG to PNG.
    const svg = buildSpecSheetSvg({
      repeatCm: repeatCm ?? null,
      dpi: dpi ?? null,
      widthPx,
      heightPx,
      repeatType: repeatType || "unknown",
      palette: Array.isArray(palette) ? palette : [],
      colorCount: Number.isFinite(colorCount) ? colorCount : 0,
    });
    const specPng = await sharp(Buffer.from(svg)).png().toBuffer();

    return NextResponse.json({
      ok: true,
      dpi: dpi ?? null,
      printFile: `data:image/png;base64,${printPng.toString("base64")}`,
      specSheet: `data:image/png;base64,${specPng.toString("base64")}`,
    });
  } catch (err: any) {
    console.error("[cad-export] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Export failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build to confirm the route registers**

Run: `npm run build`
Expected: build succeeds and the route list includes `ƒ /api/cad-export`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cad-export/route.ts
git commit -m "feat(cad): add /api/cad-export — DPI-stamped PNG + spec-sheet PNG"
```

---

## Task 3: Scale measurement overlay — `components/cad/CadScaleMeasure.tsx`

**Files:**
- Create: `components/cad/CadScaleMeasure.tsx`

**Interfaces:**
- Consumes: `repeatCmToDpi` from `lib/cad-export`.
- Produces: default-exported component `CadScaleMeasure`. Props: `{ imageUrl: string; onChange: (scale: { repeatCm: number; dpi: number } | null) => void }`. Calls `onChange` whenever the computed scale changes (or `null` when incomplete).

**Notes:** Endpoints are stored as fractions (0–1) of the displayed image box, so they survive resize and the px ratio is scale-invariant. Two lines: reference (solid) and repeat (dashed). Dragging uses pointer events on SVG handles.

- [ ] **Step 1: Create `components/cad/CadScaleMeasure.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { repeatCmToDpi } from "@/lib/cad-export";

interface Pt {
  x: number; // fraction 0..1 of displayed width
  y: number; // fraction 0..1 of displayed height
}
interface Line {
  a: Pt;
  b: Pt;
}

interface Props {
  imageUrl: string;
  onChange: (scale: { repeatCm: number; dpi: number } | null) => void;
}

const DEFAULT_REF: Line = { a: { x: 0.2, y: 0.15 }, b: { x: 0.5, y: 0.15 } };
const DEFAULT_REPEAT: Line = { a: { x: 0.2, y: 0.6 }, b: { x: 0.5, y: 0.6 } };

type Handle = { line: "ref" | "rep"; end: "a" | "b" } | null;

export default function CadScaleMeasure({ imageUrl, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ref, setRef] = useState<Line>(DEFAULT_REF);
  const [rep, setRep] = useState<Line>(DEFAULT_REPEAT);
  const [refCm, setRefCm] = useState<string>("");
  const [drag, setDrag] = useState<Handle>(null);

  function pxLen(line: Line): number {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const dx = (line.a.x - line.b.x) * rect.width;
    const dy = (line.a.y - line.b.y) * rect.height;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const refPx = pxLen(ref);
  const repPx = pxLen(rep);
  const cm = parseFloat(refCm);
  const repeatCm = cm > 0 && refPx > 0 && repPx > 0 ? (repPx / refPx) * cm : null;
  const dpi = repeatCm ? repeatCmToDpi(repeatCm) : null;

  useEffect(() => {
    onChange(repeatCm && dpi ? { repeatCm, dpi } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatCm, dpi]);

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const setter = drag.line === "ref" ? setRef : setRep;
    setter((cur) => ({ ...cur, [drag.end]: { x, y } }));
  }

  function handle(line: "ref" | "rep", end: "a" | "b", color: string) {
    const src = line === "ref" ? ref : rep;
    const p = src[end];
    return (
      <circle
        cx={`${p.x * 100}%`}
        cy={`${p.y * 100}%`}
        r={9}
        fill="white"
        stroke={color}
        strokeWidth={3}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          setDrag({ line, end });
        }}
        onPointerUp={() => setDrag(null)}
      />
    );
  }

  function lineEl(line: Line, color: string, dashed: boolean) {
    return (
      <line
        x1={`${line.a.x * 100}%`}
        y1={`${line.a.y * 100}%`}
        x2={`${line.b.x * 100}%`}
        y2={`${line.b.y * 100}%`}
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={dashed ? "8 6" : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="relative select-none overflow-hidden rounded-lg border border-neutral-200"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setDrag(null)}
      >
        <img src={imageUrl} alt="Garment for measuring" className="block w-full" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {lineEl(ref, "#0e7490", false)}
          {lineEl(rep, "#b45309", true)}
          <g className="pointer-events-auto">
            {handle("ref", "a", "#0e7490")}
            {handle("ref", "b", "#0e7490")}
            {handle("rep", "a", "#b45309")}
            {handle("rep", "b", "#b45309")}
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded bg-cyan-700" /> Reference
        </span>
        <label className="inline-flex items-center gap-1.5">
          real length
          <input
            type="number"
            inputMode="decimal"
            value={refCm}
            onChange={(e) => setRefCm(e.target.value)}
            placeholder="cm"
            className="w-20 rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-brand-500"
          />
          cm
        </label>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-amber-700" /> Repeat span
        </span>
      </div>

      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        {repeatCm && dpi ? (
          <span>
            Print at <b>{repeatCm.toFixed(1)} × {repeatCm.toFixed(1)} cm</b> → <b>{dpi} DPI</b> (2048px tile)
          </span>
        ) : (
          <span className="text-neutral-400">
            Drag the cyan line across a known dimension and enter its cm, then drag the dashed line from one
            motif to the next. Measure both on a flat-facing area to avoid perspective skew.
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in `components/cad/CadScaleMeasure.tsx`. Fix any unescaped-entity or hook-dep issue inline.

- [ ] **Step 4: Commit**

```bash
git add components/cad/CadScaleMeasure.tsx
git commit -m "feat(cad): add CadScaleMeasure overlay (photo → cm repeat → DPI)"
```

---

## Task 4: Tiling preview — `components/cad/CadTilingPreview.tsx`

**Files:**
- Create: `components/cad/CadTilingPreview.tsx`

**Interfaces:**
- Consumes: `seamScore`, `SEAM_SCORE_THRESHOLD` from `lib/cad-export`.
- Produces: default-exported component `CadTilingPreview`. Props: `{ imageUrl: string; onReroll: () => void; rerolling: boolean }`.

**Notes:** The 2×2 visual always renders (drawing a cross-origin image to a canvas is allowed). The seam score needs `getImageData`, which throws on a CORS-tainted canvas; set `crossOrigin="anonymous"` and, if reading still throws, fall back to a "check visually" badge.

- [ ] **Step 1: Create `components/cad/CadTilingPreview.tsx`**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in `components/cad/CadTilingPreview.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/cad/CadTilingPreview.tsx
git commit -m "feat(cad): add CadTilingPreview — 2×2 tile + seam-score badge"
```

---

## Task 5: Export panel — `components/cad/CadExportPanel.tsx`

**Files:**
- Create: `components/cad/CadExportPanel.tsx`

**Interfaces:**
- Consumes: `POST /api/cad-export`. Reads a `CadSpec`-shaped object for colorway (`palette`, `colorCount`, `repeatType`).
- Produces: default-exported component `CadExportPanel`. Props: `{ imageUrl: string; scale: { repeatCm: number; dpi: number } | null; spec: { repeatType: string; palette: { hex: string; name: string }[]; colorCount: number } | null }`.

- [ ] **Step 1: Create `components/cad/CadExportPanel.tsx`**

```tsx
"use client";

import { useState } from "react";

interface Props {
  imageUrl: string;
  scale: { repeatCm: number; dpi: number } | null;
  spec: { repeatType: string; palette: { hex: string; name: string }[]; colorCount: number } | null;
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function CadExportPanel({ imageUrl, scale, spec }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palette = spec?.palette ?? [];

  async function exportFiles() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cad-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          repeatCm: scale?.repeatCm ?? null,
          dpi: scale?.dpi ?? null,
          repeatType: spec?.repeatType ?? "unknown",
          palette,
          colorCount: spec?.colorCount ?? palette.length,
        }),
      });
      const raw = await res.text();
      let data: any;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Export: server returned non-JSON (${res.status})`);
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const stamp = scale ? `${scale.repeatCm.toFixed(1)}cm-${scale.dpi}dpi` : "no-scale";
      triggerDownload(data.printFile, `davidani-print-${stamp}.png`);
      triggerDownload(data.specSheet, `davidani-spec-${stamp}.png`);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">Print spec</h3>

      <dl className="space-y-1 text-xs text-neutral-700">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Repeat</dt>
          <dd>{scale ? `${scale.repeatCm.toFixed(1)} × ${scale.repeatCm.toFixed(1)} cm · ${scale.dpi} DPI` : "scale not set"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Size</dt>
          <dd>2048 × 2048 px</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Type</dt>
          <dd>{spec?.repeatType ?? "unknown"}</dd>
        </div>
      </dl>

      {palette.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Colorway ({spec?.colorCount ?? palette.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {palette.slice(0, 12).map((c, i) => (
              <span key={`${c.hex}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2 py-1">
                <span className="h-3 w-3 rounded-full border border-neutral-300" style={{ backgroundColor: c.hex }} />
                <span className="font-mono text-[10px]">{c.hex}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!scale ? (
        <p className="text-[11px] text-amber-700">No scale set — the export won’t carry a physical print size. Measure above to add it.</p>
      ) : null}

      <button
        type="button"
        onClick={exportFiles}
        disabled={busy}
        className="w-full rounded-xl bg-gradient-to-b from-neutral-800 to-neutral-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-neutral-700 hover:to-neutral-900 disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Export print file + spec"}
      </button>

      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. The `won’t` apostrophe is inside a JS string, not JSX text, so it is lint-safe.

- [ ] **Step 4: Commit**

```bash
git add components/cad/CadExportPanel.tsx
git commit -m "feat(cad): add CadExportPanel — spec card + print/spec export"
```

---

## Task 6: Integrate into `components/CadExtractorClient.tsx`

**Files:**
- Modify: `components/CadExtractorClient.tsx`

**Interfaces:**
- Consumes: `CadScaleMeasure`, `CadTilingPreview`, `CadExportPanel`; the existing `CadSpec` type from `lib/cad-prompts`; the existing `/api/cad-spec` endpoint and `run()`/`fetchJson()` already in the file.
- Produces: no new exports. Adds state `scale` and `spec`, fetches colorway once per image result, renders the three children after a non-spec result exists.

**Notes:** The scale tool measures the **original garment photo** (`selectedRefUrls[0]`), not the result. The preview and export use the result URL (`resultUrls[0]`). Colorway is fetched from `/api/cad-spec` (reusing the existing route) for the selected photo.

- [ ] **Step 1: Add imports**

At the top of `components/CadExtractorClient.tsx`, with the other component imports, add:

```tsx
import CadScaleMeasure from "@/components/cad/CadScaleMeasure";
import CadTilingPreview from "@/components/cad/CadTilingPreview";
import CadExportPanel from "@/components/cad/CadExportPanel";
```

- [ ] **Step 2: Add state**

Find the existing `useState` block in `CadExtractorClient` (where `resultUrls`, `spec`, etc. live). Note there is already a `spec`/`setSpec` used by the Spec Analysis mode. To avoid colliding with it, add **separate** state for the export colorway and the scale:

```tsx
  const [scale, setScale] = useState<{ repeatCm: number; dpi: number } | null>(null);
  const [colorway, setColorway] = useState<CadSpec | null>(null);
```

- [ ] **Step 3: Fetch colorway once per image result**

Add this effect near the other effects (it reuses the existing `/api/cad-spec` route and `fetchJson` helper). It runs only for image modes (`mode !== "spec"`) once a result and a selected photo exist:

```tsx
  useEffect(() => {
    if (mode === "spec") return;
    if (!resultUrls.length || !selectedRefUrls.length) {
      setColorway(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson("Colorway", "/api/cad-spec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: selectedRefUrls }),
        });
        if (!cancelled) setColorway(data.spec as CadSpec);
      } catch {
        if (!cancelled) setColorway(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultUrls, selectedRefUrls, mode]);
```

- [ ] **Step 4: Reset scale when the result changes**

In the existing `run()` function, where `setResultUrls([])` and `setSpec(null)` are called at the start of a run, add:

```tsx
      setScale(null);
```

- [ ] **Step 5: Render the three children in the results panel**

In the results `aside` (the `lg:w-[28rem]` column), inside the image-mode branch, **below** the existing `resultUrls.length ? (...)` grid, add a block that appears once a result exists and the mode is not spec. Place it after the result image grid, still inside the results column:

```tsx
            {!isSpec && resultUrls.length ? (
              <div className="space-y-5 border-t border-neutral-200 pt-4">
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                    Scale (measure on the garment photo)
                  </h3>
                  {selectedRefUrls.length ? (
                    <CadScaleMeasure imageUrl={selectedRefUrls[0]} onChange={setScale} />
                  ) : (
                    <p className="text-[11px] text-neutral-400">Select a garment photo to measure scale.</p>
                  )}
                </div>
                <CadTilingPreview imageUrl={resultUrls[0]} onReroll={run} rerolling={running} />
                <CadExportPanel imageUrl={resultUrls[0]} scale={scale} spec={colorway} />
              </div>
            ) : null}
```

(If `isSpec` is not already a variable in scope at this point, use `mode !== "spec"` instead.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Confirms the child prop types line up with the new state.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add components/CadExtractorClient.tsx
git commit -m "feat(cad): wire scale, tiling preview, and export into CAD Extractor"
```

---

## Task 7: Build + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: succeeds; route list includes `/cad-extractor`, `/api/cad-export`, `/api/cad-spec`, `/api/cad-extract`.

- [ ] **Step 2: Manual smoke test (dev server)**

Run `npm run dev`, open `http://localhost:3000/cad-extractor`, log in. Then:
- Upload a garment photo with a clear repeating print; select it.
- Mode = **Seamless Production CAD**, Model = **Nano Banana 2**; click **Extract CAD**; wait for the result.
- **Scale:** drag the cyan reference line across a known dimension, type its cm; drag the dashed repeat line from one motif to the next. Confirm the "Print at X × X cm → Y DPI" line updates and the numbers are sane.
- **Tiling preview:** confirm the 2×2 canvas renders and a badge appears (`Seamless ✓`, `Seam visible ⚠ (n)`, or `Check visually`).
- **Export:** click **Export print file + spec**. Two PNGs download.

- [ ] **Step 3: Verify the exported files**

- Open `davidani-print-*.png`: run `sips -g dpiWidth -g dpiHeight davidani-print-*.png` and confirm the DPI matches the panel's value (when scale was set).
- Open `davidani-spec-*.png`: confirm it shows the repeat cm, DPI, `2048 × 2048 px`, repeat type, and colorway swatches.

- [ ] **Step 4: Final commit (only if Steps 1–3 required fixups)**

```bash
git add -A
git commit -m "chore(cad): build + smoke-test fixups for Phase 1 print-ready export"
```

(Skip if no changes were needed.)

---

## Self-Review Notes

- **Spec coverage:** Scale tool → Task 3 (`CadScaleMeasure`) + `repeatCmToDpi` (Task 1). Verified seamless + 2×2 preview → Task 4 (`CadTilingPreview`) + `seamScore`/`SEAM_SCORE_THRESHOLD` (Task 1). Print-ready export (DPI-stamped PNG + spec-sheet PNG, hex colorway) → Task 2 (route) + Task 5 (`CadExportPanel`) + `buildSpecSheetSvg` (Task 1). Integration + colorway reuse of `/api/cad-spec` → Task 6.
- **Out of scope honored:** no classifier, no auto-heal, no Pantone, no color calibration, no repeat-count detection, no vector/separations, no PDF lib, no new dependency.
- **Type consistency:** `scale` is `{ repeatCm: number; dpi: number } | null` in `CadScaleMeasure`, `CadExportPanel`, and `CadExtractorClient`. Colorway is the existing `CadSpec` shape (`palette: {hex,name}[]`, `colorCount`, `repeatType`) everywhere. `seamScore(pairs: {a,b}[])` is produced in Task 1 and consumed in Task 4 with the same signature. `/api/cad-export` request/response fields match between Task 2 and Task 5.
- **CORS caveat handled:** Task 4 sets `crossOrigin="anonymous"` and falls back to a "Check visually" badge if `getImageData` is blocked, so the build never depends on fal CDN CORS headers.
- **No test runner:** verification is typecheck/lint/build + a `node`/`tsx` math check + manual smoke test, consistent with the existing CAD plan and Global Constraints.
