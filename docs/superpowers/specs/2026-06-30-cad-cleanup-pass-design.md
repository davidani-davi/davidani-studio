# CAD Cleanup Pass — One-Click AI Residual-Construction Scrub (Design)

**Date:** 2026-06-30
**Status:** Approved, ready for implementation plan
**Project:** `davidani-studio` — CAD Pattern Extractor (Phase 2 slice)
**Supersedes:** `2026-06-30-cad-seam-heal-design.md` (narrowed "seam heal" → broader "cleanup pass")

## Goal

Add a **one-click "Clean up (AI)"** action to the CAD Extractor's Tiling Preview that takes a recovered tile and removes the **residual garment construction and seams the first recovery pass left behind** — hem stitch lines, panel/inseam seams, creases, gathers, folds — healing the printed artwork over them, and tightening any tile-edge seam, so the result is a clean, flat, tileable repeat.

### Why (live-testing evidence)

Across repeated rolls of a hard garment (a heavily-gathered balloon-hem floral), the recovery prompt fixes (appliqué removal, gathered-cuff removal, full-frame fill) got results to ~90%: frame filled, cuffs gone, strong aesthetic. But a **horizontal hem stitch line and faint seams keep surviving** into the tile body, and re-rolling does not reliably clear them. A second, targeted AI pass that scrubs those leftovers turns good-enough rolls into clean files instead of relying on the re-roll lottery.

This replaces the narrower "tiling-seam heal" idea: the real recurring defect is residual *construction in the tile body*, not only edge seams. The cleanup pass addresses both.

Out of scope (separate Phase 2 items): input classifier, Pantone-estimate colorway, color calibration, repeat-count auto-detect, vector/color-separations, auto-reroll-keep-best.

## Approach (decision)

**Offset + broad AI cleanup**, reusing the existing image-edit path:
1. **Offset** the tile by half (sharp; swap diagonal quadrants) so the *edges become continuous* (any edge seam is removed for free) and any body construction is merely relocated.
2. **AI cleanup pass** — reuse `generate()` (Nano Banana, `raw: true`, 2048² square) with a broad cleanup instruction: remove every residual seam, hem/stitch line, crease, fold, gather, and panel break anywhere in the image; reconstruct the flat printed artwork across them from the surrounding print; smooth the faint center crosshair left by the offset; preserve all printed motifs, colors, opacity, and texture; do NOT alter the outer edges (keep it tileable); output flat 2D artwork only.
3. Return the cleaned tile; the UI swaps it in and **re-scores the seam** (verify-after).

Why offset is included: it gives a reliable edge-seam fix that instruction alone does not, and it harmlessly relocates body construction for the same AI pass to scrub. **Risk:** the offset introduces a hard center crosshair the AI must also heal; if the AI under-heals it (or touches the edges), the post-cleanup seam score will not improve — the user sees that and re-rolls or re-cleans. This is consistent with the tool's verify-don't-trust posture (the cleanup is never blindly accepted).

Alternatives rejected: local frequency/patch blend (softens/smudges — the demo showed this); auto-reroll-keep-best (discards the tile the user liked, costs many generations).

## Context

- Live on `main`: CAD Extractor with Nano Banana default, appliqué removal, gathered-cuff/full-frame recovery hardening, and Phase 1 (scale tool, tiling preview, export).
- `lib/fal.ts` `generate(params: GenerateParams)` already does instructed image-edit with `imageUrls`, `prompt`, `raw: true`, `useDefaultReference: false`, `referenceImageUrl: null`, `aspectRatio: "1:1"`, `outputSize` — exactly as `/api/cad-extract` uses it. `uploadToFal(file: File | Blob, name)` returns a fal URL (pattern: `uploadToFal(new Blob([buffer], { type }), name)`).
- Tiles are 2048² (`CAD_STUDIO_OUTPUT_SIZE`). `sharp ^0.34.5` installed. `CadTilingPreview` renders the 2×2 + seam-score badge + Re-roll; the score recomputes client-side via `seamScore`/`SEAM_SCORE_THRESHOLD` in `lib/cad-export.ts`.
- `npm run lint` is broken project-wide (Next 16); verification is `npx tsc --noEmit` + `npm run build` + manual smoke.

## Components

### 1. Cleanup prompt — `lib/cad-prompts.ts`

Add a pure string export `CAD_CLEANUP_PROMPT` (final wording in the plan). Intent: the supplied image is a flat 2D textile print recovered from a garment photo that still contains **residual garment construction** — faint hem/stitch lines, panel and inseam seams, creases, fold shadows, gathers — and a faint cross-shaped seam through the exact center. Remove ALL of these: reconstruct the continuous printed artwork over every seam/line/crease/gather/fold using only the surrounding print, matching motifs, colors, opacity, and texture exactly. Do not restyle, recolor, sharpen, add, or invent motifs. Do NOT modify the outer edges of the image — they are already tileable and must stay continuous. Output flat 2D artwork only — a square composition filling the frame, no garment, photo, shadow, or border.

