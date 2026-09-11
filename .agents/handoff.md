# Handoff — Reference Identity Studio live and tested
Updated 2026-09-10 18:13 PDT by Codex. Branch codex/garment-only-pixel-lock.
Implementation 5810c72 pushed to branch + main; final evidence in this commit.
- Live: https://davidani-studio.vercel.app/reference-identity-studio
- Deployment hk70mbbda. Linked inside Model Studio and reference admin.
- Celine loose/half-up + Vision original masters; four source upload slots.
- Same approved prompt, independent original-view + identity pairs, GPT2.5.
- Original PNGs, durable runs, safe submission retries, per-view provenance,
  downloads, direct run links and atomic reviewed save into model picker.
- 929 tests + build passed. Local browser mocked-provider QA also passed.
- REAL live UI test: all four DETP60100 sources → Celine loose hair, then
  reload/resume, four results/input pairs, PNG download, save, picker + phone QA.
- Saved model: Celine · DETP60100 mint stripe.
- Run/model suffix: 3e39d9b6-88b5-436d-abc1-322105390544 (model prefix identity-).
- All four PNGs 2000x2992; SHA256 matches unchanged provider output bytes.
- Side took ~12 minutes; original job completed, no duplicate paid submission.
- Verified ZIP: https://cdr9xgexrrfthz5f.public.blob.vercel-storage.com/downloads/DETP60100-Celine-reference-set-LyrhNFhfxmAQY43X9Hg0DlESwcCrV6.zip
- ZIP SHA256 f631a6c6da4262b672ba6d54e5da410bb171db853469c898d3e0f79f1bea1439
- Next: David reviews results/tries his own sources; no setup required.
- Details: docs/reference-identity-studio.md; scripts/test-reference-identity-studio.cjs.
- Preserve unrelated tracked tsconfig.tsbuildinfo. Local generated output is ignored.
