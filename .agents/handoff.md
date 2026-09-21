# Handoff — 2026-09-21, Codex
Branch codex/contrast-stitching-fidelity; based on main8a1be70.
- User reported DET62252 Blue losing pink neckline stitching on Celine3 Simple swap.
- Traced Simple prompt: generic construction wording; anchor could override product details.
- Updated contrast thread/seam/trim fidelity, product image remains construction authority.
- Celine3 source-bound mask ends above neckline; regression preserves synthetic pink rows
  and every garment pixel from y378 downward while retaining exact protected face pixels.
- Original run raw provider image was not persisted; cannot compare that specific raw/final pair.
- npm test:1147 passed/84files; production webpack build passed.
- This strengthens prompting; visual success on a new real render remains unverified.
- Next: merge/deploy PR, then user Redo Blue front; check pink stitching before remaining views.
- No reference assets/face contours/compositor altered. Never restore row fallback/native-face PR15.
- Prior universal contour audit remains live (PR16/main8a1be70); evidence in Faire repo.
