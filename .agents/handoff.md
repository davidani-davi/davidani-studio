# Handoff — 2026-11-02, Claude Code (Mac mini)

main **0a849e1** = #55 merged, Vercel production READY (David: "Merge and deploy"). faire-management #242
(ext 2.192.0 / team add-on 1.35.0) merged + deployed (a64a6f32). #54 (face alignment + Heal) live since 4a82237.

## Just done
- **Front vs Full** (David, DCJ67197 longline cardigan: Front and Full came out the same). Front = head to mid-thigh,
  facing camera, relaxed arms; Full = head to toe in a different, styled pose (turned/walking, hand raised, shoes).
- `lib/plate-framing.ts` `LONG_HEM_RE` drops `long-?line`: a longline top frames like any top (crop); coats, dusters,
  maxis stay long. `lib/simple-reference-shot.ts` adds a LAYER LENGTH rule for long-titled tops on a crop/knee frame
  (the hem runs past the frame edge, never drawn inside it).
- `lib/user-poses.ts` `pickPose`: the Full slot skips the Front's photo (unless it is the only head-to-toe front) and
  scores styled poses (raised / hand-on-hip / away-from-body) up; the Front prefers calm arms. `lib/pose-pick.ts`
  `frontPoseFor`; the route passes `frontFraming`. Free check on real Celine DT60007N / DCT78115: different photos.
- vitest 1425/1425.

## Next steps
1. Look at the next real longline / recast-set renders: Front thigh-up with no hem drawn in frame; Full a different pose.
   Don't render to test: image generation is Codex-only (no paid fal calls).
2. From #54, still open: watch Simple renders for `preservation.alignment` (`.reason` set = alignment refused); heal
   Jeonga's 5 DT70115 renders (`listing-jobs` kind `heal-shot`) or let her press Heal.
3. Proposed, not approved: automatic seam check before ERP upload; draft-contour outlines that follow the jaw.

## Gotchas
- A render made AFTER alignment no longer matches its raw frame pixel for pixel, so Heal says "already healed".
- fal history window: renderedAt -45/+20 min, else last 14 days. Raw frames older than fal's retention cannot heal.
- Never copy auto outlines into presets without visual review; never restore the horizontal row cutoff (SOP §8).
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- `~/Code/davidani-studio` (main checkout) is on `codex/garment-only-pixel-lock` with uncommitted edits: leave it.
- The extension's `layerFraming` (faire-management `model_shots_core.js`) must agree with `shotPlan`/`framingFor` here.
