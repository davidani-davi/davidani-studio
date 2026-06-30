# CAD Pattern Extractor — Phase 1: Print-Ready Output (Design)

**Date:** 2026-06-30
**Status:** Approved, ready for implementation plan
**Project:** `davidani-studio` — CAD Pattern Extractor tab

## Goal

Make the CAD Pattern Extractor produce **digital print files a manufacturer can use as-is**, for the specific workflow: reverse-engineer a fabric from a garment photo → hand the factory a file they **print directly** onto cloth.

Because the factory prints the file directly, the three things that make a file "sendable" are:
1. **Scale** — the file must declare the real-world repeat size (cm) so the print comes out the right size on fabric.
2. **Seamlessness** — any tile seam prints onto every garment, so seams must be visible to the user before export.
3. **A clean exportable asset** — a high-resolution file with the print size baked in, plus a compact spec, downloadable in one click (there is no export button today).

Out of scope for Phase 1 (deferred to Phase 2): input classifier ("printed vs textural" + "this will print flat" warning), optional user-triggered seam auto-heal, Pantone-estimate colorway, color calibration against the original, fidelity hybrid (crop-and-tile real pixels), vector/color-separation export.

## Context

- The CAD Extractor tab is live on `main` (PR #2). Default model is Nano Banana 2 (PR #2). An appliqué/embellishment-removal prompt fix is in flight (PR #3).
- `lib/fal.ts` already exposes `analyzeTextileSpec(imageUrls)` returning a `CadSpec` with `palette` (hex + name), `colorCount`, `repeatType`, `technique`. **The colorway data Phase 1 needs already exists** — Phase 1 surfaces it in the export rather than recomputing it.
- `sharp ^0.34.5` is installed (server-side image processing, DPI metadata).
- No PDF library is installed, and Phase 1 deliberately avoids adding one (spec sheet is composed as a PNG via sharp + SVG).
- No test runner exists. Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a manual smoke test.
- `components/CadExtractorClient.tsx` is ~518 lines already; Phase 1 adds focused child components rather than growing it.

## Components

### 1. Scale tool — `components/cad/CadScaleMeasure.tsx`

An interactive overlay on the **original garment photo** (the primary selected reference), shown after a result is generated.

The user draws two line segments, each with two draggable endpoint handles rendered as an SVG overlay on top of the displayed `<img>`:

- **Reference line** — drawn across a dimension whose real size the user knows (e.g. waistband width). The user types the real length in cm into an input.
- **Repeat line** — drawn from one motif to the next identical motif (i.e. one repeat period of the print).

**Math (pure ratio — display-scale invariant):**

```
repeat_cm = (repeat_px / reference_px) * reference_cm
```

Both distances are measured in the *same displayed image*, so zoom / CSS scaling cancels out — no need to convert to natural-image pixels.

The generated tile is **2048 × 2048 px** and (in seamless mode) represents exactly **one repeat unit**. Therefore the print resolution is:

```
DPI = 2048 / (repeat_cm / 2.54)        // 2.54 cm per inch
```

**Assumption (documented in UI copy):** the seamless tile equals one full repeat. Auto-detecting repeat count is Phase 2.

**Accuracy caveat (shown as helper text):** on a 3-D garment, the reference line and the repeat line should be measured on the same flat-facing area; large perspective/foreshortening differences between them skew the cm estimate. This yields a good estimate, not a lab-precise measurement.

**Output:** `{ repeatCm: number, dpi: number }` lifted into `CadExtractorClient` state. Entirely client-side; no API call.

**Empty/error states:** if the user does not complete both lines, scale is `null`; export proceeds but is flagged "no scale set" (see Export).

### 2. Verified seamless + 2×2 preview — `components/cad/CadTilingPreview.tsx`

A "Tiling preview" panel that renders the generated result **2×2 on a client-side `<canvas>`** so the user sees the edge joins immediately.

From the same canvas pixel data it computes a **seam score**:
- Compare the left edge strip vs the right edge strip, and the top edge strip vs the bottom edge strip (a few px wide each), as mean absolute difference per channel, normalized to 0–100.
- Render a badge: **Seamless ✓** (score below threshold) or **Seam visible ⚠** (above threshold). Threshold is a tunable constant in `lib/cad-export.ts`.

Phase 1 is **verify + show only** — no automatic edge modification (auto-heal blends/smears artwork at the edges and would silently reduce fidelity, which is the tool's core value). The panel offers a **"Re-roll for tighter seam"** action that re-runs the existing seamless extraction with the same inputs. Optional, user-triggered, undoable heal is Phase 2.

All preview + scoring is client-side (canvas `getImageData`); no server round-trip.

### 3. Print-ready export — `components/cad/CadExportPanel.tsx` + `app/api/cad-export/route.ts`

**Spec card (on-screen):** shows repeat cm, DPI, pixel dimensions, repeat type (from `CadSpec`), and the colorway as hex swatches + count (from `CadSpec.palette` / `colorCount`). Colorway is **hex-only** in Phase 1 — the factory prints the file directly, so the file's pixels are the color spec; an AI-guessed Pantone from a photo would be false precision. Pantone-estimate is Phase 2.

**Export action → `POST /api/cad-export`:**
- Body: `{ imageUrl, repeatCm, dpi, repeatType, palette, colorCount }`.
- Server downloads the 2048² result, uses `sharp` to **stamp the DPI** into the file metadata (`.withMetadata({ density: dpi })`) and returns a high-res PNG.
- Server also composes a **spec-sheet PNG** via sharp + an SVG overlay (brand header, repeat cm, DPI, px dims, repeat type, colorway swatch row). No new dependency.
- Response delivers both files (print PNG + spec PNG) for download. If `repeatCm`/`dpi` are null, the print file is exported without a density stamp and the spec card / sheet is annotated **"scale not set."**
- `export const runtime = "nodejs"; export const maxDuration = 300;` matching the other CAD routes.

### 4. Pure helpers — `lib/cad-export.ts`

No server/DOM dependencies, so it is unit-reasonable and importable from both client and route:
- `repeatCmToDpi(repeatCm, tilePx = 2048): number`
- `seamScore(edgePairs): number` and the seam-score threshold constant
- `buildSpecSheetSvg(spec): string` — returns SVG markup for the spec sheet (rendered to PNG by sharp in the route)

## Data flow

```
upload photo ──► generate (seamless, Nano Banana 2) ──► result tile (2048²)
                                                          │
   ┌──────────────────────────────────────────────────────┤
   ▼ (client)                          ▼ (client)          ▼ (client→server)
CadScaleMeasure                 CadTilingPreview      CadExportPanel
  draw 2 lines                    2×2 canvas            spec card (hex colorway
  → repeatCm, dpi                 seam score badge       from existing CadSpec)
                                  re-roll action         │
                                                         ▼ POST /api/cad-export
                                                   sharp: DPI-stamp PNG
                                                        + spec-sheet PNG
                                                         ▼
                                                   download both files
```

State owned by `CadExtractorClient`: `{ repeatCm, dpi }` from the scale tool, the active result URL, and the `CadSpec` (fetched once per result via the existing spec analyzer, reused for colorway). Children are controlled/presentational where practical.

## Error handling

- **Incomplete measurement** → scale `null`; export still works, flagged "scale not set" in the card, sheet, and a toast hint.
- **High seam score** → warn badge only; export is never blocked (the user decides). "Re-roll" is offered.
- **`/api/cad-export` failure** → existing red error-toast pattern in `CadExtractorClient`.
- **Spec analyzer unavailable** (colorway) → export proceeds without the colorway row; the rest of the spec is unaffected.

## Verification (no test framework)

1. `npx tsc --noEmit` — passes.
2. `npm run lint` — no new errors in CAD files.
3. `npm run build` — succeeds; route list includes `/api/cad-export`.
4. Manual smoke test: upload a garment photo → generate (seamless) → draw reference (enter cm) + repeat lines → confirm computed cm/DPI are sane → open Tiling preview, confirm 2×2 renders and the seam badge appears → Export → open the downloaded PNG, verify with `sips -g dpiWidth` that the DPI matches, and that the spec-sheet PNG shows the right repeat cm / colorway.

## Self-Review Notes

- **Scope:** three components + one route + one pure-helpers module. Cohesive ("produce a print-ready file"), single implementation plan.
- **Reuse:** colorway comes from the existing `analyzeTextileSpec`/`CadSpec` — Phase 1 does not re-derive palette. Seamless preview + scale math are pure client-side; only DPI-stamp + spec-sheet rendering need the server (sharp).
- **No new dependencies:** sharp (installed) covers DPI metadata and spec-sheet PNG; no PDF lib added.
- **Deferred consistently:** classifier, auto-heal, Pantone-estimate, color calibration, repeat-count auto-detect, vector/separations — all Phase 2, none referenced as if present.
- **Consistency:** tile is 2048² everywhere (matches the existing `CAD_STUDIO_OUTPUT_SIZE` square lock); DPI derives from that constant via `repeatCmToDpi`.
