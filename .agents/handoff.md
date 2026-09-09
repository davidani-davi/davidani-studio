# Handoff — resumable cross-device Model Studio requests
Written 2026-09-09 by Codex. Branch main; prior 54ece9f (assets ac8104c).

## Accomplished
- Model Shots accepts requestId for async requests. Exclusive Blob/file claim
  schedules each ID once; identical retries return its task; changed inputs 409.
- Shot tasks retain request fingerprint. Production refuses local /tmp claims
  when persistent Blob storage is missing. Explicit fixed Blob filenames.
- 726 tests pass; npm run build passes. No paid generation or ERP/Faire writes.
- This commit will be pushed; verify production deployment before integrating.

## Active work (Faire management repo)
- User /goal: shared unlisted POs, Model Studio and drafting across extension,
  Faire Daily web, iPhone/iPad PWA. Root agent continues there.
- New encrypted conditional-write workspace API, revision-aware client and
  durable generation intents in ~/Services/davidani-faire-management.
- New mobile Listings workbench is in progress, not yet ready/deployed.
- Next: connect shared Studio controls, server adapters and draft jobs; verify
  request recovery live without rendering (invalid garment request), then one
  controlled end-to-end render, plus cross-device browser tests and deployment.

## Existing references / gotchas
- Live options Vision 1/2 = studio 97/99; Celine 1/2 = studio 98/100.
- 36 assets previously byte-verified; four GPT2.5 front tests passed.
- Original reference PNGs 1024x1536; generated garment outputs 2048x3072.
- Main repo output/model-studio-four-options and output/model-studio-colorway-input.
- Extension 2.61.0 already has colorways, Front/Back source slots, preview first.
- Do not commit pre-existing dirty tsconfig.tsbuildinfo.
