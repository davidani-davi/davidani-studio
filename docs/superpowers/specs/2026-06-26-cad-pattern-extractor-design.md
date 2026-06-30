# CAD Pattern Extractor — Design

Date: 2026-06-26
Status: Approved (design), pending spec review

## Purpose

A new studio tab that **recovers production-ready textile CAD artwork from
photographs of finished garments**. It does NOT design, restyle, or "improve"
prints. It reverses every post-design transformation (body warp, drape,
wrinkles, seams, pockets, lighting, perspective, camera distortion) and returns
the flat 2D print artwork as it existed before the fabric was cut and sewn — the
file a textile designer would have sent to the mill.

The final output must read as **textile artwork, never as a garment**.

## User decisions (locked)

- **Scope**: Mode selector (modular), not one mega-prompt. Three modes.
- **Output shape**: Square 1:1, server-locked (`CAD_STUDIO_OUTPUT_SIZE = 2048×2048`).
- **Model**: User-selectable dropdown, no forced default (dropdown initialises to
  Seedream-4 for texture fidelity, but every model is available and the choice
  is the user's per run).
- **Mode UX**: Single dropdown, one Generate button. Spec Analysis swaps the
  result panel to a text/spec card.
- **Reconstruction aggressiveness**: Infer & complete — reconstruct hidden
  artwork (under pockets/seams/folds) and extrapolate the full repeat from
  surrounding motifs.

## Modes

### Mode 1 — Flat Artwork Recovery (image)
Reverse garment construction, drape, wrinkles, lighting, shadows, perspective
and lens distortion. Recover the flat printed artwork **exactly as printed** —
preserve every motif, distress mark, ink texture, fade, color, opacity,
placement, rotation, scale, spacing, and intentional imperfection. Reconstruct
artwork hidden under pockets/seams/folds from surrounding artwork. **No seamless
tiling** in this mode. Output: flat 2D, square, no garment/mannequin/background.

### Mode 2 — Seamless Production CAD (image)
Everything in Mode 1, then force a **perfectly tileable square repeat**: top
edge connects to bottom, left to right, no visible seams, no duplicated motifs
near edges, no abrupt cutoffs. Infer & complete the full repeat from the
surrounding artwork while preserving the original artistic language. Never
introduce unrelated motifs.

### Mode 3 — Spec Analysis (text)
Vision-model analysis returning a tech-pack-style spec (no image generated):
- Repeat type: full repeat / half-drop / brick / mirror / engineered placement /
  border / panel / all-over.
- Directional vs non-directional.
- Estimated color count + palette (hex swatches).
- Motif inventory (named motifs + approximate counts).
- Estimated repeat dimensions / scale notes.
- Print technique & texture notes (screen print, pigment wash, halftone, ink
  bleed, distressing, etc.).

Rendered as a spec card in the result panel.

## Architecture

### Frontend
- `app/cad-extractor/page.tsx` — thin server component rendering the client.
- `components/CadExtractorClient.tsx` — client UI, modeled on
  `ImagePlaygroundClient.tsx` (proven, isolated layout):
  - **Left rail**: mode selector, model dropdown (`MODELS`), aspect is fixed
    1:1 (not user-editable), upload + reference library with multi-select
    (multi-photo reconstruction → all selected refs passed to one generation).
  - **Center**: optional "extraction notes" textarea (free-text hints appended
    to the mode prompt), Generate button, cost/asset summary.
  - **Right**: result grid + `ImageLightbox` for image modes; spec card for
    Mode 3. Per-run history in `localStorage` (key `davidani_cad_history_v1`),
    local-only for v1.
- `TopTabs.tsx`: add `"cad"` to the `StudioTab` union and a
  `{ id: "cad", label: "CAD Extractor", href: "/cad-extractor" }` tab entry.

### Backend
- `lib/output-sizes.ts`: add
  `export const CAD_STUDIO_OUTPUT_SIZE = { width: 2048, height: 2048 } as const;`
- `lib/cad-prompts.ts` (new):
  - `MODE_PROMPTS` — the Mode 1 and Mode 2 reconstruction prompts, distilled
    from the master spec (garment removal, artwork preservation, hidden-artwork
    reconstruction, repeat reconstruction, edge handling, color/texture
    preservation, output requirements). Mode 2 adds the seamless-tiling clause.
  - `buildCadPrompt(mode, notes)` — assembles the mode prompt + optional user
    notes.
  - `CAD_SPEC_SYSTEM_PROMPT` + `analyzeTextileSpec(imageUrls): Promise<CadSpec>`
    — vision analysis via the existing `subscribeVisionWithRetry` helper in
    `lib/fal.ts` (reused/imported); returns strict JSON parsed into `CadSpec`.
- `app/api/cad-extract/route.ts` (new) — image modes (1 & 2):
  - Validates `modelId`, `mode ∈ {flat, seamless}`, `imageUrls[]`.
  - Calls `generate({ modelId, prompt: buildCadPrompt(mode, notes), imageUrls,
    raw: true, useDefaultReference: false, referenceImageUrl: null,
    aspectRatio: "1:1", resolution, format: "png", numImages,
    outputSize: CAD_STUDIO_OUTPUT_SIZE })`.
  - `raw: true` is critical: it skips the auto-injected style-reference canvas
    and the garment-swap prompt prefix from `optimizePromptForModel`, so nothing
    from Image Studio leaks into extraction.
  - `runtime = "nodejs"`, `maxDuration = 300`.
- `app/api/cad-spec/route.ts` (new) — Mode 3 text:
  - Validates `imageUrls[]`, calls `analyzeTextileSpec(imageUrls)`, returns the
    `CadSpec` JSON.

### Data flow
Upload photos → `/api/upload` (existing) → URLs in reference library → select
refs → choose mode + model → Generate:
- Image modes → `POST /api/cad-extract` → `generate()` → square PNG(s) → result
  grid + history.
- Spec mode → `POST /api/cad-spec` → `analyzeTextileSpec()` → spec card.

## Why a dedicated route (not `/api/generate`)
`/api/generate` hardcodes `outputSize: IMAGE_STUDIO_OUTPUT_SIZE` (2160×3240,
2:3) server-side and ignores any client value. Reusing it would cover-crop the
square CAD into a portrait. The codebase's established pattern is one
server-locked output size per studio, so CAD gets its own route with a square
lock. This keeps the Image Studio lock untouched.

## Error handling
- Reuse the `fetchJson` non-JSON-guard pattern from existing clients.
- Per-result `failed` status with surfaced error message (Playground pattern);
  one failure doesn't halt a multi-photo/batch run.
- Spec mode: if the vision model returns unparseable JSON, surface a clear
  "could not parse spec" error rather than a half-card.

## Testing
- Manual: each mode against 2–3 real garment photos (all-over print, placement
  graphic, distressed/washed print). Verify: garment fully removed, square
  output, Mode 2 tiles seamlessly, Spec card fields populated.
- Build: `npm run build` / typecheck passes (new union member, new routes).
- Verify the square lock: generated file dimensions are 2048×2048.

## Out of scope (v1, YAGNI)
- True vector/SVG export and automatic color separations.
- Cloud history sync (local-only first; can adopt `client-cloud-history` later).
- Repeat Detection as a standalone mode (folded into Spec Analysis).
- Strike-off / colorway generation.
