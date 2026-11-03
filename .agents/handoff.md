# Handoff — 2026-11-03, Claude Code (Mac mini)

Branch `claude/closure-rule` → PR "FRONT CLOSURE rule". Before it on main: #59 (borrow colourway), #60 (fresh records),
#58 (face checks), #33 (Simple at medium quality, 2048 × 3072 on full-size bases).

## Just done
- **FRONT CLOSURE rule** in `lib/simple-reference-shot.ts` (tops, dresses, sets; every view but back; never bottoms).
  DT70144 Pink (snap shacket photographed closed, on the open-jacket reference Vision DJ78149, Pose only) came back worn open
  with ~20 silver snaps on BOTH front edges at uneven heights, against 9 evenly spaced pearl snaps on one edge. The prompt
  only said "visible button count" inside the knit sentence. Now: copy kind, count, spacing, size, colour and finish from
  image 2; caps in one column on one edge; worn open, the other edge is a plain placket with flat sockets/buttonholes.
  A finish named in the title/description ("pearl snap", "tortoiseshell button") is stated. Phrased positively (naming the
  wrong layout tends to draw it).
- Evidence (free Codex, GPT Image 2, same reference + garment, jacket forced open by note): old prompt reproduced the bug
  (snaps on both edges, doubled); new prompt gave one even column of pearl snaps and a plain opposite edge. Without the
  note Codex kept the jacket closed with either prompt, so it did not reproduce the open case on its own.
- vitest 1516/1516 (24 `simple-borrowed-photo` snapshots updated: the only change is the added rule); `next build --webpack` passes.

## Next steps
1. Live check (paid, part of normal work): Redo front on DT70144 Pink in Model Studio and review the placket, then
   Generate remaining. Not yet done on fal GPT Image 2.5.
2. Carried over: watch `preservation.alignment`; automatic seam check before ERP upload and jaw-following draft
   outlines are proposed, not approved.

## Gotchas
- Any prompt wording change trips the `simple-borrowed-photo` snapshots: check the diff is only your text, then `-u`.
- `npx tsc --noEmit` reports ~10 old errors in test files; CI runs `npm test` + `npm run build`, which pass.
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- `~/Code/davidani-studio` (main checkout) is on `codex/garment-only-pixel-lock` with uncommitted edits: leave it.
- Never copy auto outlines into presets without visual review; never restore the horizontal row cutoff (SOP §8).
- The extension's `layerFraming` (faire-management `model_shots_core.js`) must agree with `shotPlan`/`framingFor` here.
