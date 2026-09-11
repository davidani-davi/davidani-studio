# Handoff — shared pants references
Updated 2026-09-10 by Codex. Branch codex/garment-only-pixel-lock; base39058d8.
- Pants now use one shared nine-option collection, no Celine/Vision groups.
- Order: DP52083 Donuts, DP62024, DP67305, DP60245, DP62024A,
  DP43109, DP69017, DP67040, DP60197B.
- Front/side/back only: picker, batch generation, output slots, API guard.
- 24 original ERP JPGs stored in public/pants-references; SHA/source map in
  lib/pants-references.json. DP67040 front uses ERP index14, back10, side20.
- Existing Donuts front/side/back bytes and IDs preserved; retired full not offered.
- Donuts side/back retain their earlier inferred-construction provenance.
- Generation prompts unchanged; no face or identity edit added to pants.
- 933 tests and production build passed. Live read-only Studio browser checked.
- Canonical Daily/Chrome changes live in management release branch separately.
- docs/pants-references.md explains sources and behavior.
- scripts/test-pants-studio.cjs checks live picker without paid generation.
- Next: verify final deploy all24 hashes; user tries garment swaps with the new grid.
- Preserve unrelated tracked tsconfig.tsbuildinfo. No new AI generations purchased.
