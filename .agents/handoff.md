# Handoff — davidani-studio

**Written:** 2026-09-05 by Claude Code (Mac mini)
**Branch:** main · last commit: 830ea74
**Deployed:** production by git push (Vercel) — /api/model-shots

## Just done
- **Plate wear tags.** `public/models/plates.json` carries `wears` / `low_ok` per house
  plate (23 of 27 take a bottom; studio 08, 12, 22, 23 wear skirts). `lib/plate-wear.ts`
  merges the tag onto the studio/crop/low models (registry + manifest);
  `assignPlate(code, plates, { category })` keeps pants and skirts to the `low_ok` subset;
  `/api/model-shots` GET serves `wears`, `lowOk` and per-pose `previews.{full,crop,low}`.
  Tests 631 pass, build clean. Docs: MODEL_PLATE_STANDARD.md "What the model wears".
- Earlier today: crop/low framings per category, 27 house plates, fix-note redo.

## Next steps
1. First real bottoms run (needs a browser): open a DP/DS style in the Faire extension →
   Model shots → the picker should show 23 models previewed waist-down; Auto should land on
   a trouser plate (`assigned` in the response).
2. New plates: harvest → install → plate_crop → `npx --yes vite-node
   scripts/build-models-manifest.mts`. Install now records `wears` from the harvest's
   vision read; to tag by hand run faire-management `thumbnail-optimizer/plate_wear.py`.
3. If David wants skirts to accept skirt plates too, the rule is one line in
   `plate_wear.py` LOW_OK (then `--retag`) — everything downstream reads the flag.

## Gotchas
- vite-node is not in node_modules; use `npx --yes vite-node`.
- Not mine, left untouched in the working tree: tsconfig.tsbuildinfo (modified) and three
  untracked docs (ERP_AND_ADMIN_CLI_GUIDE, ERP_AND_CLI_ACCESS_GUIDE, IMAGE_STUDIO_BUILD_GUIDE).