### 2. Cleanup route — `app/api/cad-cleanup/route.ts`

`POST /api/cad-cleanup`
- Body: `{ imageUrl: string; modelId?: ModelId }` (default `"nano-banana"`).
- Steps:
  1. Fetch the tile; read width/height via `sharp().metadata()` (expect 2048²).
  2. **Offset by half:** extract the four quadrants and recomposite with a diagonal swap (new TL = old BR, new TR = old BL, new BL = old TR, new BR = old TL) → a 2048² PNG buffer with continuous edges and the seam moved to center.
  3. **Upload** the offset PNG via `uploadToFal(new Blob([buf], { type: "image/png" }), "cad-cleanup-offset.png")` → fal URL.
  4. **AI cleanup:** `generate({ modelId, prompt: CAD_CLEANUP_PROMPT, imageUrls: [offsetUrl], raw: true, useDefaultReference: false, referenceImageUrl: null, aspectRatio: "1:1", resolution: "2K", format: "png", numImages: 1, outputSize: CAD_STUDIO_OUTPUT_SIZE })`.
  5. Return `{ ok: true, images }` (same shape as `/api/cad-extract`) or `{ ok: false, error }`.
- `export const runtime = "nodejs"; export const maxDuration = 300;`.

The offset output is itself a valid (phase-shifted) seamless tile; it is not un-offset.

### 3. UI — `components/cad/CadTilingPreview.tsx` + `components/CadExtractorClient.tsx`

- `CadTilingPreview` gains `onCleanup: () => void` and `cleaning: boolean`, rendering a **"Clean up (AI)"** button next to "Re-roll for tighter seam" (disabled while `cleaning` or `rerolling`; label → "Cleaning…").
- `CadExtractorClient` owns a `cleanup()` handler: POST `/api/cad-cleanup` with the current result URL; on success **replace the active result** (`setResultUrls([cleanedUrl])`), driven by a `cleaning` state; errors use the existing red error toast.
- **Verify-after is automatic:** swapping the result URL re-runs `CadTilingPreview`'s seam score and re-renders the 2×2, so the user immediately sees whether the cleanup helped; export then uses the cleaned tile.

## Data flow

```
result tile (2048², residual construction + maybe edge seam)
        │  user clicks "Clean up (AI)"
        ▼
CadExtractorClient.cleanup() ── POST /api/cad-cleanup { imageUrl }
        ▼ (server)
 sharp: offset by half (edges continuous, body construction relocated, seam → center)
        ▼
 uploadToFal(offset PNG) → fal URL
        ▼
 generate(nano-banana, CAD_CLEANUP_PROMPT, raw, 2048²) → cleaned URL
        ▼
 { images:[{url}] } ──► setResultUrls([cleanedUrl])
        ▼
 CadTilingPreview re-renders → 2×2 + seam score recompute → updated badge
 CadExportPanel now exports the cleaned tile
```

## Error handling

- Fetch/offset/upload/generate failure → `{ ok:false, error }`, surfaced via the existing error toast; the original result is untouched (state only updates on success).
- Cleanup that doesn't improve the result (AI under-heals or touches edges) → not blocked: the recomputed seam badge shows the real score; the user can re-roll or re-clean. No silent bad output.
- Non-2048² input → offset uses actual metadata dimensions; if the quadrant math can't run, return 400.

## Verification (no test framework)

1. `npx tsc --noEmit` — passes.
2. `npm run build` — succeeds; route list includes `/api/cad-cleanup`.
3. Manual smoke: recover a tile with a visible residual hem/seam line → open Tiling Preview → click **Clean up (AI)** → confirm a cleaned tile returns, replaces the result, the 2×2 re-renders, the hem/seam line is reduced or gone and the badge reflects it; export uses the cleaned tile; output is still 2048².

## Self-Review Notes

- **Scope:** one prompt string + one route + a two-prop UI addition + a parent `cleanup()` handler. Cohesive, single plan. Mirrors the Phase 1 export wiring.
- **Reuse:** cleanup reuses `generate()` exactly as `/api/cad-extract` (same raw/no-reference/square-lock params); offset via sharp; upload via `uploadToFal`; seam re-score via the Phase 1 client path. No new dependency.
- **Geometry:** offset = diagonal quadrant swap = half-roll both axes → edges continuous, seam → center; the broad cleanup prompt scrubs relocated body construction + the center crosshair and is told to leave edges untouched, so the output stays tileable. Result is not un-offset (phase-shifted repeat is valid).
- **Risk acknowledged & mitigated:** the offset's hard center crosshair could be under-healed; the automatic post-cleanup seam score (verify-after) is the safety net.
- **Naming:** route `/api/cad-cleanup`, prompt `CAD_CLEANUP_PROMPT`, UI "Clean up (AI)", props `onCleanup`/`cleaning`, handler `cleanup()` — consistent throughout.
- **Consistent deferrals:** classifier, Pantone, color-calibration, auto-reroll-keep-best remain separate Phase 2 items.
