# CAD Pattern Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "CAD Extractor" studio tab that recovers production-ready textile CAD artwork from garment photos, with three modes (Flat Artwork Recovery, Seamless Production CAD, Spec Analysis).

**Architecture:** A new client page (`/cad-extractor`) modeled on the existing `ImagePlaygroundClient` calls two new API routes. `/api/cad-extract` runs the two image modes through the existing `generate()` helper with `raw: true` (no injected style-reference, no garment-swap prefix) and a server-locked square output size. `/api/cad-spec` runs the text mode through a new `analyzeTextileSpec()` vision helper. Mode prompts and shared types live in a new pure module `lib/cad-prompts.ts`.

**Tech Stack:** Next.js (App Router, client components), TypeScript, React, fal.ai client via `lib/fal.ts`, Tailwind. No test runner exists in this repo.

## Global Constraints

- **No test framework**: repo scripts are only `dev`, `build`, `lint`. Verification is `npx tsc --noEmit` (typecheck), `npm run lint`, `npm run build`, and manual dev-server checks. Do NOT add Jest/Vitest — out of scope.
- **Output size lock**: CAD image output is server-locked to `2048×2048` (square). Clients never override it.
- **`raw: true` is mandatory** on every `/api/cad-extract` call to `generate()` — it skips the auto-injected style-reference canvas and the `optimizePromptForModel` garment-swap prefix so nothing from Image Studio leaks into extraction.
- **`useDefaultReference: false` and `referenceImageUrl: null`** on every CAD generation — CAD edits from the uploaded garment photo(s) only.
- **Model ids** (`ModelId`): `"nano-banana" | "seedream-4" | "gpt-image"`. `nano-banana` routes via kie.ai; all honor `aspectRatio: "1:1"`.
- **Server routes**: `export const runtime = "nodejs"` and `export const maxDuration = 300`.
- **Type-only imports in the client**: the client imports `CadMode`/`CadSpec` from `lib/cad-prompts.ts` with `import type` only (that module is server-safe pure strings, but type-only import guarantees nothing is bundled).
- **Follow existing patterns**: reuse the `fetchJson` non-JSON guard, the upload flow (`/api/upload` + `resizeIfNeeded`), and the Playground layout/look.

---

## File Structure

- **Create** `lib/cad-prompts.ts` — `CadMode`, `CadSpec` types; `MODE_PROMPTS`; `buildCadPrompt()`; `CAD_SPEC_SYSTEM_PROMPT`; `CAD_SPEC_USER_PROMPT`. Pure strings/types, no server deps.
- **Modify** `lib/output-sizes.ts` — add `CAD_STUDIO_OUTPUT_SIZE`.
- **Modify** `lib/fal.ts` — add `analyzeTextileSpec(imageUrls): Promise<CadSpec>`.
- **Create** `app/api/cad-extract/route.ts` — image modes (flat | seamless).
- **Create** `app/api/cad-spec/route.ts` — text mode.
- **Modify** `components/TopTabs.tsx` — add `"cad"` to `StudioTab` + tab entry.
- **Create** `app/cad-extractor/page.tsx` — thin server component.
- **Create** `components/CadExtractorClient.tsx` — the UI.

---

## Task 1: CAD prompt library, types, and output-size lock

**Files:**
- Create: `lib/cad-prompts.ts`
- Modify: `lib/output-sizes.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CadMode = "flat" | "seamless"`
  - `interface CadSpec { repeatType: string; directional: string; colorCount: number; palette: { hex: string; name: string }[]; motifs: { name: string; count: string }[]; repeatDimensions: string; technique: string[]; notes: string }`
  - `const MODE_PROMPTS: Record<CadMode, string>`
  - `function buildCadPrompt(mode: CadMode, notes?: string): string`
  - `const CAD_SPEC_SYSTEM_PROMPT: string`
  - `const CAD_SPEC_USER_PROMPT: string`
  - `const CAD_STUDIO_OUTPUT_SIZE = { width: 2048, height: 2048 } as const` (in `lib/output-sizes.ts`)

- [ ] **Step 1: Create `lib/cad-prompts.ts` with types and prompts**

