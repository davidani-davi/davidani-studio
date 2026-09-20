# Handoff — 2026-09-19 22:15 PDT, Codex
Branch codex/direct-outfit-default; base 557b969.
## Completed
- David approved direct ERP identity editing as Faire's default, Simple as fallback.
- /api/model-shots editMode=direct takes exact per-view outfitSources + Vision/Celine.
- Canonical face/profile refs; direct provider call bypasses analyzer, old compositing,
  masks, default references, restoration, resizing and generated-front anchors.
- Saved shots retain direct provenance for PNG export after reloading.
- Native PNG uploaded and verified byte-for-byte; dimensions/hash returned.
- Missing matching view fails explicitly. Legacy API paths unchanged.
- 1,030 tests across 83 files pass; production build passes.
- Actual local API generated Vision/DWT68142 front, side, back, full with GPT 2.5.
  All four returned 1024x1536 PNG; visually checked skin, hem, stripes, background.
- Evidence in Faire repo output/direct-outfit-integration (local, not deployed).
## Release / next
- Deploy backend before Faire 2.57.0 frontend; verify live catalog directIdentities.
- Faire UI selects Direct by default on new runs; preserves saved legacy choices.
- Browser tests cover identity/source persistence, fallback and missing-view guard.
- Original Studio checkout is dirty; work is isolated in this worktree.
- Tracked node_modules symlink cannot build with Turbopack outside project root:
  local npm ci folder used for checks; do not commit dependency artifacts/deletion.
- AI edits still need visual garment/identity review; no exact-pixel garment claim.
