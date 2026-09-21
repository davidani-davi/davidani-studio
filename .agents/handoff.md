# Handoff — 2026-09-21, Codex
Branch codex/simple-background-seam; base 5e01b25; changes in this commit.
- User supplied DET62252 Black Simple result with horizontal neck-level background seam.
- Confirmed source is clean; result exactly copies full-width rows through 348, edge at 350.
- Simple mask now releases border-connected neutral studio backdrop above reviewed cut.
- Feather stays outside foreground; original face remains protected, no old shoulder restored.
- Dark/saturated edge backgrounds retain conservative legacy protection (not segmented).
- Regression checks: continuous provider backdrop, exact face including enclosed highlights,
  unchanged generated clothing, reviewed asset hashes, dark/coloured backdrop fallback.
- 1,036 tests / 83 files passed; production webpack build passed.
- Live DET62252/Vision same-provider A/B saved in Faire output/simple-neck-seam-fix.
- Central face unchanged byte-for-byte; everything below row 353 unchanged.
- New outer background exactly matches continuous provider output across prior boundary.
- Next: merge/deploy backend and verify production Simple render before reporting fixed.
- Separate pending work: more Simple pose sets MUST use actual Davi&Dani photoshoot bases.
- Faire output/reference-sets/photoshoot-bases-20260920 has 12 unchanged originals.
- User has not answered whether to apply approved Vision/Celine identities or original models.
- No new pose sets published; synthetic plain-outfit attempt rejected by user.
