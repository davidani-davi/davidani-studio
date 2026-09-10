# Handoff — original 1K full-body restored
Updated 2026-09-10T03:14:13.126195+00:00 by Codex. Main; previous commitdd9980a.
- FINAL USER DECISION: reject the 2K full-body variant because its background
  shifted red/pink. Keep original DET67046 Pink Peach full-body; all views1K.
- /api/model-shots Nano Pro path again forces native1K2:3PNG, including requests
  from older2.76.1 clients that ask for2K. Response reports actual resolution.
- Front=current model front + original ERP garment. Each other view independently
  uses finished front + original model front + ERP garment. No extra edit pass,
  restore, sharpening or upscale. Missing front blocks continuations.
- Explicit GPT2/2.5 and try-on retained; separate multi-model editor unchanged.
-769Vitest tests and production build pass. Regression proves2K client→1K output.
- Faire extension2.76.2/Daily2.27.2/SW68 packages the matching1K behavior.
- Production rollback READY. Deploy log /tmp/celine-original-studio-deploy.log.
- Approved original full.png in Faire output/imagegen/det67046-pink-peach-nano-set
  unchanged byte-for-byte from67f3529. No new paid generation for rollback.
-2K task01a08938-9c25-7e10-b6a5-30571054724d DONE/REJECTED. Do not resubmit.
  Same-size comparison confirmed pinker background. Do not promote2K again
  without a new user decision. Docs updated with this decision.
- Live native1K front taskd9f64c78-41d2-400c-9101-580bb4cf9911 DONE.
- Current Vision/Celine references retained; Celine1 master hashf10f3e9a… matches.
- Arc Quilt/Barrel concept jobs DONE; /tmp/faire-real-design.json and
  /tmp/faire-live-design.json. Do not resubmit paid concepts.
- Concurrent research state belongs to Faire handoff; preserve it.
- Preserve pre-existing dirty tsconfig.tsbuildinfo; never stage it.
- Private pulled env files stay outside repos; never print values.
