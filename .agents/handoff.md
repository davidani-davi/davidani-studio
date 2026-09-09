# Handoff — Vision 1 / Celine 1 tattoo removal
Written 2026-09-09 11:24 PDT by Codex. Branch main; prior eed4e59.

## Accomplished
- David requested removing the small “22” arm tattoo from the two pink striped
  front reference images shown in Model Studio (Vision 1 and Celine 1).
- Two built-in imagegen localized edits, visually inspected: tattoo removed;
  identity, pose, garment and framing retained. Native PNGs are 1024×1536.
- Replaced public/models/studio 97/front.png and studio 98/front.png,
  plus identical crop 97/98 front files used by top-garment generation.
- Other views and Vision 2/Celine 2 assets unchanged.
- Exact prompts and method: docs/reference-tattoo-removal.json.
- All 726 tests and production build passed. Git push triggers deployment;
  verify four live assets match the local SHA256 before calling this live.

## Next / preserved context
- Reload Model Studio after deployment. Assets use max-age=0/must-revalidate.
- Four options: Vision 1/2 = studio 97/99; Celine 1/2 = studio 98/100.
- Resumable generation/request IDs, shared listing work and Studio A preserved.
- Faire repo remains app 2.19.0 / extension 2.67.0; no extension update needed.
- Preserve pre-existing dirty tsconfig.tsbuildinfo; do not stage it.
- Prior real generation / device-sync evidence lives in Faire repo output/listing-sync.
