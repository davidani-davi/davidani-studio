# Handoff — complete reference routing
Updated 2026-09-10T17:30:28.518824+00:00 by Codex. Branch main; previous commit 8853322.
- Reference-set Model Shots now resolve exact view before one independent edit.
- GPT2.5 default; explicit GPT2/Nano selections respected; conflicting fields rejected.
- Removed analyzer, generated-front continuity canvas, face crops, masks and restoration
  from this path. Native provider URL returned, irrespective of stale restore flags.
- DONUTS103 now has native side/back PNGs, each independently generated from original
  ERP front. Originals retained. docs/donuts-view-reference-provenance.json has hashes.
  Back construction is synthesized pose information, not verified garment photography.
- All7sets expose per-view/per-framing coverage. Missing low/crop view uses SAME VIEW
  in parent with explicit framing; missing view fails before generation. No front fallback.
- Pants: front/side/back waist-to-shoes; full head-to-shoes with reference top preserved.
- DONUTS only for bottoms. Try-on refuses references needing reframing.
-813tests and production build pass. Live DP62206 GPT2.5 set visually inspected:
  correct4frames, no collage, ivorytee kept, native2048x3072; back clearly inferred.
- Management2.95.0 shows matching reference previews and migrates old3view sets.
- Next: user reviews native test set at Faire Daily tokened reference-routing-fix page.
  If precise back print/construction is needed, supply actual matching ERP back photo.
- No ERP/Faire image upload or listing change from tests. No output postediting.
- Preserve pre-existing dirty tsconfig.tsbuildinfo; not staged.
