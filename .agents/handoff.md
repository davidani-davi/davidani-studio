# Handoff — Model Studio shoulder ghost
Written 2026-09-14 by Codex.
Branch: codex/studio-shoulder-ghost. Base: 66ca58e; fix is this handoff's commit.

## Accomplished
- Investigated DET70088 screenshot: striped old clothing and pale shoulder halo.
- Confirmed compositor defect on saved Celine 2 / DET62209 provider output:
  previous face restoration reintroduced the original patterned blouse.
- simpleFaceMask widened feather to 48 rows BELOW the reviewed boundary.
  At Celine 2 shoulder (700,400), old mask retained 71% original pixels.
- Feather now ends at the boundary and uses reviewed transitionRows inward.
  The protected core ends transitionRows above the boundary; garment rows
  are entirely generated pixels. Face above the transition remains exact.
- Simple mode disables seamMatch: old clothing must not recolour new clothing.
  Other editing modes retain their existing seam behaviour.
- Regression tests failed before fix. Final: 993 tests / 79 files pass;
  npm run build passes. Route tests compare all released pixels byte-for-byte.
- Visual replay: docs/debug/shoulder-before-after.png (old left, fixed right).

## Next / limitations
- Patch pushed on its own branch for review; production not deployed.
- After deployment, regenerate DET70088 front through /api/model-shots,
  editMode:simple. Existing saved PNGs retain their old artifacts.
- Exact DET70088 original reference/raw generation was not available here;
  replay used a saved real Celine 2 generation, not a new DET70088 render.
- Mask boundaries still require correct review above clothing. Pixel checksum
  verifies preservation only, not garment quality or complete face coverage.
- Production catalog read returned 401 with local .env.local credentials.
- Main already includes prior photo-anchored length fixes and reference sets
  108–111 (66ca58e). Original checkout has unrelated dirty plates.json and
  next-env.d.ts; preserved. Worktree: /tmp/studio-shoulder-ghost.
