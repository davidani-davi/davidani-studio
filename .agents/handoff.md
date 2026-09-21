# Handoff — 2026-09-21, Codex
Branch codex/simple-sleeve-fidelity; fixc959243; PR18 mergedmain dc89035.
- Production dpl_4nsHsGdhErhxjaGVWkTFoM7xfnRK verified Ready.
- Fixed Simple sleeve drift on Celine3 / DET62252 Blue.
- Explicit sleeve/cuff/skin-coverage instructions apply even without a listing title.
- Long sleeves reach wrists; short/sleeveless preserved when source shows those.
- Found/fixed GPT transport mismatch: prompt described image3 front anchor but payload omitted it.
- simpleReferenceShot now forwards same ordered references to GPT and Nano.
- Actual input live test: front/side/back generated with GPT2.5 + same contour composition.
- All3 visually reviewed: wrist cuffs, pink neckline stitching,0 changed protected pixels.
- Raw + final + request/report evidence: Faire repo output/simple-sleeve-fix.
- Reproduce: scripts/verify-simple-sleeves.mts PRODUCT OUTPUT (FAL_KEY via env/.env.local).
- npm test1152/84files passed; production webpack build passed.
- NEXT: user Redo front first if its sleeves are pushed up,
  followed by side/back. No extension update needed.
- Face masks/compositing unchanged; never restore horizontal row fallback/native-face PR15.