```typescript
// Textile CAD Pattern Extractor — mode prompts, spec-analysis prompts, and
// shared types. Pure module: no fal/sharp/node imports, so the client may
// `import type` from it without bundling server code.
//
// Philosophy (do not soften in the prompts): every garment photo is a
// distorted projection of a flat 2D textile print. The job is to REVERSE every
// post-design transformation (body warp, drape, wrinkles, seams, pockets,
// lighting, perspective, lens distortion) and RECOVER the original artwork.
// Never design, restyle, modernize, or "improve". Preserve every motif,
// distress mark, color, opacity, placement, rotation, scale, and intentional
// imperfection. The output must read as textile artwork, never as a garment.

export type CadMode = "flat" | "seamless";

export interface CadSpecPaletteColor {
  hex: string;
  name: string;
}

export interface CadSpecMotif {
  name: string;
  count: string;
}

export interface CadSpec {
  repeatType: string;
  directional: string;
  colorCount: number;
  palette: CadSpecPaletteColor[];
  motifs: CadSpecMotif[];
  repeatDimensions: string;
  technique: string[];
  notes: string;
}

// Shared recovery directives used by both image modes.
const RECOVERY_CORE = [
  "You are an expert textile CAD engineer recovering the original digital print artwork from a photograph of a finished garment.",
  "Treat the photograph as a distorted projection of a flat 2D textile print. Mathematically and visually reverse every transformation applied after the artwork left the designer: pattern warp from body shape, fabric drape, wrinkles, stretch, compression, construction seams, pockets, waistbands, elastic, gathering, drawstrings, stitching, washing, fading caused by photography, lighting, shadows, highlights, camera perspective, lens distortion, and cropping.",
  "Completely remove every garment-specific element: construction seams, top stitching, cover stitching, overlock stitching, elastic casing, waistbands, hem bands, drawstrings, buttons, snaps, zippers, pockets, pleats, gathering, panel breaks, necklines, sleeves, cuffs, yokes, side seams, fabric folds, wrinkles, body shape, shadows, lighting gradients, and perspective. Nothing from the garment may remain.",
  "Preserve EXACTLY, do not clean or stylize: every illustration, icon, motif, brush stroke, distress mark, ink texture, halftone, color, opacity, fade, placement, rotation, scale, spacing, overlap, and intentional imperfection. If something is intentionally distressed, washed, cracked, or aged, keep it exactly — do not sharpen, simplify, or restore it.",
  "Preserve exact color relationships. Do NOT increase saturation or contrast, adjust hue, normalize colors, change brightness, or white-balance. Match the original textile artwork's colors.",
  "Reconstruct artwork hidden beneath pockets, seams, elastic, waistbands, gathering, or folded fabric using ONLY the surrounding artwork, so the continuation looks perfectly natural with no visible interruption. Motifs cut off by seams, pockets, or folds must continue and reconnect naturally. Never invent unrelated motifs; when uncertain, preserve rather than invent.",
  "Output flat 2D artwork only: a square composition, high resolution, production-ready CAD. No garment, no mannequin, no folds, no perspective, no shadows, no background. Artwork only — it must look like the original digital textile file the brand sent to the fabric mill, with no evidence it came from a photograph.",
].join(" ");

const FLAT_PROMPT = [
  RECOVERY_CORE,
  "MODE — FLAT ARTWORK RECOVERY: recover the flat print artwork exactly as it was printed across the fabric. Do NOT force a seamless tiling repeat in this mode; reproduce the artwork's true layout, scale, and spacing as recovered from the photograph.",
].join(" ");

const SEAMLESS_PROMPT = [
  RECOVERY_CORE,
  "MODE — SEAMLESS PRODUCTION CAD: produce a perfectly tileable square repeat of the recovered artwork. Determine the repeat logic (full repeat, half-drop, brick, mirror, engineered placement, border, panel, all-over, directional or non-directional) and reconstruct it. When the photograph shows only part of the repeat, INFER AND COMPLETE the full repeat from the surrounding artwork while preserving the original artistic language — never introduce unrelated motifs.",
  "Edge handling is mandatory: every edge must tile perfectly — the top connects to the bottom and the left connects to the right with no visible seams, no duplicated motifs near the edges, no broken artwork, and no abrupt cutoffs.",
].join(" ");

export const MODE_PROMPTS: Record<CadMode, string> = {
  flat: FLAT_PROMPT,
  seamless: SEAMLESS_PROMPT,
};

/**
 * Assemble the final extraction prompt for an image mode, optionally appending
 * free-text user hints (e.g. "the base cloth is cream", "ignore the pocket
 * flap"). Hints are appended verbatim after a clear separator.
 */
export function buildCadPrompt(mode: CadMode, notes?: string): string {
  const base = MODE_PROMPTS[mode];
  const trimmed = (notes ?? "").trim();
  if (!trimmed) return base;
  return `${base} Additional designer notes for this specific artwork (apply only if consistent with the rules above): ${trimmed}`;
}

export const CAD_SPEC_SYSTEM_PROMPT = `You are an expert textile CAD engineer and surface-pattern analyst. You inspect a photograph of a printed garment and report the production specifications of the UNDERLYING flat textile print — not the garment. Ignore all garment construction, drape, wrinkles, seams, pockets, lighting, shadows, and perspective. Reason about the flat repeat that was sent to the mill.

