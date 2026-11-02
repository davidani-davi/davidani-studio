# Handoff — 2026-11-02, Claude Code (Mac mini)

Branch `claude/jaw-outlines-jeonga-sets` = PR #53 (open, NOT merged: needs David's OK). main fadfc2c (#52, live).

## Just done
- Jeonga's DT70115 renders showed a line across the neck. Cause: the auto face outlines (`auto-draft-v1` /
  `recast-mask-v1`) end in a flat bottom under the chin, so the neck below it is regenerated and relit by the
  new garment.
- #53 adds 21 reviewed contours to `lib/simple-contour-presets.json` (Blob URL keys) for draft CELINE 1,
  draft VISION 3, draft CELINE 3 and Celine · DCT78115. Each keeps the auto hull around the hair and swaps
  only the flat bottom for the jaw (Apple Vision landmarks). CELINE 1 back and CELINE 3 back are hand-drawn
  profiles (the old CELINE 1 back outline left nose + chin unprotected). VISION 3 back, DCT78115 back-11 and
  back-12 stay on auto. sha256/size reused from each photo's stored autoContour.
- garmentBoundaryY raised to ceil(maxY + feather) where needed (the catalog test requires an open mask below
  it; same rule as `draft-contour.ts`). It is informational only, not used in the mask.
- Checked: vitest 1399/1399; overlays + magenta stress blend of all 21; re-composites of the 4 seamed renders
  from raw fal frames (neck lines gone). Work files: session 9c38fcaf scratchpad (`final.json`, `gen.py`, `zc.jpg`).
- Not checked: 17 of the 21 photos have no real render with the new outline. The first renders should report
  faceProtection `reviewed-contour-v1`. Small pale patch left of CELINE 3's jaw comes from the raw frame.

## Next steps
1. David OKs → merge #53 → confirm Vercel production READY → first renders on these sets (Jeonga's, or a
   paid render only with David's OK) should show `reviewed-contour-v1` and no neck line.
2. Proposed, not approved: automatic seam check before ERP upload; make `lib/draft-contour.ts` / recast
   outlines follow the jaw so new sets don't seam.
3. Still open from #52: try Download + full-size Add model in Chrome on the MacBook Pro; recast-set buttons (#50).

## Gotchas
- Never copy auto outlines into presets without visual review; never restore the horizontal row cutoff (SOP §8).
- Generated hair silhouettes don't line up with the base: never cut an outline through hair-to-backdrop edges.
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- `~/Code/davidani-studio` (main checkout) is on `codex/garment-only-pixel-lock` with uncommitted edits: leave it.
