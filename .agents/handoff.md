# Handoff — davidani-studio

2026-09-08 16:55 · written by Claude Code · branch main · last commit d3bb4f3

## Just done
- **No-plate engine (GPT Image 2.5)** — `lib/no-plate.ts` + `lib/no-plate.test.ts`;
  `POST /api/model-shots` with `engine:"gpt25"` (+ `face` "vision"|"celine" or humanModelId
  `face:<name>`, optional `variant` flare|sunburst) skips plate/analyzer/restore and renders
  the frame from `public/models/hide/faces/<face>-face.png` + `-smile-face.png` + the garment
  photo(s) + the front anchor (last). 1024×1536, quality high. Live: front on DJ62106 in 23 s.
- Reference sets vision/celine on the three live poses installed as studio 61, 80–96 (c15dab0).

## Next
- David reviews the no-plate output in the extension (2.53.0) vs plates; if kept, try
  2048×3072 (`NO_PLATE_SIZE`) — unverified on 2.5.
- Retire rejected reference plates via `git mv public/models/<name> public/models/hide/` +
  hide/plates.json; decide whether studio 03/05/19 stay in the auto pool.

## Gotchas
- Another session may work in this checkout: commit with explicit pathspecs only
  (`tsconfig.tsbuildinfo` is dirty and must not be committed).
- Vercel's FAL key is NOT the davistudio-batch one (that account is locked, exhausted
  balance); production renders still work.
