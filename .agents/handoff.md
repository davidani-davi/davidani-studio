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
   - Look sheet won 2 of 5 backs and lost none: A shortened a long duster and copied dye blotches.
   - roles-v1 front: 1 win, 1 loss, 8 ties. Keep it opt-in.
   - Next: David decides whether the look sheet becomes the default for back/side.
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
