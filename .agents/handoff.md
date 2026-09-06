# Handoff — 2026-09-06 (Claude Code, 08:26)

Branch: main · last commit: b90c53c · Vercel auto-deploys on push (READY).
Backup of the pre-engine pipeline: tag `model-maker-v1-nano-banana-2026-09-05`.

## Just accomplished
- **Plain back rule** (`PLAIN_BACK_RULE`, `applyPlainBack` in lib/multi-model-prompt.ts): with
  no back photo the back is plain — same fabric/colour/construction, all-over patterns
  continue, placement graphics/plackets/chest pockets stay on the front. It MUST be inserted
  into the base prompt ahead of "Negative prompt:" (like applyStyling): the first attempt
  (a723dd5, suffix only) changed nothing — GPT never sees the suffix. b90c53c fixed it;
  verified on DWT60401 (fawn intarsia front, plain dotted back).
- **Silhouette plates**: plates.json `silhouette` tag (studio 21 = DP67305 = barrel),
  `silhouetteOf(title)` / `silhouettePlates`, assignPlate prefers a matching plate for
  bottoms. Manifest regenerated (`npx vite-node scripts/build-models-manifest.mts`;
  `npm run models:manifest` is broken — vite-node not on PATH).
- 660 tests + new ones pass; tsc clean.

## Blocked
- **fal.ai balance exhausted (08:19)**: /api/model-shots returns 502 with
  "User is locked. Reason: Exhausted balance". David tops up at fal.ai/dashboard/billing.
  The faire-management re-shoot (11 backs + DP62206 on the barrel plate) waits on it.

## Next
1. After top-up: DP62206 render should log plate low/studio 21 — confirm.
2. Rule of thumb for any future prompt rule aimed at GPT: put it in the base prompt
   (insertBeforeNegative), never only in a multi-view suffix. Consider moving the whole
   view/consistency suffix ahead of the marker.
3. Lean brief round two (from the previous handoff) still open.
