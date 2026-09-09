# Handoff — cleaner model reference skin
Written 2026-09-09 11:37 PDT by Codex. Branch main; prior 13a5631.

## Accomplished
- David sees flaky/over-textured generated skin and requested fixing references
  at the source. Four built-in imagegen skin-only edits on front reference masters:
  Vision 1/2 = studio 97/99, Celine 1/2 = studio 98/100.
- Reduced etched/stippled skin texture while retaining subtle natural detail,
  clear eyes/lips, identity, proportions, pose, outfit and lighting.
- Replaced all four studio front.png and identical crop front.png assets.
  Pink reference arms remain tattoo-free. Other view files unchanged.
- Prompts: docs/reference-skin-cleanup.json. Native files remain 1024×1536.
- All 726 tests and production build passed. Push triggers Vercel deployment;
  live verification is recorded in Faire repo output/reference-skin-cleanup/.
- No generation prompt/engine changes or new garment renders in this task;
  downstream quality improvement still needs a real garment comparison.

## Next / preserved context
- Refresh Model Studio to see the cleaned four front references.
- Studio images use max-age=0/must-revalidate; no extension release needed.
- Prior tattoo cleanup 13a5631 was verified live, all four copies matched.
- Faire app 2.19.0 / extension 2.67.0 and Studio A remain current.
- Resumable request IDs, shared listing state and saved shots preserved.
- Preserve pre-existing dirty tsconfig.tsbuildinfo; do not stage it.
