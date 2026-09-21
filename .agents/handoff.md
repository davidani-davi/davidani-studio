# Handoff — 2026-09-21, Codex
Branch codex/simple-seam-release-handoff; production/main code 7d9a0c9 (PR #14).
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
- Production deployed; fresh DET62252 Simple render verified corrected mask SHA,
  unchanged protected pixels and hosted PNG SHA; visually no full-width background seam.
- Production evidence: Faire output/simple-neck-seam-fix/production.png + production.json.
- Followup: user Redo exposed remaining foreground neck/hair seam, 5-row transition.
- Vision Playful boots FRONT live catalog changed end353/blend5 to end384/blend36.
- Reviewed safe neck/hair area; face retained; generated clothing below384 unchanged.
- Fresh production corrected mask/face/PNG SHA verified. No backend code change.
- Evidence in Faire output/simple-neck-seam-followup; local install metadata synced.
- Do not revert this reference to23%/0.3%; now25%/2.34375%.
- Separate pending work: more Simple pose sets MUST use actual Davi&Dani photoshoot bases.
- Faire output/reference-sets/photoshoot-bases-20260920 has 12 unchanged originals.
- User has not answered whether to apply approved Vision/Celine identities or original models.
- No new pose sets published; synthetic plain-outfit attempt rejected by user.
