# Handoff — 2026-09-24, Claude Code
Branch claude/open-front-underlayer (from main 21c5a3e line), PR open, NOT merged/deployed.
- Simple garment swap: open-front tops/outerwear (cardigan, kimono, duster, shrug, bolero, open-front, blazer, jacket, shacket, coat, overshirt, vest) get an INNER LAYER instruction. Always-open garments state a plain white fitted tank as fact (early in the prompt); jackets keep "if worn open". A note naming the layer (tank, cami, bare chest, no top…) overrides it.
- Why: DWJ50270 (Jeonga, Celine) came back as an open cardigan over a bare chest; its ERP product photo is bare too, so "copy image 2" could not decide it.
- Live check, GPT 2.5 1K, Celine 3 crop 102 front, scripts/verify-open-front.mts: DWJ50270 v1 (conditional wording) still bare → strengthened; v2 white tank, cardigan intact, protected pixels 0. DJ69018 shacket (closed, short sleeve) no inner layer / no undersleeves, protected pixels 0.
- Not yet rendered: side/back/full, other open-front styles, Nano path. vitest 1217/1217; tsc has the same 10 pre-existing errors as main.
- NEXT: David approves → merge to main (production deploys from main) → Jeonga regenerates DWJ50270 front, then later views. Old outputs are not repaired.
- Shared guide: davidani-faire-management docs/simple-garment-swap.md §6 updated in the matching Faire PR.
