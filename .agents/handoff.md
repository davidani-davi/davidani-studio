# Handoff — 2026-09-05 (Claude Code)

Branch: main · last commit: 06a5c7d (try-on segmentation fix) · Vercel auto-deploys on push.
Backup of the pre-engine pipeline: tag `model-maker-v1-nano-banana-2026-09-05` (pushed).

## Just done
- Research note `docs/MODEL_MAKER_VS_DOJI_GOOGLE.md`: our nano-banana prompt pipeline vs
  Doji (per-user twin) vs Google TryOnDiffusion / Vertex `virtual-try-on-001`; 12-row chart,
  6 hypotheses, 7-step plan. Artifact "Try-On Engines Compared" (claude.ai/code/artifact/21cc07ad…).
- `lib/tryon-engine.ts` + `engine: "tryon"` on POST /api/model-shots: plate URL as the person,
  ERP photo as the garment, FASHN v1.6 on fal (`fal-ai/fashn/tryon/v1.6`, quality mode, 864x1296,
  seed from style code + view + note, category from the style code, `segmentation_free` OFF —
  the plates are real outfits and the first run left the plate's turtleneck collar under the
  cardigan). Default engine is still nano; `modelId: "gpt-image"` runs the v1 prompt pipeline on
  GPT Image 2 (`openai/gpt-image-2/edit` on fal, 1200x1792).
- Bake-off (faire-management scratch script `ab_tryon.py`, sheets sent to David): 6 styles ×
  {tryon, nano, gpt} on the same plate. Face band changed vs the plate on DWJ62218: try-on 0.1%,
  nano 2.8%, gpt 8.6% — the try-on keeps the photograph.

## Next steps
1. David judges the sheets. If try-on wins: full-res composite (plan step 3 — mask the garment
   region, upsample, paste onto the 2000x3000 plate), then samples + vision judge (step 4).
2. Vertex AI `virtual-try-on-001` needs a GCP project + service account (GOOGLE_APPLICATION_
   CREDENTIALS on Vercel) — same contract, output at plate resolution; not started.
3. Extension 2.30.0 (faire-management) has the Engine switch (Editor / Try-on · beta) in the
   Model shots panel; needs an unpacked reload next time David is at a browser.

## Gotchas
- FAL_KEY lives only in Vercel env (not local) — try-on runs must go through the deployed API.
- kie.ai result URLs 403 a plain urllib fetch; send a browser User-Agent.
- GPT Image 2 ignores the 4K ask (quality:high → 1200x1792); nano returns 3392x5056 (~23 MB PNG).
