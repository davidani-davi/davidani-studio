# Handoff — Studio redesign Phase 2: Image + Model studio on Kobra, Image studio canvas-first (2026-11-24, Claude Code)

Branch `claude/kobra-image-studio`, stacked on `claude/kobra-foundation` (PR #69). Model Studio upgrade is a separate PR #70 (also on #69).

## Done
- Image studio and Model studio wrapped in `.kobra`, ledger/stage/composer restyled with `components/ui` (Phase 2).
- Image studio is now **canvas-first** (David approved the preview https://claude.ai/artifact/QkvHBjkMT2MEEZS6EC6gh5):
  - `StudioHeader compact` = one 48px row; `components/ToolMenu.tsx` lists every page/tool as links.
  - `components/ledger/HistoryStrip.tsx` (88px thumbnail column, verdict dot, hover label, "N check" filter).
  - `StageView canvas` = intake chips instead of the rail, variants on open ground, room for the composer.
  - `components/ledger/FloatComposer.tsx` floats over the stage; Options opens upward (intake tiles, side/mode, Setup, Batch).
  - `components/ledger/SidePanel.tsx`: Details/Setup docked at >=1024px (`lib/hooks/use-media-query.ts`), drawers below.
  - Phone (<=560px): stage first, history row, composer fixed at the bottom. CSS at the end of `app/globals.css`.
- Model studio still uses RunLedger + docked Composer (not canvas-first).
- Checked: 1,602 tests, `next build`, screenshots 1280/900/440/430 incl. mid-render, options, panels, menu, empty.

## Next
- David's review of the PR; then decide whether Model studio gets the canvas-first layout too.
- Not checked: real iPhone Safari, a live render against the API, dark mode.

## Gotchas
- A `node_modules` symlink is tracked in git; never stage its deletion. Leave `tsconfig.tsbuildinfo` unstaged.
- RunLedger/Composer/PaneSplitter are still used by Model studio; don't delete them.
- Kobra tokens collide with Paper names; keep overrides inside `.kobra`. The compact header sits OUTSIDE `.kobra` so JobCenter keeps Paper styles.
