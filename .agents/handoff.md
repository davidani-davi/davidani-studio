# Handoff — Model Studio four reference options
Written 2026-09-09 by Codex. Branch main; previous asset commit a6af7f9.

## Accomplished
- User requested four thumbnails: two Vision and two Celine, screenshot, live tests,
  then UI/flow recommendations. Four complete sets now installed and labeled.
- studio 97 Vision 1 / studio 98 Celine 1: approved DETP58027 revision 2 unchanged.
- studio 99 Vision 2 / studio 100 Celine 2: DT60007N / DP52336 photographed originals.
  Existing front edits reused; side _10, back _12, full _2 edited once per identity.
- crop 99/100 reuse cropped images; low 99/100 use face-free original _2/_9 crops.
- Explicit registry order: Vision 1, Vision 2, Celine 1, Celine 2; original default kept.
- Updated catalog/manifest and integration expectations. 723 tests and build pass.
- Outputs/prompts/source map in faire-management output/imagegen/reference-02-dt60007n/.

## Next steps
1. Verify deployment of this commit; four live front renders through /api/model-shots.
2. Screenshot real extension panel with production catalog via browser test adapter;
   also verify standalone Setup shows four selectable cards/views. Document adapter scope.
3. Recommend UI improvements after observation; no broad redesign requested yet.

## Gotchas
- Previous reference libraries are archived under public/models/hide/.
- Original JPEGs 2000x3000; AI edits native 1024x1536, no fake upscale.
- Generate revisions from originals + identity refs, never chained edits.
- Local models:manifest lacks vite-node; use Vite ssrLoadModule on existing script.
- tsconfig.tsbuildinfo is build state; exclude from commits.
- Extension caches catalog in service worker memory; reload extension to fetch new options.
- No ERP/Faire writes. Saved-shot deletion removes Blob; re-save original before dropping.
