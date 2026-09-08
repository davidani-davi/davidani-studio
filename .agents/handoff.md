# Handoff — 2026-09-06 (Claude Code, 10:40)

Branch: main · last commit: 29f6b6c · Vercel auto-deploys on push (READY).
Backup of the pre-engine pipeline: tag `model-maker-v1-nano-banana-2026-09-05`.

## Just accomplished
- **Everything aimed at GPT now lives in the BASE prompt** (lib/multi-model-prompt.ts):
  `optimizePromptForModel("gpt-image")` strips from "Negative prompt:" on, so the multi-view
  suffix never reached GPT. `insertBeforeNegative()` is the one helper; used by `applyStyling`,
  `applyPlainBack` (b90c53c: no back photo → plain back; 48b843f: with a back photo →
  `BACK_REFERENCE_RULE`, "the SECOND uploaded image shows the BACK") and `applyOperatorNote`
  (9d5644d: the request's `note` field). route.ts composes them; the suffix no longer repeats
  the note. Tests for all three; 664 pass, tsc clean (566d801 fixed a stale expectation).
- **`applyProportions` / `PROPORTIONS_RULE`** (29f6b6c): hem, trouser and sleeve lengths come from
  the garment photo, every view. The batch had drawn 3/4 cargos full length, an ankle balloon pant
  at mid-calf and wrist fur sleeves as bracelet sleeves; with the rule plus an operator note all
  nine re-shoots came out right (tests: 16 in multi-model-prompt.test.ts).
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

## 2026-09-06 22:40 (Claude Code) — /api/square
- `app/api/square/route.ts` (7a811d0, 9d2c969 proxy exemption, 33af678): a 2:3 shot → square by
  Bria expand outpainting; body `{imageUrl, size?, subjectX?, prompt?}`; subject centre measured by
  `lib/square-subject.ts` when not given (test: square-subject.test.ts). Same X-DDTO-TOKEN gate as
  model-shots. Callers: faire-management extension 2.42.0 (`studio-square` message) and
  `faire_drafts.studio_square`. ~12 s, ~$0.04 per square on the fal balance.

## 2026-09-08 (Claude Code) — plate restore on every model-shot view (e9101b5)
- `lib/plate-restore.ts` + `lib/plate-restore-run.ts` + `lib/matte.ts`: after generate-model returns, the
  view is matted (fal `fal-ai/birefnet/v2`), the plate's own model is lifted out of the plate, the hole is
  filled from the sweep around it, the figure is shifted onto the plate's figure centre and composited
  through the matte. Response gains `rawUrl` + `restore` report; `restore: false` in the body skips it.
- Tests: lib/plate-restore.test.ts (synthetic mattes); tsc clean. Verified locally on the rejected tank
  renders (03 side/full, 10 back, 05 side). NOT yet seen on a live run — first thing to check.
- Colour flood-fill cut-outs eat pale garments on the cream sweep (ecru trousers); keep the matte.
- Next: face anchoring for side/full (head crop of the front render as an extra reference); plate-matte
  cache is per process (Map in plate-restore-run.ts) — a blob-store cache if cold starts hurt.

## 2026-09-08 (Claude Code) — face anchor on side/full (f49bab4)
- `lib/face-anchor.ts`: the front render (anchorImageUrl) is matted, the head located (crown→neck, or a
  framing-keyed share of the figure when hair hides the neck: HEAD_SHARE full 0.135 / crop 0.22), a
  1.9-head square cut and hosted on fal; the route appends it AFTER the front for side and full only
  (never back, never a waist-down front); `applyAnchor(p, hasAnchor, hasFace)` moves the front to
  "SECOND-TO-LAST" and adds FACE_RULE. Response: `faceAnchored`, `face: {applied, box, method}`;
  `faceAnchor: false` in the body opts out. Tests lib/face-anchor.test.ts; 703 tests green.
- Pilot: scratchpad pilot.py shoots front, then side/full with and without the crop on one style.
- Pilot DJ62231 / studio 03 (2026-09-08 15:16): all 5 views ok, face crop applied (share method, box 1229²
  on the crop plate). Full view with the crop is the closer likeness; side is the same either way (profile
  is plate-bound). It also showed the restore's wide-blur fill as a pale aura round the figure — fillHole
  is now a row-wise boundary blend (this commit); verified locally on the pilot's raws, not yet live.
