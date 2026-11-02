# Handoff — 2026-11-02 ~10:40 PT, Claude Code (Mac mini)

Branch `claude/model-library-download` off origin/main 2daa531 (#51). PR open, NOT merged
(production deploys from main: merging needs David's OK).

## Just done
- Model library (`/admin/models`, `app/admin/models/ModelAdmin.tsx`): every view card has a **Download**
  button next to Replace photo. It fetches the stored original (byte for byte, no resizing) and saves it as
  `<model>-<pose>-<framing>-<view>.<ext>` (e.g. `Celine-DET70085-front.jpg`; the pose is left out when it
  matches the model name, framing only for crop/low framed views). Shows "Downloading…" while it runs; if
  the fetch fails it opens the file, with `?download=1` on Blob URLs so Blob answers as an attachment.
- The flow David asked for: Download → edit → Replace photo (existing upload + review dialog).
- **Add model (Model Studio → Setup) takes full-size photos.** Choma hit "These photos total 12.7 MB after
  compression": the form sent all four photos in one request (Vercel caps bodies at 4.5 MB) and a PNG with any
  transparency stayed PNG after the 2048 px shrink. Now each PNG/JPEG/WebP up to 20 MB goes straight to Blob
  (`lib/original-upload.ts` → token route `app/api/user-models/upload`, prefix `user-models/incoming/`), the
  save posts `<view>Url` links, and `lib/user-model-upload.ts` reads only this store's incoming photos, keeps
  the bytes (only >4096 px or EXIF-rotated photos are re-encoded once at q95), then deletes the incoming copy.
  HEIC, >20 MB or a failed direct upload fall back to the old shrink path. Listing Team multipart drafts unchanged.
- Checked: vitest 1367/1367 (3 new in ModelAdmin.test.tsx); tsc only the 10 old errors; local
  `next dev --webpack` + Playwright at 1440 and 430: download saved, identical to `public/models/crop 97/front.png`,
  no horizontal scroll. Blob host answers `access-control-allow-origin: *`, so the fetch works in production.
- Add model, local dev + Playwright: four 1536x2304 RGBA PNGs (20.5 MB) saved byte-identical, incoming emptied;
  with the upload route blocked the old "15.4 MB after compression" error returns (the cause). vitest 1378/1378.
  The Blob (production) half is not tested locally: no Blob token on the mini.
  Not checked: production (after merge) or real Chrome on the MacBook Pro.

## Next steps
1. David's OK → merge; Vercel deploys main. Try Download on one set, and Add model with full-size PNGs,
   in Chrome on the MacBook Pro (Choma can retry her set then).
2. Still open from #50: client buttons for recast sets in the extension (Other pose, pose list, remove).

## Gotchas
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- Model Studio's sidebar sits behind the Setup button; in local dev the Next "N" badge covers it (hide `nextjs-portal`).
- Local dev must be opened on `localhost`, not `127.0.0.1` (Next blocks dev scripts cross-origin; page never hydrates).
- Local `next dev` without `BLOB_READ_WRITE_TOKEN` stores sets under `.data/` + `public/user-assets/`;
  route.test.ts lists every local set, so delete those after a local test or 3 tests fail.
