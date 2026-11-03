# Handoff — 2026-11-03, Claude Code (Mac mini)

main **1a29763** = #33 merged (David: "Yes, rebase #33"), Vercel production READY. Before it: #56 (crop-full-refs), #55.

## Just done
- **#33 Simple swap at medium quality.** It was opened 2026-10-02 and never merged, while the SOP said it was live. Every
  Simple render until today was low quality at 1024 × 1536 and upscaled onto the full-size base (found while auditing Jeonga's
  DET60372 Deep Blue front on VISION 3). Rebased onto d51ce88: `resolution: "2K"` (medium) for Simple GPT; a base wider than
  1024 px renders at 2048 × 3072 (`simpleImageSize` in `lib/simple-reference-shot.ts`); the thigh-up crop (`cropped.ref`) still
  sets the size. Heal and garment-only resize the frame to the base with `fit:'fill'`, so they don't depend on frame size.
- vitest 1433/1433. No paid live render (Codex-only rule); `scripts/verify-simple-resolution.mts` is the paid check, not run.
- faire-management SOP §7 step 6 now says "live 2026-11-03" (faire-management PR #247).

## Next steps
1. Check the next real Simple render: the PNG should be 2048 × 3072 on a full-size base, and fal should log
   gpt-image-2.5 at quality medium. Renders take longer and cost more per call than before (medium vs low).
2. Carried over from #54/#55: watch `preservation.alignment`; the next longline render (Front thigh-up, Full a different pose).
3. Proposed, not approved: automatic seam check before ERP upload; draft-contour outlines that follow the jaw.

## Gotchas
- `npx tsc --noEmit` reports ~10 old errors in test files (garment-only.test.ts:54, ModelAdmin.test.tsx, ...): on main
  before #33; CI runs `npm test` + `npm run build`, which pass.
- A render made AFTER alignment no longer matches its raw frame pixel for pixel, so Heal says "already healed".
- Never copy auto outlines into presets without visual review; never restore the horizontal row cutoff (SOP §8).
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- `~/Code/davidani-studio` (main checkout) is on `codex/garment-only-pixel-lock` with uncommitted edits: leave it.
- The extension's `layerFraming` (faire-management `model_shots_core.js`) must agree with `shotPlan`/`framingFor` here.
