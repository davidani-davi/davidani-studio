# Handoff — Nano Pro default approved and deployed
Updated 2026-09-10T02:48:17.268256+00:00 by Codex. Main; previous commit 47474cb.
- User approved DET67046 Pink Peach / existing Celine / Nano Pro 4-view set
  and explicitly requested it as the default.
- /api/model-shots now defaults to fal-ai/nano-banana-pro/edit, native1K,
  2:3 PNG. Front=current model front + original ERP garment. Each later view
  independently uses finished front + original model front + ERP garment.
- No analyzer, face crop, restore, sharpening, upscale or second edit pass.
  Missing front blocks continuations. Optional ERP back is respected.
- Explicit GPT2/2.5 and try-on remain; separate multi-model experiment UI unchanged.
- Production deployment dpl_FFz5kufnT53iRtPv5iDqxax8txuK ready.
- Live default request (no modelId): d9f64c78-41d2-400c-9101-580bb4cf9911 DONE.
  Verified NanoPro1K response and visually inspected soft front. Do not resubmit.
  Evidence: Faire output/imagegen/nano-default-live-check/front.png.
- Tests768 pass; production build pass. docs/NANO_REFERENCE_DEFAULT.md explains.
- Faire extension2.76.0 / Daily2.27.0 SW66 deployed with matching defaults and
  explicit GPT2.5 choice. New result metadata distinguishes historical GPT jobs.
- Next: use new default on additional styles; inspect garment details visually.
  Accepted softness is evidence for Pink Peach top, not a guarantee for every style.
- Keep existing Vision/Celine references. Celine1 master hashf10f3e9a… matches test.
- Prior face-only and GPT default softness experiments rejected; superseded.
- Arc Quilt/Barrel concept jobs DONE; /tmp/faire-real-design.json and
  /tmp/faire-live-design.json. Do not resubmit paid concepts.
- Concurrent Faire research state belongs to Faire handoff; do not overwrite it.
- Preserve pre-existing dirty tsconfig.tsbuildinfo; never stage it.
- Private pulled env files stay outside repos; never print values.
