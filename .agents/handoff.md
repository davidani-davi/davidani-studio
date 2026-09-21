# Handoff — 2026-09-20, Codex
Branch codex/custom-direct-release-handoff; production code 6a9404a (PR #13 merged).
- Direct supports poseMode=reference: garment + approved identity + selected pose.
- Resolve exact angle from trusted model catalog; extend framing for full outfits.
- Front required; other garment angles optional and explicitly marked inferred.
- Approved front anchors identity/clothing, while selected reference alone controls pose.
- poseMode=source preserves exact ERP photo workflow; omitted mode remains source.
- Vision now uses supplied approved portrait + approved gentle three-quarter reference.
- Native provider PNGs still delivered byte-for-byte; no old compositing or resizing.
- 1,035 tests / 83 files pass; production webpack build passes.
- Real DETP62208 Ivory Multi: all four views from ERP front/back only, Vision Playful boots.
- Retested side/full after tightening pose instructions; relaxed arms and bent knee now follow refs.
- Evidence: Faire repo output/custom-direct-DETP62208, native PNGs + requests/responses.
- Generative fidelity still needs operator review; missing-angle details are inferred.
- Production approved identity bytes, catalog and reference-mode validation verified.
- Production async full render passed: selected pose, anchor, inferred angle and native PNG hash.
- Faire 2.58.0 / extension 2.133.0 deployed; hosted ZIP and shared asset bytes verified.
- Next: David reviews results; no rollout work pending.
- Original Studio checkout dirty; this worktree isolates changes.
