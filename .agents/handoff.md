# Handoff — 2026-10-31 ~18:05 PT, Claude Code (Mac mini)

Branch `claude/recast-poses` off origin/main a6cf7c9 (#49). PR #50 open, NOT merged (production deploys
from main: merging needs David's OK). Paired with faire-management #228 (`chloe_recast/upload.mjs`).

## Just done
- Chloe recast reference sets (faire-management design 2026-10-30 §6, §8): a set holds tagged poses
  (`UserModel.poses`, lib/user-poses.ts), each with a `recast-mask-v1` outline bound to its photo.
- JSON `POST /api/user-models {name, poses[]}` (lib/pose-upload.ts): photos as fal/Blob URLs, outline kept
  only on a size + decoded-RGBA sha256 match; any other sent outline fails the pose (never an auto one).
- `/api/model-shots` picks the pose when no `poseId` / `<id>-pose` is sent (lib/pose-pick.ts): best fit
  (never-pick table), then least recently used; same pose for every colour of a style (lib/pose-usage.ts,
  Blob `pose-usage/`). Answers `poseId`, `poseReason`, `pose`; face protection order reviewed preset →
  recast contour → draft outline → refuse (`faceProtection: recast-mask-contour-v1`).
- `GET /api/user-models/{id}/poses?view=`, `PATCH .../poses/{poseId} {removed}`.
- vitest 1359/1359; tsc only the 10 old errors; `next build --webpack` ok. Local end to end: DD70049
  uploaded (12/12 poses per face), DJ67178 rendered on Vision + Celine, front-06, 0 protected pixels changed.

## Next steps
1. David's OK → merge #50; then upload the pilot to production (`node upload.mjs $R pilot.json --check`,
   then without `--check`; README "Upload to Model Studio" in faire-management) and render one view per face.
2. Follow-up PR: client buttons (Other pose, pose list, remove) in the extension / Studio UI.

## Gotchas
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- Local `next dev` without `BLOB_READ_WRITE_TOKEN` stores sets under `.data/` + `public/user-assets/`;
  route.test.ts lists every local set, so delete those after a local test or 3 tests fail.
- Production token for upload.mjs: `MODEL_SHOTS_TOKEN`, else marketing-agent `DAVIDANI_STUDIO_PASSWORD`
  (unverified against production).
