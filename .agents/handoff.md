# Handoff — davidani-studio
Written 2026-09-11 evening by Claude Code. Branch `codex/garment-only-pixel-lock`, pushed to main as ecd1d80.

## Done this session
- Face-protection seam fix (seamMatch + blend scaled to plate height) — cc142fb + ecd1d80.
- Coat lengths: `PlateFraming` gains `knee` (head-to-knee plates `knee NN`), `Hem` gains `mid`
  (knee-length/midi → knee×3 + full; long coats/maxi → full everywhere). lib/plate-framing.ts + tests.
- New reference sets installed hand-picked (auto:false), both faces:
  studio/crop 108–109 = DET62260 "Sage tee"; studio 110–111 = DETP60364 "Neutral black"
  (black ribbed tank + black trousers, all four views, for top/bottom swap sets). Presets + manifest rebuilt.
- Catalog snapshot tests updated (lib/models-registry.test.ts, app/api/model-shots/route.test.ts). 983 pass.

## How sets are made now (faire-management repo)
`thumbnail-optimizer/reference_set.py` — plan → cut → identity → [neutral] → sheet → install.
See that repo's `.agents/handoff.md` and memory `reference-set-tool.md` for the exact commands.

## Next
- David reviews studio 108–111 in the admin (Models & pose references); flip `auto` on the ones he keeps.
- No `knee NN` plate is installed yet: DETP60364 has knee cuts under refsets but they were not
  identity-rendered (`node reference_set.mjs identity --code DETP60364 --faces vision,celine --families knee`).
- Confirm the Vercel deploy for ecd1d80 is READY.
