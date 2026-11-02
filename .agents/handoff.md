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
- Checked: vitest 1367/1367 (3 new in ModelAdmin.test.tsx); tsc only the 10 old errors; local
  `next dev --webpack` + Playwright at 1440 and 430: download saved, identical to `public/models/crop 97/front.png`,
  no horizontal scroll. Blob host answers `access-control-allow-origin: *`, so the fetch works in production.
  Not checked: production (after merge) or real Chrome on the MacBook Pro.

## Next steps
1. David's OK → merge; Vercel deploys main. Try Download on one set in Chrome on the MacBook Pro.
2. Still open from #50: client buttons for recast sets in the extension (Other pose, pose list, remove).

## Gotchas
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- Local dev must be opened on `localhost`, not `127.0.0.1` (Next blocks dev scripts cross-origin; page never hydrates).
- Local `next dev` without `BLOB_READ_WRITE_TOKEN` stores sets under `.data/` + `public/user-assets/`;
  route.test.ts lists every local set, so delete those after a local test or 3 tests fail.
