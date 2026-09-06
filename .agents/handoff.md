# Handoff — 2026-09-06 (Claude Code, 09:36)

Branch: main · last commit: 566d801 · Vercel auto-deploys on push (READY).
Backup of the pre-engine pipeline: tag `model-maker-v1-nano-banana-2026-09-05`.

## Just accomplished
- **Everything aimed at GPT now lives in the BASE prompt** (lib/multi-model-prompt.ts):
  `optimizePromptForModel("gpt-image")` strips from "Negative prompt:" on, so the multi-view
  suffix never reached GPT. `insertBeforeNegative()` is the one helper; used by `applyStyling`,
  `applyPlainBack` (b90c53c: no back photo → plain back; 48b843f: with a back photo →
  `BACK_REFERENCE_RULE`, "the SECOND uploaded image shows the BACK") and `applyOperatorNote`
  (9d5644d: the request's `note` field). route.ts composes them; the suffix no longer repeats
  the note. Tests for all three; 664 pass, tsc clean (566d801 fixed a stale expectation).
- Verified in production on the faire-management batch: 12 mirrored backs re-rendered plain
  (DET62260 needed an operator note — graphic tee with no back photo), DP62206 shot on the
  barrel plate (studio 21, `silhouette: "barrel"` in plates.json, assignPlate prefers it).
- Manifest regen: `npx vite-node scripts/build-models-manifest.mts` (`npm run models:manifest`
  is broken — vite-node not on PATH).

## Next
1. Rule of thumb: any new prompt rule for GPT goes through `insertBeforeNegative`, never only
   into `buildMultiModelViewSuffix`. Consider moving the whole view/consistency suffix ahead of
   the marker so the two paths stop diverging.
2. fal.ai prepaid balance is the render budget: 502 "User is locked. Reason: Exhausted balance"
   means top up at fal.ai/dashboard/billing; keep ≤4 concurrent renders (14 at once → 502 burst).
3. Lean brief round two (from the earlier handoff) still open.
