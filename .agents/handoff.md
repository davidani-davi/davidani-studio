# Handoff — davidani-studio

2026-09-08 16:55 · written by Claude Code · branch main · last commit d3bb4f3

## Just done
- **No-plate engine (GPT Image 2.5)** — `lib/no-plate.ts` + `lib/no-plate.test.ts`;
  `POST /api/model-shots` with `engine:"gpt25"` (+ `face` "vision"|"celine" or humanModelId
  `face:<name>`, optional `variant` flare|sunburst) skips plate/analyzer/restore and renders
  the frame from `public/models/hide/faces/<face>-face.png` + `-smile-face.png` + the garment
  photo(s) + the front anchor (last). 1024×1536, quality high. Live: front on DJ62106 in 23 s.
- Reference sets vision/celine on the three live poses installed as studio 61, 80–96 (c15dab0).

- **House reference sets (00abf88):** `engine:"gpt25", reference:true` renders the model
  herself in the house outfit (black ribbed tank, ecru trousers, tan sandals), no garment;
  front anchors side/back. Rendered vision + celine front/side/back at sunburst/max/2048×3072
  (65–77 s a view); files in faire-management data root `measurement/plates/ref25/`,
  sheets sent to David 2026-09-08 17:25. Backdrop corners r-b 18–25, all in band.

- **DIRECTION CHANGE 17:35 — David rejected the 2.5 no-plate reference sets:** "these are not good.
  just like studio 03, 05 and 19. the base model needs to be our actual models for the most
  realistic output." Rule: the base of every shot is one of OUR photographed plates. So 2.5 is
  now an EDITOR on the plate pipeline: `modelId:"gpt-image-25"` (ca8f64d, sunburst, native
  2048×3072, analyzer/anchors/restore unchanged). The gpt25 no-plate engine + `reference:true`
  stay in the code but are superseded; rejected renders in data root `plates/ref25-rejected/`.
  A bare fal 403 "Forbidden" is now retried as transient (burst refusals).

## Next
- Read the DJ62106 comparison (studio 03 plate, GPT Image 2 vs 2.5) David gets from this session;
  if 2.5 wins, make it the route default and drop the no-plate engine from the extension.
- David reviews the ref25 sheets. If kept: install as plates (candidates.json rows →
  plate_install --only → plate_crop → manifest) and/or feed them as body refs to the
  no-plate prompt (third reference image after the faces).
- David reviews the no-plate output in the extension (2.53.0) vs plates.
  2048×3072 is live (679a0e8): DJ62106 front in 28.5 s vs 23 s at 1024×1536.
- Retire rejected reference plates via `git mv public/models/<name> public/models/hide/` +
  hide/plates.json. Studio 03/05/19 tank plates: David confirmed "good" 2026-09-08 17:30 — they stay.

## Gotchas
- **fal burst limit on the studio key:** 4 (even 2) anchored 2.5 renders fired together came
  back `Forbidden` in 0 s; the same call alone, or 20 s later, succeeds. Run the no-plate
  engine ≤2 concurrent and retry Forbidden after 20 s (ref25/rerun.py pattern).
- Another session may work in this checkout: commit with explicit pathspecs only
  (`tsconfig.tsbuildinfo` is dirty and must not be committed).
- Vercel's FAL key is NOT the davistudio-batch one (that account is locked, exhausted
  balance); production renders still work.
