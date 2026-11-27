# Handoff: canvas-first Model Studio (2026-11-27, Claude Code)

- **Branch:** `claude/project-thread-ok1v6c`, on `main` after #71 merged. David approved it ("Yes, after #71 merges"); proposal page: https://claude.ai/artifact/1ukk2h2A4WrGUnxoX3kRuW
- **Earlier handoff (#71 on main)** follows below.

## Done
- `/model-studio` (#70's page, `components/model-studio/*`) is now canvas-first. Layout only: state, polling, workspace saving and paid renders are unchanged.
  - Compact header (`StudioHeader compact`) with a **Setup** toggle.
  - Stage: style title, intake questions (only while one is open; "Pick in Setup" opens Setup), takes, the 4 view cards, look sheet.
  - `RunBar` is now the floating bar: Front/Back photo thumbs, the recipe line (`data-testid="recipe"`), run summary, Generate, Download / Save set / Load saved / ERP (still disabled), "Setup saved".
  - Setup = StylePanel + ModelPicker + RenderSettings. Docked 440px panel at >=1024px (open by default, closable); `StudioDrawer` below 1024px. With no style open, the style search sits on the stage.
  - Phone (<=480px): page scrolls, run bar fixed to the bottom, views 2 across.
  - CSS: "Model Studio, canvas-first" block at the end of `app/globals.css` (`.ms-canvas`, `.ms-bar`, `.ms-panel`).
- Tests: `ModelStudio.test.tsx` stubs matchMedia by width (`stubWidth`), 3 new layout tests. vitest 1740 pass; the same 2 pre-existing failures as main (ModelAdmin download, mini-worker sqlite3). `next build` passes.
- Screenshots (mocked APIs, house plates standing in for renders, no paid renders): `docs/screenshots/model-studio-canvas/`.

## Next
- Open PR #73 (Send to menu, branch `claude/project-thread-bnasxx`) also edits `RunBar.tsx` and `ModelStudio.tsx`; whichever merges second resolves. On the canvas, put `sendTo` in `.ms-bar__keep` before Download.
- New reference sets (David, 2026-11-27): improved sets live on his Mac mini (`~/Library/Archive/model-studio-reference-sets-2026-11-27/`, e.g. vision6). vision6 is internal-only (Chloe-shoot bodies, swapped face). Upload NOTHING until David clears a specific set; then he drops the 4 views + README into the project, and they go in through the Model library upload (`/api/user-models`) plus an id in `lib/house-user-sets.json`. View mapping 3/4->side, arm-out->full is a guess to confirm.
- Not checked: real iPhone Safari, a live render, dark mode.

## Gotchas
- The old ledger Model studio (`components/ModelStudioClient.tsx`, RunLedger/ModelComposer) is `/model-studio-legacy`; don't confuse it with this page.
- Workspace drafts are keyed by the UPPERCASE colour (`colorKey`) when seeding mocks.

---

# Handoff: canvas-first Image studio (PR #71) on main (2026-11-27, Claude Code)

- **Branch:** `claude/kobra-image-studio`, PR #71, now based on `main` (#69 and #70 are merged).
- **Earlier handoffs:** the Model Studio upgrade one follows below; the original #71 handoff is in git history: `git show a4beab6:.agents/handoff.md`.

## Done this session
- Retargeted #71 from `claude/kobra-foundation` to `main` and merged `main` in (only `.agents/handoff.md` conflicted).
- Phone breakpoint of the canvas layout moved from 560px to the project's 480px (`app/globals.css` phone block, `max-[480px]` in `components/ledger/FloatComposer.tsx`).
- Checks: vitest 1737 pass; 2 failures are pre-existing and fail on `main` too (`app/admin/models/ModelAdmin.test.tsx` download test, and `mini-worker/wording/evidence.test.mjs` needs the `sqlite3` binary). `next build` passes.
- Screenshots 1280/900/440/430 (finished run, empty, Options open, mid-render with the beUI animation), mocked APIs, no renders: `/mnt/project-files/image-studio-shots/` in the project.

## What the merge means
- #71's Kobra restyle of the old Model studio (`components/ModelStudioClient.tsx`) now shows at `/model-studio-legacy`; `/model-studio` is #70's new page.

## Next
1. David reviews and merges #71.
2. Next screens in order of daily use. Ask David before making Model studio canvas-first.
3. Still not checked: real iPhone Safari, a live render, dark mode.

## Gotchas (Image studio)
- RunLedger/Composer/PaneSplitter are still used by the legacy Model studio; don't delete them.
- Kobra tokens collide with Paper names; keep overrides inside `.kobra`. The compact header sits outside `.kobra` so JobCenter keeps Paper styles.
- Screenshot recipe: `next start` with a throwaway AUTH_SECRET, sign a session cookie with it, seed `davidani_history_v1` in localStorage, route `/api/**` in Playwright (`/api/upload/direct` 500 so it falls back to `/api/upload`; leave `/api/generate` pending for the mid-render state).

---

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
   - DONE (David: "Yes, do both"): roles-v1 is now the default (`promptRules:'off'` opts out); the look sheet gets the product front photo as image 2 (decides the hem) and the planned hem (hemFor) as a body position. DT70171 re-render (2 renders, ~$0.24): the new sheet is right (mid-calf duster in all 3 panels), but the back render still stops near the knee. Its plate (studio 99) crops at the knee, so the hem gets fitted into the frame. FIXED (David: "Yes, fix plate choice"): plates.json `full_length: true` on studio 110-115 (the only sets whose front/side/back reach the shoes); auto and the page's default look use them for hem 'long'. Re-rendered (David: "Yes, re-render", 3 renders ~$0.36): auto picked studio 111; front, sheet and back all reach below the knee, close to the product's mid-calf (old studio 99 back stopped at the hip). An explicitly picked head-to-thigh set still gets no warning.
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

## 2026-11-25 (Claude Code): Auto uses Jeonga's sets
- d449186: long-hem warning in the model picker ("Use a full-length set").
- David found the 7 library poses boring. Codex head+hair recasts of new real-shoot poses (scratchpad trial) looked "a little off" to him; dropped.
- David: "Use her sets as-is". `lib/house-user-sets.json` adds Jeonga's latest VISION 1-3,5,6 and CELINE 1-7 (12 saved Studio sets) to the Auto house pool (`housePlates`). Their outlines are her draft outlines (auto-draft-v1), not reviewed contours; face check still runs.
- Effect: Auto re-hashes over 27 sets, so styles already shot on Auto can land on a different model next time.
- Next: after merge, check the first Auto renders on her sets for "Face needs a look"; long hems still use only the full-length studio 110-115 sets.
