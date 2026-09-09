# Handoff — Model Studio four reference options
Written 2026-09-09 06:20 PDT by Codex. Branch main; deployed asset commit ac8104c.

## Accomplished
- Four complete live options: Vision 1 studio 97, Vision 2 studio 99,
  Celine 1 studio 98, Celine 2 studio 100. Stable order, original default retained.
- 97/98 retain approved DETP58027 revision 2. New 99/100 use DT60007N / DP52336.
- Existing front edits reused; side _10, back _12, full _2 edited once per identity.
  crop siblings reuse views; low siblings use face-free original _2/_9 crops.
- 723 tests and production build pass. Vercel ac8104c deploy successful.
- All 36 production reference assets returned 200 and matched local bytes.
- Four paid live front tests: same pink DET62209, GPT2.5, all pass (70–86 seconds),
  correctly resolved to crop 97/99/98/100. Outputs 2048x3072; faces visually reviewed.
- Deployed standalone cards select/load correctly. Actual extension panel code
  tested through browser adapter: four thumbnails, IDs and four-view messages correct.
- Clean screenshots, renders and report in faire-management output/model-studio-four-options/.
  Original files/prompts in output/imagegen/reference-02-dt60007n/.

## Next steps
1. User review screenshot and UI recommendations: larger 2x2 picker, front preview
   before remaining views, source/color summary, collapsed advanced settings, simpler save.
2. No broad UI redesign implemented. Option 2's white trousers more versatile for tops;
   option 1 retains pink striped shorts. Color tracking remains separate open issue.
3. Side/back/full garment generations not run this check; assets and mappings verified.

## Gotchas
- Reload installed extension if catalog is cached; service worker not browser-tested.
- No ERP/Faire uploads or saved-shot writes. Prior refs archived public/models/hide/.
- AI reference edits native 1024x1536. Original JPEGs 2000x3000. No fake upscale.
- Always edit from originals + identity refs, never chained edits.
- Local models:manifest lacks vite-node; Vite ssrLoadModule runs existing script.
- tsconfig.tsbuildinfo is unrelated build state; exclude from commits.
