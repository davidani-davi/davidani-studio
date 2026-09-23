# Celine 6 and 7 — 2026-09-23

David approved both four-view candidates with “good good.” Originals and generation provenance: davidani-faire-management/output/celine-side-candidates-20260923.

- studio 112 / crop 112: Celine 6 · Cream profile; actual DTP50065A shoot, true left profile.
- studio 113 / crop 113: Celine 7 · Red turn; actual DETP40335 shoot, side body with head turned toward camera.
- Full families use the approved full-body front; crop families use the approved thigh front. Side/back crops are deterministic 768×1152 crops at (128,0), resized to 1024×1536. Full never uses a thigh crop.
- Both are manual choices, excluded from automatic rotation.
- All16 assets have individually reviewed, decoded-RGBA-hash-bound contours. Overlay and magenta composite inspection completed; no horizontal restoration.
- Native GPT2.5 Simple Wine DETP60282 front/side/back/full regression completed for both studio families. All8 protected-pixel reports were zero and hosted bytes matched. Images visually reviewed for face/neck blending and proportions. Back construction is inferred from the front-only product source. The cream side renders a straighter top hem than the product's draped front; do not treat reference approval as garment-output approval.
- Cropped mappings have synthetic composition and exact-view tests, not separate paid garment renders. 1210 tests pass; webpack production build passes.
- Runner: scripts/verify-celine-approved-sets.mts; accepts env file, product file, output directory and approved front URL. Outputs retain request/provider/raw/final/report evidence. Local evidence output/celine-reference-regression and output/celine-reference-review; compact evidence copied to Faire repository.

These references address the rejected studio111 forward-head source. Existing saved generations and listings are unchanged. Every new product still needs visual garment review.
