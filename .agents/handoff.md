# Handoff — davidani-studio

**Written:** 2026-09-02 by Claude Code
**Branch:** image-studio/flat-lay-consistency (main fast-forwarded to it)
**Last commit:** 759f872 fix(image-studio): sweep stranded painting cards and add a New button
**Deployed:** production, davidani-studio.vercel.app (Vercel dpl_6JzAs14rASrjNhMDWbxX3ZATK6CQ, READY)

## Just done
- Image Studio: a run card restored from localStorage with `pending` set
  painted forever (42h seen). Added `isStrandedRun` / `dropStrandedRuns`
  in lib/run-pipeline.ts (3x expected, 10 min floor), applied on mount,
  history refresh, and window focus in app/page.tsx.
- Generate fetch now aborts at 330s (route maxDuration is 300).
- "New" button in the Run ledger header (RunLedger `onNewRun`) empties the
  composer and drops any pending card by hand.
- Tests: 36 files / 555 pass; tsc clean.

## Next steps
- David to confirm the stuck #f24a card is gone on next load and that
  "New" feels right in the header (could move into the composer instead).
- HANDOFF.md at repo root is a stale May 2026 Model Studio note; delete or
  fold into this file when convenient.

## Gotchas
- Deploys are git push only. Production tracks `main`; the feature branch
  is the working line and main is fast-forwarded to it.
