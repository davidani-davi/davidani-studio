# CAD Cleanup Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Clean up (AI)" action to the CAD Extractor that offsets the current tile (making edges continuous) then runs a second Nano Banana pass to scrub residual garment construction (hem/stitch lines, seams, creases, gathers) and the center crosshair, healing the print over them.

**Architecture:** A new server route `app/api/cad-cleanup/route.ts` does the sharp offset (diagonal quadrant swap), uploads the offset image via the existing `uploadToFal`, and reuses the existing `generate()` image-edit path with a new `CAD_CLEANUP_PROMPT`. `CadTilingPreview` gains a "Clean up (AI)" button; `CadExtractorClient` owns a `cleanup()` handler that swaps the cleaned tile into the result. The seam re-score is automatic (Phase 1 client-side path).

**Tech Stack:** Next.js (App Router), TypeScript, React, `sharp ^0.34.5`, fal.ai via `lib/fal.ts`, Tailwind.

## Global Constraints

- **No test framework**: repo scripts are `dev`, `build`, `lint`. `npm run lint` is BROKEN project-wide (Next 16 removed `next lint`) — do NOT run it. Verify with `npx tsc --noEmit`; integration check is `npm run build`. Do NOT add Jest/Vitest.
- **Tile size 2048×2048** (`CAD_STUDIO_OUTPUT_SIZE`); the offset and the AI output stay square 2048².
- **Reuse `generate()` exactly as `/api/cad-extract` does**: `raw: true`, `useDefaultReference: false`, `referenceImageUrl: null`, `aspectRatio: "1:1"`, `resolution: "2K"`, `format: "png"`, `numImages: 1`, `outputSize: CAD_STUDIO_OUTPUT_SIZE`.
- **No new npm dependencies** (`sharp` already installed).
- **Server route**: `export const runtime = "nodejs"` and `export const maxDuration = 300`.
- **Pre-existing unrelated WIP in the working tree**: stage ONLY the files named in each task (`git add <exact path>`), never `git add -A`.
- **Naming (verbatim)**: route `/api/cad-cleanup`, prompt `CAD_CLEANUP_PROMPT`, UI label "Clean up (AI)" / "Cleaning…", props `onCleanup` / `cleaning`, handler `cleanup()`.

## File Structure

- **Modify** `lib/cad-prompts.ts` — add `export const CAD_CLEANUP_PROMPT: string` (pure string, with the other CAD prompts).
- **Create** `app/api/cad-cleanup/route.ts` — offset (sharp) + `uploadToFal` + `generate()`.
- **Modify** `components/cad/CadTilingPreview.tsx` — add `onCleanup` / `cleaning` props + a "Clean up (AI)" button.
- **Modify** `components/CadExtractorClient.tsx` — add `cleaning` state + `cleanup()` handler + pass the two new props.

---

## Task 1: Cleanup prompt — `lib/cad-prompts.ts`

**Files:**
- Modify: `lib/cad-prompts.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const CAD_CLEANUP_PROMPT: string`.

- [ ] **Step 1: Append `CAD_CLEANUP_PROMPT` to `lib/cad-prompts.ts`**

Add this near the other prompt exports (e.g. after `CAD_SPEC_USER_PROMPT`, at the end of the prompt declarations — anywhere at module top level is fine; it must be exported):

