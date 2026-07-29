# User-Uploaded Reference Images & Models — Design

**Date:** 2026-07-02
**Status:** Approved approach (A), spec for implementation planning

## Goal

Let users upload their own images in both studios and save them for the whole team:

1. **Image Studio** — save an uploaded custom product-shot reference as a named preset that appears in the PRODUCT SHOT PRESETS grid for everyone, permanently.
2. **Model Studio** — add a new human model (name + pose photos) that appears in the model picker for everyone, permanently.

Today, Image Studio's custom reference upload is one-off (lost on refresh, never shown in the grid), and Model Studio's models are hardcoded folders under `public/models/` — read-only on Vercel, so users cannot add models at all.

## Decisions (from brainstorming)

- **Persistence:** Vercel Blob, shared across the whole team, permanent. Matches existing `lib/style-library.ts` / history patterns. (localStorage and git-commit approaches were rejected.)
- **Model uploads:** front photo **required**; side / back / full **optional**. Missing views fall back to front — the registry already behaves this way.
- **Image bytes live in Blob**, not fal storage. Fal URLs are not guaranteed permanent; Blob `put()` gives stable public URLs.

## Architecture

### Storage layer — `lib/user-assets.ts`

Follows the `style-library.ts` pattern: JSON index in Blob, `.data/` local-file fallback when no `BLOB_READ_WRITE_TOKEN` (dev).

- `user-references/index.json` → `{ references: UserReference[] }`
  - `UserReference = { id, label, imageUrl, createdAt }`
- `user-models/index.json` → `{ models: UserModel[] }`
  - `UserModel = { id, name, createdAt, views: { front: string; side?: string; back?: string; full?: string } }` (values are Blob image URLs)
- Image files stored at `user-references/<id>.<ext>` and `user-models/<id>/<view>.<ext>`.
- IDs: `slug(name) + "-" + base36 timestamp` — duplicate names cannot collide.
- Exposed functions: `listUserReferences`, `saveUserReference(file, label)`, `deleteUserReference(id)`, `listUserModels`, `saveUserModel(name, files)`, `deleteUserModel(id)`.

### API routes

- `app/api/user-references/route.ts` — `GET` list, `POST` multipart (`file`, `label`), `DELETE ?id=`.
- `app/api/user-models/route.ts` — `GET` list, `POST` multipart (`name`, `front` required, `side`/`back`/`full` optional), `DELETE ?id=`.
- `app/api/models/route.ts` — merges `listHumanModels()` (filesystem/static) with user models converted to the existing `HumanModel` shape (single pose; `views` map to Blob URLs; `userAdded: true` flag added to the payload so the UI can show delete affordances only on user models).

### Image Studio UI (`app/page.tsx` + `components/Sidebar.tsx`)

- Existing one-off custom-reference upload flow is unchanged.
- After a successful custom upload, show **"Save as preset"** + name field. Saving POSTs to `/api/user-references`, then the grid refetches.
- PRODUCT SHOT PRESETS grid renders `PRODUCT_SHOT_REFERENCES` (hardcoded) followed by fetched user references. User presets show a small delete **×** (confirm before delete); hardcoded ones do not.
- Selecting a user preset flows through the existing `resolveSelectedReferenceUrl` path — Blob URLs are absolute and pass through `new URL(path, origin)` unchanged.

### Model Studio UI (`components/ModelSidebar.tsx` or picker component)

- **"+ Add model"** tile at the end of the model picker opens an inline form: model name, front photo (required), side/back/full photos (optional).
- On save: POST to `/api/user-models`, refetch `/api/models`, auto-select the new model.
- User-added models show a delete option (confirm); built-in models do not.

### Generation compatibility

Model Studio analyze/generate routes hand pose public URLs to the image backend. Blob URLs are absolute HTTPS URLs; verify during implementation that every code path that resolves `publicPath` handles absolute URLs (some paths may prepend the app origin — those must pass absolute URLs through).

## Error handling

- Client-side resize before upload via existing `resizeIfNeeded` (Vercel 4.5 MB body cap).
- Missing/invalid Blob token → 500 with a clear message surfaced in the UI.
- POST validation: label/name non-empty, front file present for models, file type must be image.
- Delete is id-based and idempotent.

## Testing

1. `next build` passes.
2. Manual e2e on the deployed site:
   - Image Studio: upload reference → save as preset → refresh → preset persists → select it → generate → delete it.
   - Model Studio: add model with front-only photos → appears in picker → generate all 4 views → delete it.
   - Verify from a second browser/device that saved items appear (team-shared).

## Out of scope (YAGNI)

- Editing/renaming saved items (delete + re-upload covers it).
- Per-user private libraries or permissions.
- Reordering presets.
- Migrating the hardcoded presets into Blob.
