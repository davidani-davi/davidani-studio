# Handoff — 2026-11-02, Claude Code (Mac mini)

main **4a82237** = #54 merged, Vercel production READY (David: "Yes, merge both"). #53 jaw outlines live since ad7e78d.
faire-management #239 (Heal button, ext 2.190.0 / team add-on 1.33.0) merged + deployed (a403aec8).

## Just done
- Root cause of Jeonga's DT70115 doubled hair / second jaw edge / neck seams: GPT Image 2.5 edits return the person
  1-3% smaller and 10-20 px off (up to ~2 deg rotated). The Simple composite assumed pixel alignment, so every outline
  edge blended two heads. #53's jaw outlines alone could not fix that.
- `lib/face-align.ts`: similarity fit (scale, rotation, shift) by NCC of luminance inside the outline + blend band,
  coarse to fine; the generated frame is resampled (bicubic, native size) into the reference frame before the face goes
  back. Original pixels never move. Guards: |s-1|<=8%, rot<=4 deg, shift<=6% width, must beat the unmoved frame; else
  nothing is warped and `preservation.alignment.reason` says why. Simple only. Real frames: NCC 0.69-0.83 -> 0.985-0.997.
- Heal (`lib/heal.ts`, `heal` field on POST /api/model-shots): re-composites an existing Simple render with NO
  generation. Finds the render's raw frame in fal request history (free read, FAL_KEY), by base photo + an exact
  pixel match below the face, then composites it with today's outline + alignment and returns the verified image
  (`healed: {requestId, difference, ...}`). Needs the render's humanModelId + poseId (result.poseId for recast sets);
  bottoms full bases need `heal.autoContour` (never runs paid outline detection). Sync even if `async:true`.
  Checked on Jeonga's 5 real DT70115 renders: all matched (difference 0.000), 7-15 s each.
- vitest 1413/1413; tsc only the 10 pre-existing test-file errors.

## Next steps
1. Watch the first real Simple renders after 4a82237 (a draft set and a bottoms full shot too): each should report
   `preservation.alignment`; `.reason` set = alignment refused. A set that still shows a neck line needs a hand-reviewed
   outline. Don't render to test: image generation is Codex-only (no paid fal calls).
2. Heal Jeonga's 5 DT70115 renders through faire-management (`listing-jobs` kind `heal-shot`), or let her press Heal.
3. Proposed, not approved: automatic seam check before ERP upload; draft-contour outlines that follow the jaw.

## Gotchas
- A render made AFTER alignment no longer matches its raw frame pixel for pixel, so Heal says "already healed".
- fal history window: renderedAt -45/+20 min, else last 14 days. Raw frames older than fal's retention cannot heal.
- Never copy auto outlines into presets without visual review; never restore the horizontal row cutoff (SOP §8).
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- `~/Code/davidani-studio` (main checkout) is on `codex/garment-only-pixel-lock` with uncommitted edits: leave it.