```typescript
// One-click "Clean up (AI)" pass. The input is a tile that has already been
// offset by half (so its outer edges are continuous and any seam now runs as a
// faint cross through the exact center). This pass scrubs residual garment
// construction the first recovery left behind — hem/stitch lines, panel and
// inseam seams, creases, fold shadows, gathers — plus that center crosshair,
// healing the printed artwork over all of them. It must NOT touch the outer
// edges (they are already tileable).
export const CAD_CLEANUP_PROMPT = [
  "You are an expert textile CAD engineer cleaning up a flat 2D textile print that was recovered from a photograph of a finished garment. The print is good but still contains RESIDUAL GARMENT CONSTRUCTION that must be removed.",
  "Remove every remaining trace of garment construction anywhere in the image: faint hem lines, stitch lines, top-stitching, cover-stitch and overlock rows, panel seams, inseams, side seams, waistband and hem-band lines, creases, fold shadows, drape shading, gathers, pleats, and puckers. None of these belong in a flat mill print.",
  "There is also a faint cross-shaped seam through the EXACT CENTER of the image — one horizontal line across the middle and one vertical line down the middle. Repair it as well.",
  "For every line, seam, crease, gather, and the center cross: reconstruct the continuous printed artwork over it using ONLY the surrounding print, so the motifs, colors, opacity, fade, texture, and spacing continue naturally with no visible interruption.",
  "Preserve the print exactly otherwise: do not restyle, recolor, sharpen, simplify, brighten, increase contrast, or invent new motifs. Keep every printed flower, leaf, and shape, its color, and its washed/distressed character unchanged.",
  "CRITICAL: do NOT modify the outer edges of the image. The four edges are already perfectly continuous and tileable — leave a margin near every edge untouched so the result still tiles seamlessly.",
  "Output flat 2D artwork only: a square composition that fills the entire frame edge to edge, high resolution, production-ready CAD. No garment, no mannequin, no folds, no perspective, no shadows, no background, no border. Artwork only.",
].join(" ");
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The new export is a self-contained string.

- [ ] **Step 3: Commit**

```bash
git add lib/cad-prompts.ts
git commit -m "feat(cad): add CAD_CLEANUP_PROMPT for the cleanup pass"
```

---

## Task 2: Cleanup route — `app/api/cad-cleanup/route.ts`

**Files:**
- Create: `app/api/cad-cleanup/route.ts`

**Interfaces:**
- Consumes: `generate` and `uploadToFal` from `lib/fal`; `MODELS`/`ModelId` from `lib/models`; `CAD_STUDIO_OUTPUT_SIZE` from `lib/output-sizes`; `CAD_CLEANUP_PROMPT` from `lib/cad-prompts`; `sharp`.
- Produces: `POST /api/cad-cleanup` → `{ ok: true, images }` (same shape `/api/cad-extract` returns from `generate()`) or `{ ok: false, error }`. Body: `{ imageUrl: string; modelId?: ModelId }`.

**Notes:** The offset is a diagonal quadrant swap (half-roll both axes): new top-left = old bottom-right, new top-right = old bottom-left, new bottom-left = old top-right, new bottom-right = old top-left. This makes the outer edges continuous and moves any seam to the center.

- [ ] **Step 1: Create `app/api/cad-cleanup/route.ts`**

```typescript
import { NextResponse } from "next/server";
import sharp from "sharp";
import { generate, uploadToFal } from "@/lib/fal";
import { MODELS, type ModelId } from "@/lib/models";
import { CAD_STUDIO_OUTPUT_SIZE } from "@/lib/output-sizes";
import { CAD_CLEANUP_PROMPT } from "@/lib/cad-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Offset an image by half in both axes (diagonal quadrant swap) so its outer
 * edges become continuous and any interior seam moves to the exact center.
 */
