# Handoff — 2026-09-21, Codex
Branch codex/simple-native-no-head-paste; base/main5cdaff1; draft changes in this commit.
- User still sees neck joins in all views; side353/5 and back392/5 confirmed on PNGs.
- Previous background fix and front-only boundary update did not solve overall issue.
- Prepared Simple-native route: approved pose + garment inputs, no head compositing.
- Keeps existing Simple prompts, engine/size, anchor, exact-reference framing guard.
- Separate garment-only/face-locked modes unchanged; Simple has no preservation report.
- Four-view route tests assert provider URL, no reupload, no pixel-preservation claim.
- All1,036 tests/83files and webpack production build pass.
- Four real GPT2.5 DET62252 Black tests: Faire output/simple-native-all-views.
- No horizontal join seen in visual review; face IS subtly re-rendered.
- Await David's visual judgment on likeness before switching live default.
- Draft only: do not merge/deploy as an automatic continuation.
- On acceptance: merge draft, apply Faire evidence ui-copy.patch, release extension copy,
  verify production native output all4 views and absent preservation badge.
- Existing production still uses compositing and can show seams; do not claim fixed.
- Pending more pose sets MUST use actual Davi&Dani photoshoot bases.
- Faire output/reference-sets/photoshoot-bases-20260920 holds12unchanged originals.
- Identity choice pending: approved Vision/Celine or original photographed models.
