# Handoff — 2026-11-02, Claude Code (Mac mini)

Branch `claude/align-before-face-composite` (PR open, NOT merged: needs David's OK). main ad7e78d (#53 jaw outlines, live).

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
1. David OKs -> merge -> confirm Vercel production READY. Every Simple render then reports `preservation.alignment`.
2. faire-management: Heal button on Jeonga's Listing Team add-on (team gateway -> this endpoint), separate PR.
3. Proposed, not approved: automatic seam check before ERP upload; draft-contour outlines that follow the jaw.

## Gotchas
- A render made AFTER alignment no longer matches its raw frame pixel for pixel, so Heal says "already healed".
- fal history window: renderedAt -45/+20 min, else last 14 days. Raw frames older than fal's retention cannot heal.
- Never copy auto outlines into presets without visual review; never restore the horizontal row cutoff (SOP §8).
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- `~/Code/davidani-studio` (main checkout) is on `codex/garment-only-pixel-lock` with uncommitted edits: leave it.
