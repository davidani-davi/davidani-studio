# Handoff — 2026-09-05 (Claude Code)

Branch: main · last commit: see `git log -1` (GPT round-two docs) · Vercel auto-deploys on push.
Backup of the pre-engine pipeline: tag `model-maker-v1-nano-banana-2026-09-05` (pushed).

## Where it stands
- David judged the six-style bake-off (try-on vs nano-banana-2 vs GPT Image 2): **GPT Image 2
  on the v1 prompt is the benchmark.** Try-on (FASHN v1.6, `engine: "tryon"`) keeps the
  photograph but loses silhouette; nano re-dresses the plate.
- Round two (2c49384): three GPT variants behind `gptVariant` on POST /api/model-shots
  (`lib/gpt-variants.ts`): `native4k` asks 2048x3072, `lean` swaps the 1,348-word stack for a
  ~150-word brief from the garment contract, `masked` sends the plate upscaled + a repaint
  mask cut from the try-on's footprint. Results + reading in
  `docs/MODEL_MAKER_VS_DOJI_GOOGLE.md` "GPT round two"; sheets sent to David
  (faire-management scratch `ab_<STYLE>_gptsheet.jpg`).
- My read: A native size is free (same quality, deliverable size, +10 s) — keep. B lean holds,
  carries the plate's own layer (white tee), missed one neckline — worth round two with neckline
  + hem named in the brief. C masked is a dead end as an API mask (guidance, not a boundary:
  rewrote a low plate into a full figure, redrew hair/shoes) — retire; a paste-back composite
  is the only useful mask.

## Next steps (after David's verdict)
1. If A/B win: make `modelId: "gpt-image"` + `native4k` the default for model-shots, fold the
   neckline/hem/closure lines into `leanBrief` and re-run the six; then samples + vision judge.
2. Delete the `masked` branch (route + `garmentMaskFromDiff`) unless David wants the paste-back.
3. Extension (faire-management) exposes Engine = Editor / Try-on only; add a GPT switch or just
   flip the studio default — needs an unpacked reload next time David is at a browser.

## Gotchas
- FAL_KEY lives only in Vercel env — every GPT / try-on run goes through the deployed API.
- `generate()` `raw: true` triggers the portrait rewrite (neutralises the plate's face); the
  lean brief uses `verbatimPrompt` instead.
- sharp cannot compose blur/threshold on a 1-channel buffer; the mask code stays in JS.
- GPT Image 2 output ~8–10 MB PNG at 2048x3072; benchmark 1200x1792 ~3 MB.
