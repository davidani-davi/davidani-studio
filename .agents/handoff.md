# Handoff: Model Studio upgrade (2026-11-24, Claude Code Opus 5.5)

- **Branch:** `claude/model-studio-upgrade-plan`, stacked on `claude/kobra-foundation` (PR #69).
- **Earlier handoff:** the Kobra foundation one is in git history: `git show origin/claude/kobra-foundation:.agents/handoff.md`.
- **Worktree:** `/Volumes/T5/Archive/worktrees/davidani-studio-ms-plan`.

## Done (David picked "0 to 5 in order")
- **Plan:** `docs/superpowers/plans/2026-11-24-model-studio-upgrade-plan.md` (Higgsfield research plus a ranked list).
- **#0 New /model-studio page** (Kobra), running on `/api/model-shots`.
  - The old client now lives at `/model-studio-legacy`.
  - CORE is copied from the Faire extension into `lib/model-shots-core/`. Re-copy it with `scripts/sync-model-shots-core.sh`, and never edit the extension.
  - The per-style workspace is `app/api/model-studio/workspace` (Blob, 409 on a stale revision).
- **#1 Opt-in prompt roles:** `promptRules:"roles-v1"` in `lib/simple-reference-shot.ts`. It is off by default, so prompts are byte-identical.
- **#2 People:** `public/models/people.json` and `lib/people.ts` (Vision, Celine). The GET catalogue now lists `people` and gives each plate a `person`.
- **#3 Look sheet:**
  - `POST /api/model-studio/look-sheet` makes one paid render and requires `confirmSpend:true`.
  - `/api/model-shots` takes `anchorSheetUrl`, which becomes image 3 for the views after the front.
- **#4 Front takes** (1-3, cost shown) and **#5 intake card** (Catalog preset, up to 3 questions, one-line recipe): `lib/model-studio/{variants,intake}.ts`.
- **Checks:**
  - vitest: 1721 pass.
  - `npm run build`: passes.
  - tsc: only the 10 errors already in old test files.
  - Screenshots at 1440/430/440, with mocked renders.

## Next
1. **A/B done (David's OK, 35 renders, ~$4.20):** https://claude.ai/artifact/MqtoJX5NrFXbV5AtNvp8MM
   - Tallies include David's review (he overruled 2 calls).
   - roles-v1 front: 2 wins, 0 losses, 8 ties. Candidate for the default (David's call).
   - Look sheet back: 1 win (dye blotches), 0 losses, 2 ties, 1 mixed, 1 both wrong (DT70171 duster: the sheet itself drew it knee length, not mid-calf).
   - DONE (David: "Yes, do both"): roles-v1 is now the default (`promptRules:'off'` opts out); the look sheet gets the product front photo as image 2 (decides the hem) and the planned hem (hemFor) as a body position. DT70171 re-render (2 renders, ~$0.24): the new sheet is right (mid-calf duster in all 3 panels), but the back render still stops near the knee. Its plate (studio 99) crops at the knee, so the hem gets fitted into the frame. FIXED (David: "Yes, fix plate choice"): plates.json `full_length: true` on studio 110-115 (the only sets whose front/side/back reach the shoes); auto and the page's default look use them for hem 'long'. Not re-rendered yet (paid, ask first). An explicitly picked head-to-thigh set still gets no warning.
2. Once David approves the new page, retire `/model-studio-legacy` and point the Library and JobCenter links back at it.
3. Upload to ERP stays disabled until ERP-load PR #43 lands.

## Gotchas
- **Local pants plates:** `getPoseUrl` (local dev only) now includes the pants references. Before this fix, Auto on bottoms threw "Unknown model: pants-*".
- **Workspace race:** two PUTs at the same moment can both pass the revision check. It needs compare-and-swap or a lock.
- **Search has no thumbnails:** the search endpoint returns no photos, so results show none.
- **Long phone page:** on a phone the results sit below the long model list.
- **Dev server:** open it on `localhost`, not 127.0.0.1, or it never hydrates (allowedDevOrigins).
- **node_modules:** the tracked `node_modules` symlink is set to skip-worktree here. Never stage its deletion.
- **Flaky test:** one test failed once under full-suite load and passed on rerun.
