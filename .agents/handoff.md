# Handoff — Model Studio photographic finish
Updated 2026-09-09 by Codex. Main; implementation9318261.
## Current work — visual result REJECTED
- Added house-photo-brief for default GPT2.5 house97–100 Model Studio shots.
  Uses product photos for construction and model/front for photographic finish.
  Removes repeated 4K/editorial/detail prose; native2048×3072 unchanged.
- Celine1/98 later views now follow the generated front, like97/99/100;
  side/full retain head crops. References themselves were not replaced again.
- Explicit legacy engines/variants preserved. Unused analyzer corrections hidden.
- 756 Vitest tests and production build pass. Four real DET62209 Pink views
  completed through route; two controlled prompt/size experiments also complete.
- Evidence: Faire output/imagegen/softness-fix. New front/side/back/full retained.
  User rejected pipeline-front/render.jpg as worst yet; earlier visual pass withdrawn.
- Production deployed and verified: live DET60277 Celine2 front finished with
  reference-photo-v1; native2048×3072. Technical success only, quality unresolved.
- Live poncho task33869582-791f-4b43-9203-36025bca6426 DONE.
  Do not resubmit. Results: Faire output/imagegen/softness-fix/live-poncho.
- Prompt change remains deployed; no new generation or deployment in this review.
- Raw output already textured before backdrop restore; crop98 reference also textured.
- Nine new tests: Faire output/imagegen/single-pass-comparison;8 Fal +1 built-in DONE.
  Models GPT2/2.5, Nano Pro, FLUX2 Pro; original ERP photo + cropped identity only.
- Most controlled method: local-face crop edit + deterministic polygon composite.
  Preserves97.3% source pixels, all clothing exact. GPT closer identity/Nano softer.
  Hand-defined mask is proof-of-method, not production-ready. Feedback pending.
- Next: get visual assessment of composites; generalize local mask/alignment only
  after finish/identity hold up. Side/back/new poses remain unvalidated. No rollout.

## Existing work to preserve
- Approved Vision97/99 and retouched Celine2/100 reference files remain installed.
  Celine2 generator URL carries f89baab006a294cb5. Celine1 reference unchanged.
- Prior Celine2 live jobs in Faire output/imagegen/celine-2-live-test all DONE.
- PR7 original design-concepts live: encrypted immutable intents/stages,
  idempotent paid submissions, persistent PNG, callbacks recover saved handle.
- Arc Quilt/Barrel jobs DONE; /tmp/faire-real-design.json and
  /tmp/faire-live-design.json. Do not resubmit paid concepts.
- Faire research is separate; latest state is in the Faire repo handoff.
  Buyer verification/collection resumed in concurrent task; do not interfere.
- Preserve pre-existing dirty tsconfig.tsbuildinfo; never stage it.
- Private pulled env files stay outside repos; never print values.
