# Handoff — working DONUTS face lock
Updated 2026-09-10 by Codex. Branch codex/garment-only-pixel-lock; prior8416ac0.
- User needed a usable result urgently. Shipped optional face-locked mode for
  DONUTS103 pants FULL only. Preset validates exact reference hash/dimensions;
  original rows0–520 retained; inward32px transition, coherent body below.
- This guarantees original face/hair pixels, not unchanged hands/shoes/body.
  Other categories/references fail before spending. Waist-down client views
  continue normal independent generation; no head is present in those views.
- Provider mask now RGB white-edit/black-protect like existing fal integration.
  Shortened local-edit prompt. No generated-output chains or AI restoration.
- Three fresh tests (RGB/custom, no-provider-mask/custom, final face-locked API)
  produced coherent single-person pants renders; original failed joins removed
  by protecting upper reference as one region instead of carving each hand.
- Final DP62206 route output1024x1536:533,504 protected pixels, zero changed.
  All original head/hair retained; generated lower body can vary (e.g. footwear).
- 832tests pass; npm run build passes. Saved route retains face-locked metadata.
- Production deployment h218vuqd9 is Ready with davidani-studio.vercel.app alias.
  CLI said Not authorized after build, but inspect proved successful deployment;
  production reference API and saved PNG library readback verified.
- Saved final DP62206 full shot mtw1c72vmd44ip, byte-identical PNG, no ERP/Faire
  listing mutation. Evidence in management output/garment-only-working.
- Management release2.108.0 / PWA2.34.0 / SW83 from /tmp/davidani-face-lock-release.
- Next: extend automatic face protection only after reviewing masks for each
  other reference. Keep original workflow selectable; do not claim body lock.
- Restore tag remains pushed: restore/model-studio-before-garment-only-20260910.
- Preserve unrelated tsconfig.tsbuildinfo. Local test server3117 may be stopped.
