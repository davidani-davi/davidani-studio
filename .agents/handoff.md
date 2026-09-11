# Handoff — Reference Identity Studio implementation
Updated 2026-09-10 18:03 PDT by Codex. Branch codex/garment-only-pixel-lock.
Previous HEAD 6a10dcc; new implementation in this commit.
- Added /reference-identity-studio linked inside Model Studio and reference admin.
- Celine loose/half-up + Vision original identity masters; four source upload slots.
- Exact approved prompt and independent source+identity pair per angle, GPT2.5.
- Original PNGs, durable runs, safe request retry, per-view provenance/downloads,
  direct run links, reviewed face boundaries and atomic save into model picker.
- 929 tests + production build pass; real local browser upload/resume/save/phone QA.
- First production deploy5mchej51d live; final UI timeout/deep-link/save refinements
  still need final production deploy after in-flight live generation completes.
- Live test set: 3e39d9b6-88b5-436d-abc1-322105390544, DETP60100, Celine loose hair.
- Front/back/full complete and inspected; side still running at 18:03 PDT.
- Poller /tmp/poll-identity-live.cjs writes /tmp/reference-identity-live-latest.json
  and output/reference-identity/DETP60100-Celine when all finish.
- Next: inspect side; deploy final code; run /tmp/verify-identity-live-results.cjs
  (review all face lines), verify library import; host verified output ZIP.
- Then update this handoff with final deployment/download + commit/push.
- Preserve unrelated tracked tsconfig.tsbuildinfo; do not commit local QA data.
- Docs: docs/reference-identity-studio.md. Browser: scripts/test-reference-identity-studio.cjs.
