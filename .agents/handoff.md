# Handoff — approved GPT 2.5 reference masters
Written 2026-09-09 11:51 PDT by Codex. Branch main; prior 0d98131.

## Accomplished
- David selected GPT 2.5 as clear winner of the original-photo Celine comparison
  and authorized rebuilding all four front reference choices with that recipe.
- Celine 1 (studio 98) is the exact winning PNG, reused unchanged. Vision 1/2 and
  Celine 2 (97/99/100) each generated once from original JPEG + original identity.
- Engine: openai/gpt-image-2.5/sunburst/edit, high, 2048×3072 PNG. Same approved
  prompt, with only identity/hair/outfit wording adapted; brown omits tattoo note.
- Installed all four studio front.png and identical crop front.png copies.
  Other view files unchanged. No postprocessing or generated-source edit chains.
- All outputs visually inspected; 726 tests and production build passed.
- docs/gpt25-reference-masters.json records sources, prompts and installed hashes.
- Celine 1 SHA256 f10f3e9a0ed8b61cd0adfacb1c143c11b2a20cef77ca3713e80780df2176e808.

## Next / preserved context
- Push triggers deployment. Live verification in Faire repo:
  output/imagegen/gpt25-reference-masters/live-verification.json.
- Preview four images at http://127.0.0.1:8795/ (Faire repo server session 29865).
- Refresh Model Studio after deploy; public assets are must-revalidate.
- Faire Daily 2.19.0 / extension 2.67.0 / Studio A preserved; no app release needed.
- Reference changes only: no new garment pipeline renders in this task.
- Preserve pre-existing dirty tsconfig.tsbuildinfo; do not stage it.
