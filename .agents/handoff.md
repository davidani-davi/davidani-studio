# Handoff — permanent face protection controls
Written 2026-09-14 by Codex.
Branch: codex/permanent-face-protection; base main 36b4ba1.

## Completed
- Added per-view garment boundary + hair blend preview/sliders to reference
  admin and generated reference-set save screen.
- API validates blend size and stores it with the photo in the cloud library.
- Save/reopen preserves exact row values; older callers retain existing blend
  only when decoded image hash and dimensions match. New photos get fresh defaults.
- 1,006 tests pass (79 files), production build passes, desktop/mobile browser
  checked with real Celine reference; no console errors.
- Usage documented in docs/face-protection.md.
- Prior compositor fix already deployed in PR #9 / main 52ced69.
- DET70088 corrected front is saved in shared studio + Washed Grey draft,
  prior image retained in history; no listing upload.

## Next / gotchas
- Merge after CI, deploy, and verify live normal-admin save/reopen preserves
  Celine front protectedRows=748, transitionRows=48, dimensions=2000x2992.
- Model identity-3e39d9b6-88b5-436d-abc1-322105390544;
  pose pose-3e39d9b6-88b5-436d-abc1-322105390544, front only.
- No new paid generation needed: previous live job verified output and exact
  protected pixels; this feature changes how settings are edited/persisted.
- Original Studio checkout has unrelated dirty plates.json/next-env.d.ts.
- Production credentials /tmp/shoulder-live/.env.production (600), never commit.
