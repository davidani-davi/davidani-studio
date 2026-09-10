# Handoff — garment-only pixel preservation prototype
Updated 2026-09-10 by Codex. Branch codex/garment-only-pixel-lock; base a5653d9.
- BEFORE edits, pushed annotated restore/model-studio-before-garment-only-20260910
  in Studio (a5653d9) and management (43d8603). Existing production not changed.
- Added optional editMode=garment-only: exact reference lookup, reviewed polygons,
  stale-reference hash rejection, protected head review, mask_url + native size.
- Original decoded RGBA pixels outside the mask copied unchanged; inward-only
  feather; output PNG decoded/compared; hosted bytes verified before response.
- Native mode stays default; no restoration or generated-output chaining.
- Saved library preserves editMode so downstream ERP uses lossless PNG.
- npm test: 829 pass; npm run build passes. Route tests include wrong view/mask,
  missing head review, unsupported engines, changed references/hosted bytes.
- Two REAL GPT2.5 DP62206 full tests through local route, each from original103:
  1,296,169 / 1,295,661 protected pixels, zero changes. Independent Pillow head
  comparison: 257,500 pixels, zero changes in both. Outputs1024x1536.
- BOTH fail garment visual QA: donor hands at pockets, original hands retained,
  visible boundary joins and garment remnants. This is NOT production ready.
- Companion management branch has experimental selector, polygon editor,
  PNG upload/readback and tests; docs/garment-only-workflow.md plus
  output/garment-only-test holds requests/results/recoverable hosted PNG URLs.
- Next: inspect provider multi-image mask behavior/polarity/order and donor-pose
  leakage; test a garment-only source without donor body/hands. Improve masks
  around actual limbs; verify front/side/back/full before any deployment.
- Do not replace the default workflow or claim verified pixels mean a good garment.
- No library, ERP or Faire listing mutations. Preserve dirty tsconfig.tsbuildinfo.