Return STRICT JSON only — no markdown, no code fences, no commentary — matching exactly this shape:
{
  "repeatType": "one of: full repeat | half-drop | brick | mirror | engineered placement | border | panel | all-over | unknown",
  "directional": "one of: directional | non-directional | unknown",
  "colorCount": <integer best-estimate of distinct print colors, excluding the base cloth>,
  "palette": [ { "hex": "#RRGGBB", "name": "short human color name" } ],
  "motifs": [ { "name": "short motif name e.g. five-point star, paisley, rose", "count": "approx count or density e.g. ~12, dense all-over, single placement" } ],
  "repeatDimensions": "best-estimate repeat scale in plain words e.g. small ~2cm repeat, large engineered panel, unknown",
  "technique": [ "print/texture techniques observed e.g. screen print, pigment wash, halftone, ink bleed, distressed/cracked, vintage fade" ],
  "notes": "one or two sentences a textile designer would find useful"
}

Rules:
- Estimate honestly; use "unknown" or "~" approximations rather than inventing precise figures.
- Palette: 1-12 entries, the dominant print colors only.
- Do NOT describe the garment. Describe the print.`;

export const CAD_SPEC_USER_PROMPT =
  "Analyze the underlying textile print in this garment photograph and return the production spec as strict JSON per your system instructions. Output JSON only.";
```

- [ ] **Step 2: Add the square output-size lock to `lib/output-sizes.ts`**

Append after the existing `IMAGE_STUDIO_OUTPUT_SIZE` export (around line 21):

```typescript
// CAD Pattern Extractor — square repeat tile. Resize enforced server-side in
// /api/cad-extract. 1:1 so the cover-resize is a clean downscale (no crop)
// when generation is requested at aspectRatio "1:1".
export const CAD_STUDIO_OUTPUT_SIZE = { width: 2048, height: 2048 } as const;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The new module is self-contained; nothing imports it yet.

- [ ] **Step 4: Commit**

```bash
git add lib/cad-prompts.ts lib/output-sizes.ts
git commit -m "feat(cad): add CAD prompt library, spec types, and square output lock"
```

---

## Task 2: `analyzeTextileSpec()` vision helper

**Files:**
- Modify: `lib/fal.ts`

**Interfaces:**
- Consumes: `CadSpec`, `CAD_SPEC_SYSTEM_PROMPT`, `CAD_SPEC_USER_PROMPT` from `lib/cad-prompts.ts`; existing in-file `subscribeVisionWithRetry`, `VISION_MODEL`, `extractJsonObject`.
- Produces: `async function analyzeTextileSpec(imageUrls: string[]): Promise<CadSpec>` (exported).

**Notes:** The `fal-ai/any-llm/vision` endpoint takes a single `image_url` (every existing analyzer passes one). Spec mode analyzes the FIRST selected image (the primary). Signature accepts `string[]` to stay future-proof.

- [ ] **Step 1: Add the import at the top of `lib/fal.ts`**

Find the existing import block (lines 1-6) and add below the `optimizePromptForModel` import:

```typescript
import type { CadSpec } from "./cad-prompts";
import { CAD_SPEC_SYSTEM_PROMPT, CAD_SPEC_USER_PROMPT } from "./cad-prompts";
```

- [ ] **Step 2: Add `analyzeTextileSpec()` near the other analyzers**

Add after `generateInspirationTags` (it ends around line 913, just before `export interface TechpackTable`):

```typescript
/**
 * Textile CAD spec analysis. Inspects a garment photograph and returns the
 * production spec of the UNDERLYING flat print (repeat type, color count,
 * palette, motifs, technique). Uses the shared vision model. Analyzes the
 * primary (first) image; the array signature keeps room for future
 * multi-image merge.
 */
