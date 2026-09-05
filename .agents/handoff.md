# Handoff — 2026-09-05 (Claude Code)

Branch: main · last commit: a42b4df (GPT default) · Vercel auto-deploys on push.
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

- **David's verdict: GPT at native size is the default now (a42b4df).** POST /api/model-shots
  without modelId/gptVariant runs `gpt-image` + `native4k`; nano-banana, `gptVariant: "auto"`
  and `engine: "tryon"` stay reachable by name. Two corrections re-run the same day: a front
  photo for DP62140AP (auto size broke the low framing, native held it) and a zoomed neckline
  photo for DWJ62218 (every variant then drew the crew neck) — the garment photo decides more
  than the prompt; faire-management photo_pick now prefers the tightest frame with every hem.

## Next steps
1. Fold neckline / hem / closure from the garment contract into `leanBrief`, re-run the six as
   B2, and if it holds make lean the default prompt too; then samples + vision judge.
2. Delete the `masked` branch (route + `garmentMaskFromDiff`) unless David wants the paste-back.
3. Extension 2.30.1 (faire-management) relabels Editor as the GPT default; it sends no modelId so
   the studio decides — the relabel needs an unpacked reload next time David is at a browser.

## Gotchas
- FAL_KEY lives only in Vercel env — every GPT / try-on run goes through the deployed API.
- `generate()` `raw: true` triggers the portrait rewrite (neutralises the plate's face); the
  lean brief uses `verbatimPrompt` instead.
- sharp cannot compose blur/threshold on a 1-channel buffer; the mask code stays in JS.
- GPT Image 2 output ~8–10 MB PNG at 2048x3072; benchmark 1200x1792 ~3 MB.
