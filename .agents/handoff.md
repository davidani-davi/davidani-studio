# Handoff — 2026-09-29 (evening), Claude Code

David said the studio "is so slow and not up to date with the rest of the Davi & Dani apps". Both halves are live.

## 1. Speed: merged to main as 665372c (#27), live and verified
- **What changed:** thumbnails load through `/_next/image` (`lib/thumb.ts` + `components/Thumb.tsx`), not the 2–8 MB
  originals. Large views show the resized copy first and swap in the original (`upgrade`).
- **Keep in step:** `/_next/image` is public; its only fence is `images.remotePatterns` in next.config.js. Keep
  `lib/thumb.ts` REMOTE in step with it (`lib/thumb.test.ts` checks both).
- **Open for David:** the team's Vercel image-transformation allowance.

## 2. Paper restyle: merged to main as b1ab240 (#28), live and checked at 1440 / 430
- **What changed:** the whole studio moves onto Paper (~/Code/DESIGN.md).
  - `app/paper.css` maps the Tailwind utilities onto Paper tokens under `.paper-app`, plus markup fixes (see the PR).
- **Follow-ups (the #28 NITs): branch `claude/paper-followups`, PR open, merge only with David's OK.**
  - Variants 1–4 as separate chips, "Variant 1/2/3" everywhere, 4:5 hairline fallback when a render is gone,
    no hover lift/zoom, Prompt studio 2:3 tiles + hairline badges.
  - Selected = 1px `--fg` border studio-wide (`paper.css`: globals.css had mapped `border-brand-500` to the hairline).
  - Review rounds 9–10: 8.2 FAIL, 8.8 PASS; round-10 notes fixed in 701449a.
- **NEXT:** after the merge, check production at 1440 / 430 (stage with 3 variants, Setup drawer, Prompt studio).
- **main is protected since 2026-09-29:** a PR needs `test` + `Vercel` green; repo auto-merge is on
  (`gh pr merge --auto --squash`). Admins can still push directly (enforce_admins off).

## Gotchas
- **Cloud run history resurrects deleted runs.** `syncCloudHistory` (lib/client-cloud-history.ts) re-POSTs every
  local-history item from any open Image studio tab (localStorage `davidani_history_v1`). Blob reads are also CDN-stale.
  To delete a run for good:
  1. Remove it from every browser's local history first.
  2. Delete by exact id with ~90 s between writes.
  3. Re-read over several minutes.
  4. Reviewers must not open `/` (use `/login?next=/model-studio`).
  - `DELETE /api/history` without an id wipes ALL of that studio's history.
- **Local dev in a worktree:** run `npx next dev --webpack -p 3017` (Turbopack panics on symlinked node_modules). Local
  login uses APP_PASSWORD (.env.local); previews use DAVIDANI_STUDIO_PASSWORD. Local dev has no run history or
  Inspiration data, so check those on a preview (Vercel MCP `get_access_to_vercel_url` for the SSO share link).
- **Browsers:** give each session and each reviewer its own `BROWSE_STATE_FILE`, and `$B stop` it afterwards.
- **Before committing:** tsc has 10 pre-existing errors (the baseline). Run `git checkout -- tsconfig.tsbuildinfo next-env.d.ts`.
  Check vitest's EXIT CODE, not just the pass counts: an unhandled error fails CI with every test passing.
- **Not tested on a real iPhone (WebKit)**, only headless Chromium at 430/440.
