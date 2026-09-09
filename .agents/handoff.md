# Handoff — original garment concepts deployed
Updated 2026-09-09 by Codex. Main; prior7abf261.

## Latest approved Vision references
- Installed approved 1024x1536 Vision1/2 from Faire output/imagegen/vision-rework-20260909.
- Replaces studio/crop97/99 front files. Later Vision views use generated front
  as canvas (approved master fallback), explicit turn/framing/skin instructions.
- Side/full retain face crop; Celine untouched.741 tests + build pass.
- Start a NEW front for existing shoots: old front anchors preserve the old look.
- Deploy and verify public files; no paid garment-generation test in this change.

## Completed
- PR7 merged7abf261; original /api/design-concepts live on production alias.
- Encrypted immutable intents/stages, idempotent paid submission, persistent PNG,
  callback polls saved provider handle and ignores external payload.
- Arc Quilt jacket + Arc Barrel trouser real completed concepts, both1696×2528.
  Artifacts/evidence in Faire repo output/design-concepts/.
- Barrel job267d8bb9-d7da-4516-b7dc-8f4694c58934 completed via callback,
  confirmed directly in encrypted Blob BEFORE any client poll.
- Faire Daily2.25.0/SW57 deployed: briefs, concept UI, recovery and savedfeedback.
- Faire production Studio credential corrected; live catalog bridge200.
- Studio738 tests and production build pass; Faire72 mock/15 live browser checks.

## Next / gotchas
- Overall Faire research goal ACTIVE: buyer access, real variant capture,
  dormant winners, backups, year+ history and sales learning incomplete.
- No buyers available in in-app browser; Chrome cookie import Keychain failed,
  gstack sees Cloudflare. Pending user question asks signed-in browser/profile.
- Real states /tmp/faire-real-design.json and /tmp/faire-live-design.json DONE.
  Never resubmit these paid jobs. Existing result is already in persistent storage.
- Main pre-existing dirty tsconfig.tsbuildinfo must not be staged.
- Private pulled env files remain outside repos; never print values.
- Existing model-photo routes and approved97–100 masters preserved.
- Concepts require designer/pattern/fit sampling review, no techpack/sales claims.
