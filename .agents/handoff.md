# Handoff — 2026-09-21, Codex
Branch codex/celine3-full-rebuild; based main dc89035.
- Rebuilt Celine3 full reference after user rejected original head proportions.
- Built-in imagegen edited actual ERP full-body photo using approved Celine3 front identity.
- Saved candidate in Faire output/celine3-full-rebuild/reference.png.
- Live GPT2.5 Simple test with actual DET62252 Blue, new candidate + reviewed candidate contour.
- Full test visually reviewed: more upright head, wrist sleeves, pink stitching,0 changed protected pixels.
- Raw/final/prompt/contour/report in Faire output/celine3-full-rebuild.
- Candidate NOT installed in live library yet; user is final visual judge for new face/reference.
- After acceptance: replace only public/models/studio102/full.png (actual path contains space),
  update exact hash/contour in simple-contour-presets.json; inspect aliases and rerun tests/build.
- Do not change accepted front/side/back. Preserve source-bound validation and contour workflow.
- Production remains sleeve fix PR18/main dc89035, no pending code bugfix deployment.
- scripts/verify-celine-rebuild.mts reproduces candidate test with product/out args and env FAL_KEY.