export async function analyzeTextileSpec(imageUrls: string[]): Promise<CadSpec> {
  const primary = imageUrls.find((url) => !!url);
  if (!primary) throw new Error("At least one image is required for spec analysis.");

  const result: any = await subscribeVisionWithRetry(
    {
      model: VISION_MODEL,
      system_prompt: CAD_SPEC_SYSTEM_PROMPT,
      prompt: CAD_SPEC_USER_PROMPT,
      image_url: primary,
    },
    "textile spec analysis"
  );

  const data = result?.data ?? result;
  const output: string = (data?.output ?? data?.response ?? data?.text ?? "").trim();
  if (!output) {
    console.error("[cad-spec] full response:", JSON.stringify(data).slice(0, 1000));
    throw new Error("Spec analyzer returned no text output.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonObject(output));
  } catch {
    console.error("[cad-spec] raw output:", output.slice(0, 1000));
    throw new Error("Spec analyzer returned unparseable JSON.");
  }

  const palette = Array.isArray(parsed.palette)
    ? parsed.palette
        .map((c: any) => ({
          hex: String(c?.hex || "").trim(),
          name: String(c?.name || "").trim(),
        }))
        .filter((c: any) => c.hex)
        .slice(0, 12)
    : [];
  const motifs = Array.isArray(parsed.motifs)
    ? parsed.motifs
        .map((m: any) => ({
          name: String(m?.name || "").trim(),
          count: String(m?.count || "").trim(),
        }))
        .filter((m: any) => m.name)
        .slice(0, 24)
    : [];
  const technique = Array.isArray(parsed.technique)
    ? parsed.technique.map((t: any) => String(t || "").trim()).filter(Boolean).slice(0, 12)
    : [];

  return {
    repeatType: String(parsed.repeatType || "unknown").trim(),
    directional: String(parsed.directional || "unknown").trim(),
    colorCount: Number.isFinite(Number(parsed.colorCount)) ? Number(parsed.colorCount) : palette.length,
    palette,
    motifs,
    repeatDimensions: String(parsed.repeatDimensions || "unknown").trim(),
    technique,
    notes: String(parsed.notes || "").trim(),
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Confirms the `CadSpec` import and `extractJsonObject` reuse resolve.

- [ ] **Step 4: Commit**

```bash
git add lib/fal.ts
git commit -m "feat(cad): add analyzeTextileSpec vision helper"
```

---

## Task 3: API routes for image modes and spec mode

**Files:**
- Create: `app/api/cad-extract/route.ts`
- Create: `app/api/cad-spec/route.ts`

**Interfaces:**
- Consumes: `generate` from `lib/fal.ts`, `MODELS`/`ModelId` from `lib/models`, `CAD_STUDIO_OUTPUT_SIZE` from `lib/output-sizes`, `buildCadPrompt`/`CadMode` from `lib/cad-prompts`, `analyzeTextileSpec` from `lib/fal.ts`.
- Produces:
  - `POST /api/cad-extract` → `{ ok: true, images: {url,...}[] }` or `{ ok: false, error }`. Body: `{ modelId, mode, imageUrls, notes?, resolution?, format?, numImages? }`.
  - `POST /api/cad-spec` → `{ ok: true, spec: CadSpec }` or `{ ok: false, error }`. Body: `{ imageUrls }`.

- [ ] **Step 1: Create `app/api/cad-extract/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { generate } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { CAD_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";
import { buildCadPrompt, type CadMode } from "@/lib/cad-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, mode, imageUrls, notes, resolution, format, numImages } = body as {
      modelId: ModelId;
      mode: CadMode;
      imageUrls: string[];
      notes?: string;
      resolution?: string;
      format?: "png" | "jpeg";
      numImages?: number;
    };

    if (!modelId || !MODELS[modelId]) {
      return NextResponse.json({ ok: false, error: "Invalid modelId" }, { status: 400 });
    }
    if (mode !== "flat" && mode !== "seamless") {
      return NextResponse.json({ ok: false, error: "Invalid mode" }, { status: 400 });
    }
    if (!imageUrls?.length) {
      return NextResponse.json(
        { ok: false, error: "At least one garment image is required" },
        { status: 400 }
      );
    }

    const result = await generate({
      modelId,
      prompt: buildCadPrompt(mode, notes),
      imageUrls,
      // Sandboxed extraction: edit from the uploaded garment photo(s) only.
      raw: true,
      useDefaultReference: false,
      referenceImageUrl: null,
      aspectRatio: "1:1",
      resolution: resolution ?? "2K",
      format: format ?? "png",
      numImages: numImages ?? 1,
      // Square lock — clients never override.
      outputSize: CAD_STUDIO_OUTPUT_SIZE,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[cad-extract] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "CAD extraction failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create `app/api/cad-spec/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { analyzeTextileSpec } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrls } = body as { imageUrls: string[] };

    if (!imageUrls?.length) {
      return NextResponse.json(
        { ok: false, error: "At least one garment image is required" },
        { status: 400 }
      );
    }

    const spec = await analyzeTextileSpec(imageUrls);
    return NextResponse.json({ ok: true, spec });
  } catch (err: any) {
    console.error("[cad-spec] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Spec analysis failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/cad-extract/route.ts app/api/cad-spec/route.ts
git commit -m "feat(cad): add cad-extract and cad-spec API routes"
```

---

## Task 4: Tab wiring

**Files:**
- Modify: `components/TopTabs.tsx`
- Create: `app/cad-extractor/page.tsx`

**Interfaces:**
- Consumes: `CadExtractorClient` (created in Task 5 — the page import will fail typecheck until Task 5; build the page here, verify in Task 5).
- Produces: `StudioTab` union includes `"cad"`; nav shows a "CAD Extractor" tab linking to `/cad-extractor`.

- [ ] **Step 1: Add `"cad"` to the `StudioTab` union in `components/TopTabs.tsx`**

Change the union (lines 12-21) to include `"cad"`:

```typescript
export type StudioTab =
  | "image"
  | "playground"
  | "model"
  | "model-beta"
  | "prompt"
  | "techpack"
  | "faire-seo"
  | "inspiration"
  | "library"
  | "cad";
```

- [ ] **Step 2: Add the tab entry to the `tabs` array in `components/TopTabs.tsx`**

Add after the `playground` entry (around line 37):

```typescript
    { id: "cad", label: "CAD Extractor", href: "/cad-extractor" },
```

- [ ] **Step 3: Create `app/cad-extractor/page.tsx`**

```typescript
import CadExtractorClient from "@/components/CadExtractorClient";

export default function CadExtractorPage() {
  return <CadExtractorClient />;
}
```

- [ ] **Step 4: Commit**

```bash
git add components/TopTabs.tsx app/cad-extractor/page.tsx
git commit -m "feat(cad): wire CAD Extractor tab and route page"
```

(Typecheck is deferred to Task 5 — the page references `CadExtractorClient`, created next.)

---

## Task 5: CadExtractorClient UI

**Files:**
- Create: `components/CadExtractorClient.tsx`

**Interfaces:**
- Consumes: `StudioHeader`, `ImageLightbox` + `ZoomButton`, `UploadedImage` type, `MODELS`/`ModelId`/`RESOLUTIONS`, `resizeIfNeeded`, and type-only `CadMode`/`CadSpec` from `lib/cad-prompts`. Calls `POST /api/upload`, `POST /api/cad-extract`, `POST /api/cad-spec`.
- Produces: default-exported React client component rendering the full tab.

- [ ] **Step 1: Create `components/CadExtractorClient.tsx`**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import ImageLightbox, { ZoomButton } from "@/components/ImageLightbox";
import type { UploadedImage } from "@/components/types";
import { MODELS, type ModelId, RESOLUTIONS } from "@/lib/models";
import { resizeIfNeeded } from "@/lib/image-resize";
import type { CadMode, CadSpec } from "@/lib/cad-prompts";

const REFS_KEY = "davidani_cad_refs_v1";

type ModeId = CadMode | "spec";

const MODE_OPTIONS: { id: ModeId; label: string; blurb: string }[] = [
  { id: "flat", label: "Flat Artwork Recovery", blurb: "Recover the flat printed artwork. No seamless tiling." },
  { id: "seamless", label: "Seamless Production CAD", blurb: "Perfectly tileable square repeat. Infers hidden artwork." },
  { id: "spec", label: "Spec Analysis", blurb: "Text spec: repeat type, colors, motifs, technique." },
];

async function fetchJson(label: string, input: string, init?: RequestInit): Promise<any> {
  const res = await fetch(input, init);
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${label}: server returned non-JSON (${res.status})`);
  }
  if (!res.ok) throw new Error(`${label}: ${data?.error || `HTTP ${res.status}`}`);
  return data;
}

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} animate-spin`}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
    <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>
);

function hasImageFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );
}

export default function CadExtractorClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ModeId>("flat");
  const [modelId, setModelId] = useState<ModelId>("seedream-4");
  const [resolution, setResolution] = useState<string>("2K");
  const [notes, setNotes] = useState<string>("");

  const [refs, setRefs] = useState<UploadedImage[]>([]);
  const [selectedRefUrls, setSelectedRefUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [spec, setSpec] = useState<CadSpec | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [refPreviewSrc, setRefPreviewSrc] = useState<string | null>(null);

  const activeMode = useMemo(() => MODE_OPTIONS.find((m) => m.id === mode)!, [mode]);
  const isSpec = mode === "spec";

  // Persist + restore the reference library (matches Playground behavior).
  if (typeof window !== "undefined" && refs.length === 0) {
    // lazy one-time hydrate guard handled below via ref
  }
  const hydratedRef = useRef(false);
  if (typeof window !== "undefined" && !hydratedRef.current) {
    hydratedRef.current = true;
    try {
      const r = localStorage.getItem(REFS_KEY);
      if (r) {
        const parsed = JSON.parse(r) as UploadedImage[];
        if (Array.isArray(parsed) && parsed.length) {
          setRefs(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }

  function persistRefs(next: UploadedImage[]) {
    try {
      localStorage.setItem(REFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function addFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      const resized = await Promise.all(Array.from(files).map((f) => resizeIfNeeded(f)));
      const form = new FormData();
      resized.forEach((f) => form.append("files", f));
      const data = await fetchJson("Upload", "/api/upload", { method: "POST", body: form });
      const added: UploadedImage[] = data.uploads ?? [];
      if (!added.length) throw new Error("Upload returned no URLs");
      setRefs((list) => {
        const next = [...added, ...list];
        persistRefs(next);
        return next;
      });
      setSelectedRefUrls((cur) => Array.from(new Set([...added.map((u) => u.url), ...cur])));
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function toggleRef(url: string) {
    setSelectedRefUrls((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]));
  }

  function removeRef(url: string) {
    setRefs((list) => {
      const next = list.filter((r) => r.url !== url);
      persistRefs(next);
      return next;
    });
    setSelectedRefUrls((cur) => cur.filter((u) => u !== url));
  }

  async function run() {
    if (!selectedRefUrls.length) {
      setError("Select at least one garment photo");
      return;
    }
    setError(null);
    setRunning(true);
    setResultUrls([]);
    setSpec(null);
    try {
      if (isSpec) {
        const data = await fetchJson("Spec analysis", "/api/cad-spec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: selectedRefUrls }),
        });
        setSpec(data.spec as CadSpec);
      } else {
        const data = await fetchJson("CAD extract", "/api/cad-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            mode,
            imageUrls: selectedRefUrls,
            notes,
            resolution,
            format: "png",
            numImages: 1,
          }),
        });
        const urls: string[] = data.images?.map((i: any) => i.url).filter(Boolean) ?? [];
        if (!urls.length) throw new Error("No artwork returned");
        setResultUrls(urls);
      }
    } catch (e: any) {
      setError(e?.message || "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen">
      <StudioHeader
        active="cad"
        title="CAD Pattern Extractor"
        subtitle="Recover production-ready textile CAD artwork from garment photos."
        metrics={[
          { label: "Refs", value: selectedRefUrls.length },
          { label: "Active", value: running ? 1 : 0 },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Settings rail */}
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-neutral-200 bg-white p-5 lg:w-80 lg:border-b-0 lg:border-r">
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
              Mode
            </h2>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ModeId)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
            >
              {MODE_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">{activeMode.blurb}</p>
          </section>

          {!isSpec ? (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Settings
              </h2>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Model
                  </span>
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value as ModelId)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  >
                    {Object.values(MODELS).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.badge})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Quality
                  </span>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-brand-500"
                  >
                    {RESOLUTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[10px] leading-snug text-neutral-400">
                  Output is locked to a 2048×2048 square repeat tile.
                </p>
              </div>
            </section>
          ) : null}

          <section
            onDragEnter={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              if (!hasImageFiles(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            className={`-m-2 rounded-lg p-2 transition ${dragging ? "bg-brand-50/70 ring-2 ring-brand-400" : ""}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Garment Photos
              </h2>
              <span className="text-[10px] text-neutral-500">
                {selectedRefUrls.length}/{refs.length} selected
              </span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`mb-3 flex w-full items-center justify-center rounded-lg border border-dashed px-3 py-2 text-xs font-semibold transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60 ${
                dragging ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-300 bg-neutral-50 text-neutral-600"
              }`}
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Uploading
                </span>
              ) : dragging ? (
                "Drop to upload"
              ) : (
                "Upload photos or drag & drop"
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            {refs.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {refs.map((u) => {
                  const selected = selectedRefUrls.includes(u.url);
                  return (
                    <div
                      key={u.url}
                      className={`group relative aspect-square overflow-hidden rounded-lg border ${
                        selected ? "border-neutral-900 ring-2 ring-neutral-900/10" : "border-neutral-200"
                      }`}
                    >
                      <button type="button" onClick={() => toggleRef(u.url)} className="block h-full w-full">
                        <img src={u.url} alt={u.name} className="h-full w-full object-cover" />
                      </button>
                      <ZoomButton className="absolute bottom-1 right-1" onClick={() => setRefPreviewSrc(u.url)} />
                      <button
                        type="button"
                        onClick={() => removeRef(u.url)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-xs text-neutral-500 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-neutral-500">
                Upload one or more photos of the same garment. All selected photos are combined into one
                reconstruction.
              </p>
            )}
          </section>
        </aside>

        {/* Center: notes + run */}
        <section className="flex min-w-0 flex-1 flex-col border-b border-neutral-200 bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h1 className="text-sm font-semibold text-neutral-900">{activeMode.label}</h1>
            <p className="text-[11px] text-neutral-500">{activeMode.blurb}</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-6">
            {!isSpec ? (
              <label className="flex min-h-0 flex-1 flex-col">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  Extraction notes (optional)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={`e.g. base cloth is cream\nignore the chest pocket flap\nthe stars are screen-printed and intentionally cracked`}
                  disabled={running}
                  className="prompt-mono min-h-0 flex-1 resize-none rounded-lg border border-neutral-200 px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-brand-500 disabled:bg-neutral-50"
                />
              </label>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-center text-xs text-neutral-400">
                Spec Analysis reads the primary selected photo and returns a textile production spec.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4">
            <span className="text-xs text-neutral-500">
              {selectedRefUrls.length
                ? `${selectedRefUrls.length} photo${selectedRefUrls.length === 1 ? "" : "s"} selected`
                : "Select garment photos in the left rail"}
            </span>
            <button
              type="button"
              onClick={run}
              disabled={running || !selectedRefUrls.length}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-neutral-800 to-neutral-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-neutral-700 hover:to-neutral-900 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:bg-none disabled:text-neutral-500"
            >
              {running ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {isSpec ? "Analyzing" : "Extracting"}
                </span>
              ) : isSpec ? (
                "Analyze Spec"
              ) : (
                "Extract CAD"
              )}
            </button>
          </div>
        </section>

        {/* Results */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto bg-neutral-50 lg:w-[28rem]">
          <div className="border-b border-neutral-200 bg-white px-5 py-4">
            <h2 className="text-sm font-semibold text-neutral-900">Result</h2>
            <p className="text-[11px] text-neutral-500">
              {isSpec ? "Textile production spec" : "Recovered flat CAD artwork"}
            </p>
          </div>

          <div className="flex-1 space-y-3 p-4">
            {isSpec ? (
              spec ? (
                <SpecCard spec={spec} />
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-neutral-400">
                  {running ? "Analyzing…" : "Run Spec Analysis to see results"}
                </div>
              )
            ) : resultUrls.length ? (
              <div className="grid grid-cols-1 gap-3">
                {resultUrls.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setPreviewIdx(i)}
                    className="block overflow-hidden rounded-lg border border-neutral-200 transition hover:border-brand-500"
                  >
                    <img src={url} alt="Recovered CAD artwork" className="block h-auto w-full" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-neutral-400">
                {running ? "Extracting…" : "Run extraction to see artwork"}
              </div>
            )}
          </div>
        </aside>
      </div>

      {previewIdx !== null && resultUrls[previewIdx] ? (
        <ImageLightbox
          src={resultUrls[previewIdx]}
          alt={`CAD result ${previewIdx + 1} of ${resultUrls.length}`}
          images={resultUrls}
          currentIndex={previewIdx}
          onIndexChange={setPreviewIdx}
          onClose={() => setPreviewIdx(null)}
        />
      ) : null}

      {refPreviewSrc ? (
        <ImageLightbox src={refPreviewSrc} alt="Reference preview" onClose={() => setRefPreviewSrc(null)} />
      ) : null}

      {error ? (
        <div className="fixed bottom-6 right-6 max-w-sm rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start gap-2">
            <span className="font-semibold">Error:</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SpecCard({ spec }: { spec: CadSpec }) {
  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 text-xs text-neutral-700">
      <Row label="Repeat type" value={spec.repeatType} />
      <Row label="Direction" value={spec.directional} />
      <Row label="Colors" value={String(spec.colorCount)} />
      <Row label="Repeat size" value={spec.repeatDimensions} />
      {spec.palette.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Palette</p>
          <div className="flex flex-wrap gap-2">
            {spec.palette.map((c, i) => (
              <span key={`${c.hex}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2 py-1">
                <span className="h-3 w-3 rounded-full border border-neutral-300" style={{ backgroundColor: c.hex }} />
                <span className="font-mono text-[10px]">{c.hex}</span>
                {c.name ? <span className="text-neutral-500">{c.name}</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {spec.motifs.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Motifs</p>
          <ul className="space-y-1">
            {spec.motifs.map((m, i) => (
              <li key={`${m.name}-${i}`} className="flex justify-between gap-2">
                <span>{m.name}</span>
                <span className="text-neutral-400">{m.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {spec.technique.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Technique</p>
          <div className="flex flex-wrap gap-1.5">
            {spec.technique.map((t, i) => (
              <span key={`${t}-${i}`} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {spec.notes ? <p className="border-t border-neutral-100 pt-3 text-[11px] leading-snug text-neutral-500">{spec.notes}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Confirms the page→client import (Task 4) and all `lib` imports resolve, and `active="cad"` is valid on `StudioHeader`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in the CAD files. Fix any reported issue (e.g. unescaped entities) inline.

- [ ] **Step 4: Commit**

```bash
git add components/CadExtractorClient.tsx
git commit -m "feat(cad): add CadExtractorClient UI"
```

---

## Task 6: Build + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: build succeeds; output lists the `/cad-extractor`, `/api/cad-extract`, and `/api/cad-spec` routes.

- [ ] **Step 2: Manual smoke test (dev server)**

Run: `npm run dev`, open `http://localhost:3000/cad-extractor`. Verify:
- The "CAD Extractor" tab appears in the header nav and is highlighted as active.
- Upload 1–2 garment photos with a clear print; they appear and select in the left rail.
- **Flat Artwork Recovery** → "Extract CAD" returns a flat, square (2048×2048) artwork image with the garment removed. Open it in the lightbox; right-click → check it is square.
- **Seamless Production CAD** → returns a square tile; visually confirm edges look continuous.
- **Spec Analysis** → the right panel shows the spec card (repeat type, palette swatches, motifs, technique).
- Trigger an error path (e.g. click Extract with no photo selected) → red error toast appears and is dismissible.

- [ ] **Step 3: Confirm the square lock**

In the lightbox or by downloading, confirm an image-mode result is exactly 2048×2048 (the server `CAD_STUDIO_OUTPUT_SIZE` lock), not 2:3.

- [ ] **Step 4: Final commit (if any lint/build fixups were needed)**

```bash
git add -A
git commit -m "chore(cad): build + lint fixups for CAD Extractor"
```

(Skip if Steps 1–3 required no changes.)

---

## Self-Review Notes

- **Spec coverage**: Flat recovery (Mode 1) → Task 1 `FLAT_PROMPT` + Task 3 route. Seamless/repeat reconstruction with infer-and-complete (Mode 2 + 3 from the original modular sketch) → `SEAMLESS_PROMPT`. Spec/Vector analysis (Mode 4) → `analyzeTextileSpec` + spec card. Square 1:1 lock → `CAD_STUDIO_OUTPUT_SIZE` + route. Selectable model, no forced default → model dropdown (initialised to Seedream-4). Single dropdown + one Generate, spec swaps panel → CadExtractorClient. Multi-photo reconstruction → all `selectedRefUrls` passed to `/api/cad-extract`.
- **Out of scope honored**: no vector/SVG export, no color separations, no cloud history (local refs only), no separate Repeat Detection mode.
- **Type consistency**: `CadMode = "flat" | "seamless"` everywhere; `ModeId = CadMode | "spec"` only in the client; `CadSpec` shape identical across `lib/cad-prompts.ts`, `analyzeTextileSpec`, route, and `SpecCard`.
- **No test runner**: verification is typecheck/lint/build/manual by design (Global Constraints), not a placeholder.
