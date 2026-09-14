# Handoff — permanent face protection deployed and verified
Written 2026-09-14 08:05 PDT by Codex.
Branch: codex/permanent-face-verification (docs follow-up pushed to main).
Last code commit: main a11410c (PR #10), after compositor fix PR #9 / 52ced69.

## Completed
- Per-view garment boundary and hair blend controls now persist in the shared
  reference library; available in admin and generated reference-set save screen.
- Exact row values survive save/reopen. Older callers preserve existing blend
  only for the same decoded photo; replacements require fresh review.
- 1,006 tests (79 files), build, both final CI runs, and preview passed.
- Fixed an existing navigation test race by waiting for the selected editor.
- Desktop/mobile admin and reference-set save dialog visually checked.
- Production alias verified READY on dpl_FZ1VzadGa4My7H9gvM1M9cc5MXKa:
  https://davidani-studio-bydfsq7b4-davidani-davis-projects.vercel.app
- Saved Celine front through the live normal admin UI, then reloaded/reopened.
  API before/after photo records match exactly: protectedRows=748,
  transitionRows=48, 2000x2992, image hash and URL unchanged. No console errors.
- Screenshot: docs/debug/face-protection-live.png; usage docs/face-protection.md.
- DET70088 corrected front remains in shared studio + Washed Grey draft,
  previous image in history; no listing upload or new paid generation this turn.

## Next / gotchas
- No deployment work pending. User can reopen the studio/reference admin.
- Model identity-3e39d9b6-88b5-436d-abc1-322105390544;
  pose pose-3e39d9b6-88b5-436d-abc1-322105390544, front checked live.
- Face must be above green line, all clothing below amber; inspect generated
  outputs too. Pixel checksum alone does not establish visual quality.
- Original Studio checkout has unrelated dirty plates.json/next-env.d.ts.
- Production credentials /tmp/shoulder-live/.env.production (600), never commit.
- This docs-only follow-up may redeploy the same already verified code.
