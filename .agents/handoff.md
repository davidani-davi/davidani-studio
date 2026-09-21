# Handoff — 2026-09-21 13:20 PDT, Codex
Branch codex/set-pants-length; base dc89035; implementation in this commit.
- Simple set swap explicitly replaces BOTH top and bottoms; source product controls trouser length.
- Shorts references cannot dictate hems/exposed legs; cropped long pants continue outside frame.
- Applies across front/side/back/full; genuine shorts/cropped pants remain source-driven.
- Live DTP68208 Blue ERP flatlay + Celine1 studio98: all4 visually reviewed, long pants retained.
- Full includes real pant hems/braided trim; protected pixel changes0 in all4.
- Evidence Faire repo output/set-length-fix; reproduce scripts/verify-simple-set-length.mts.
- npm test:1157 passed/84files; production webpack build passed.
- NEXT: merge PR, verify production Ready; then redo front before remaining views.
- No mask/compositor changes; keep reviewed source-bound contour workflow.
- Celine3 full rebuild candidate was REJECTED; do NOT publish it. Find a different actual shoot
  with naturally upright head for that separate pending task. Earlier front/side/back accepted.
