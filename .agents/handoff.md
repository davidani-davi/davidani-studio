# Handoff — reference library admin
Updated 2026-09-10 by Codex. Branch codex/garment-only-pixel-lock; base bc5ce55.
- Added /admin/models: model/pose CRUD, four independent upload/replace/remove slots,
  built-in crop/low/full variants, Trash/restore, photo-specific face protection.
- Shared immutable Blob events now feed picker and generation routes; source images
  remain original. Upload ownership, decoding, dimensions, session and origin checked.
- Model picker refreshes on focus; linked from Studio + management release.
- Added docs/model-reference-admin.md and local scripts/test-model-admin.cjs.
- Verified real local browser create/4 uploads/replace/remove/reload/trash/restore,
  catalog propagation and phone scrolling/overflow; 894 tests + production build.
- Next: deploy Studio, verify cloud direct upload/admin URL, then release management
  2.110.0 / Daily2.36.0 / SW87, verify hosted ZIP, update this handoff.
- Keep pre-existing tsconfig.tsbuildinfo out of commits. Local QA data is ignored.
- Reference image-generation requests are separate: no generated masters installed.
- Existing restore tags preserved; admin deletion is reversible, never erases outputs.
