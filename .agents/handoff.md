# Handoff — 2026-09-21, Codex
Branch codex/simple-contour-review; base/main5cdaff1; prototype in this commit.
- David rejected native Simple face drift. PR15 CLOSED, do not merge its branch.
- Authorized reviewed contour mask test; exact face preserved, feather OUTSIDE contour.
- Added standalone contour-face-mask.ts plus tests; NOT integrated into route.
- Hash/dimension-bound polygon, finite-coordinate checks, distance-based outward blend.
- No row cut, exposure matching, generated face or clothing restored from source.
- Back test protects only interior hair; no protected neck strip.
- All1,038 tests/84files and production webpack build pass.
- Four-view experiment uses existing raw native outputs, no new provider spend.
- Faire output/simple-contour-review has masks, reviewed points, original-pixel reports,
  output PNGs, runner. No changed protected pixels; all outside-mask pixels unchanged.
- Visually no neck seam seen; awaiting David's judgment. No production changes.
- Next if accepted: integrate reviewed hash-bound contours into Simple route, test saved
  custom refs and all views; verify production before claiming release.
- Coordinates specific to Vision Playful boots; do not generalize to other sets.
- Existing production still uses row protection and can seam.
- More pose sets must use actual Davi&Dani photographed bases (prepared in Faire).