async function offsetByHalf(buf: Buffer, width: number, height: number): Promise<Buffer> {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const rightW = width - halfW;
  const bottomH = height - halfH;

  const quad = (left: number, top: number, w: number, h: number) =>
    sharp(buf).extract({ left, top, width: w, height: h }).png().toBuffer();

  const [tl, tr, bl, br] = await Promise.all([
    quad(0, 0, halfW, halfH),
    quad(halfW, 0, rightW, halfH),
    quad(0, halfH, halfW, bottomH),
    quad(halfW, halfH, rightW, bottomH),
  ]);

  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: br, left: 0, top: 0 },
      { input: bl, left: rightW, top: 0 },
      { input: tr, left: 0, top: bottomH },
      { input: tl, left: rightW, top: bottomH },
    ])
    .png()
    .toBuffer();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, modelId } = body as { imageUrl: string; modelId?: ModelId };

    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "imageUrl is required" }, { status: 400 });
    }
    const model: ModelId = modelId && MODELS[modelId] ? modelId : "nano-banana";

    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `Could not fetch result image (HTTP ${resp.status})` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const width = meta.width ?? 2048;
    const height = meta.height ?? 2048;
    if (!width || !height) {
      return NextResponse.json({ ok: false, error: "Could not read image dimensions" }, { status: 400 });
    }

    const offsetBuf = await offsetByHalf(buf, width, height);
    const offsetUrl = await uploadToFal(
      new Blob([offsetBuf], { type: "image/png" }),
      "cad-cleanup-offset.png"
    );

    const result = await generate({
      modelId: model,
      prompt: CAD_CLEANUP_PROMPT,
      imageUrls: [offsetUrl],
      raw: true,
      useDefaultReference: false,
      referenceImageUrl: null,
      aspectRatio: "1:1",
      resolution: "2K",
      format: "png",
      numImages: 1,
      outputSize: CAD_STUDIO_OUTPUT_SIZE,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[cad-cleanup] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Cleanup failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Confirms `generate`/`uploadToFal`/`MODELS`/`CAD_STUDIO_OUTPUT_SIZE`/`CAD_CLEANUP_PROMPT` all import correctly and the `generate()` params match `GenerateParams`.

- [ ] **Step 3: Build to confirm the route registers**

Run: `npm run build`
Expected: build succeeds and the route list includes `ƒ /api/cad-cleanup`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cad-cleanup/route.ts
git commit -m "feat(cad): add /api/cad-cleanup — offset + AI residual-construction scrub"
```

---

## Task 3: "Clean up (AI)" button — `components/cad/CadTilingPreview.tsx`

**Files:**
- Modify: `components/cad/CadTilingPreview.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CadTilingPreview` props extended to `{ imageUrl: string; onReroll: () => void; rerolling: boolean; onCleanup: () => void; cleaning: boolean }`.

**Notes:** The current file ends its render with a single full-width "Re-roll for tighter seam" button. Replace that single button with a two-button row (Re-roll + Clean up). Both buttons are disabled while either action runs, so a user can't start a cleanup mid-reroll.

- [ ] **Step 1: Extend the `Props` interface**

Find:

```tsx
interface Props {
  imageUrl: string;
  onReroll: () => void;
  rerolling: boolean;
}
```

Replace with:

```tsx
interface Props {
  imageUrl: string;
  onReroll: () => void;
  rerolling: boolean;
  onCleanup: () => void;
  cleaning: boolean;
}
```

- [ ] **Step 2: Destructure the new props**

Find:

```tsx
export default function CadTilingPreview({ imageUrl, onReroll, rerolling }: Props) {
```

Replace with:

```tsx
export default function CadTilingPreview({ imageUrl, onReroll, rerolling, onCleanup, cleaning }: Props) {
```

- [ ] **Step 3: Replace the single Re-roll button with a two-button row**

Find the existing button near the end of the component:

```tsx
      <button
        type="button"
        onClick={onReroll}
        disabled={rerolling}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
      >
        {rerolling ? "Re-rolling…" : "Re-roll for tighter seam"}
      </button>
```

Replace with:

```tsx
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReroll}
          disabled={rerolling || cleaning}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
        >
          {rerolling ? "Re-rolling…" : "Re-roll for tighter seam"}
        </button>
        <button
          type="button"
          onClick={onCleanup}
          disabled={rerolling || cleaning}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
        >
          {cleaning ? "Cleaning…" : "Clean up (AI)"}
        </button>
      </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL — `components/CadExtractorClient.tsx` renders `CadTilingPreview` without the new required props `onCleanup`/`cleaning`. This is expected; Task 4 supplies them. (If you want a clean intermediate typecheck, proceed to Task 4 before running tsc; either order is fine since they ship together.)

- [ ] **Step 5: Commit**

```bash
git add components/cad/CadTilingPreview.tsx
git commit -m "feat(cad): add Clean up (AI) button to CadTilingPreview"
```

---

## Task 4: Wire `cleanup()` into `components/CadExtractorClient.tsx`

**Files:**
- Modify: `components/CadExtractorClient.tsx`

**Interfaces:**
- Consumes: the extended `CadTilingPreview` props (`onCleanup`, `cleaning`); the existing `fetchJson` helper, `resultUrls`/`setResultUrls`, `running`, and the existing `run` function already in the file.
- Produces: no new exports. Adds `cleaning` state, a `cleanup()` async handler, and passes `onCleanup`/`cleaning` to `CadTilingPreview`.

- [ ] **Step 1: Add `cleaning` state**

Find the existing scale/colorway state added in Phase 1:

```tsx
  const [scale, setScale] = useState<{ repeatCm: number; dpi: number } | null>(null);
```

Add directly below it:

```tsx
  const [cleaning, setCleaning] = useState(false);
```

- [ ] **Step 2: Add the `cleanup()` handler**

Add this function inside the component, near the existing `run` function (anywhere in the component body before the `return`):

```tsx
  async function cleanup() {
    if (!resultUrls.length) return;
    setError(null);
    setCleaning(true);
    try {
      const data = await fetchJson("Cleanup", "/api/cad-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: resultUrls[0], modelId }),
      });
      const urls: string[] = data.images?.map((i: any) => i.url).filter(Boolean) ?? [];
      if (!urls.length) throw new Error("Cleanup returned no image");
      setResultUrls([urls[0]]);
    } catch (e: any) {
      setError(e?.message || "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }
```

(`setError`, `resultUrls`, `setResultUrls`, `modelId`, and `fetchJson` all already exist in this file from Image-mode and Phase 1.)

- [ ] **Step 3: Pass the new props to `CadTilingPreview`**

Find:

```tsx
                <CadTilingPreview imageUrl={resultUrls[0]} onReroll={run} rerolling={running} />
```

Replace with:

```tsx
                <CadTilingPreview imageUrl={resultUrls[0]} onReroll={run} rerolling={running} onCleanup={cleanup} cleaning={cleaning} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. The `CadTilingPreview` props are now fully supplied and `cleanup()`/`cleaning` resolve.

- [ ] **Step 5: Commit**

```bash
git add components/CadExtractorClient.tsx
git commit -m "feat(cad): wire cleanup() handler + Clean up button into CAD Extractor"
```

---

## Task 5: Build + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: succeeds; route list includes `/cad-extractor`, `/api/cad-cleanup`, `/api/cad-extract`, `/api/cad-spec`, `/api/cad-export`.

- [ ] **Step 2: Manual smoke test (dev server)**

Run `npm run dev`, open `http://localhost:3000/cad-extractor`, log in. Then:
- Upload a garment photo with a clear print → Seamless + Nano Banana 2 → **Extract CAD**.
- Open the Tiling Preview; note the seam badge.
- Click **Clean up (AI)**; the button shows "Cleaning…". After it returns, confirm:
  - a new tile replaces the result (the 2×2 re-renders),
  - residual seam/hem/crease lines are reduced or gone,
  - the seam badge re-computes on the cleaned tile,
  - the result is still 2048×2048,
  - **Export** now uses the cleaned tile.
- Trigger the error path (e.g. stop the dev server mid-cleanup or pass a bad URL) → the red error toast appears and the original result is preserved.

- [ ] **Step 3: Confirm edges still tile after cleanup**

Download the cleaned tile (Export, or right-click) and tile it 2×2 (any image tool) to confirm the outer edges remain continuous (the AI was instructed to leave a margin near the edges). If the badge worsened, that indicates the AI touched the edges — note it; the user-facing recovery is to re-roll or re-clean (the feature never blocks on this).

- [ ] **Step 4: Final commit (only if Steps 1–3 required fixups)**

```bash
git add -A
git commit -m "chore(cad): build + smoke-test fixups for cleanup pass"
```

(Skip if no changes were needed. If a fixup IS needed, stage only the specific files changed, not `git add -A`, to avoid bundling unrelated working-tree WIP.)

---

## Self-Review Notes

- **Spec coverage:** `CAD_CLEANUP_PROMPT` → Task 1. Offset + `uploadToFal` + `generate()` route → Task 2. "Clean up (AI)" button + `onCleanup`/`cleaning` props → Task 3. `cleanup()` handler + result swap + verify-after (automatic via `imageUrl` change) → Task 4. Build + manual edge/seam verification → Task 5.
- **Placeholder scan:** none — every code step contains the full content.
- **Type consistency:** `onCleanup: () => void` and `cleaning: boolean` are defined in Task 3's `Props` and supplied in Task 4. `cleanup()` returns `Promise<void>`. The route's request `{ imageUrl, modelId? }` matches the body Task 4 sends. The response `{ ok, images }` matches what `cleanup()` reads (`data.images`).
- **Reuse:** `generate()` params copy `/api/cad-extract` verbatim; `uploadToFal(new Blob([buf], {type}), name)` copies the existing in-repo pattern; the seam re-score is the unchanged Phase 1 client path. No new dependency.
- **Out of scope honored:** no classifier, Pantone, color calibration, repeat-count detection, vector/separations, auto-reroll-keep-best.
- **WIP safety:** every task stages only its named file(s); Task 5's optional fixup explicitly avoids `git add -A`.
