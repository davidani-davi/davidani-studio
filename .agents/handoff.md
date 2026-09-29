# Handoff — 2026-09-29 (evening), Claude Code

David said the studio "is so slow and not up to date with the rest of the Davi & Dani apps". Both halves are done.
The previous handoff (2026-09-24, open-front underlayer) is in git history.

## 1. Speed: merged to main as 665372c (#27), live and verified
- **What changed:** thumbnails load through `/_next/image` (`lib/thumb.ts` + `components/Thumb.tsx`), not the 2–8 MB
  originals. Large views show the resized copy first and swap in the original (`upgrade`).
- **Keep in step:** `/_next/image` is public; its only fence is `images.remotePatterns` in next.config.js. Keep
  `lib/thumb.ts` REMOTE in step with it (`lib/thumb.test.ts` checks both).
- **Open for David:** the team's Vercel image-transformation allowance.

## 2. Paper restyle: `claude/paper-restyle` (worktree ../davidani-studio-paper12), PR https://github.com/davidani-davi/davidani-studio/pull/28
- **What changed:** the whole studio moves onto Paper (~/Code/DESIGN.md).
  - `app/paper.css` maps the Tailwind utilities onto Paper tokens under `.paper-app`.
  - Plus page-level markup fixes. The PR body lists them.
- **Reviews:**
  - Rounds 1–8 scored 7.6 / 8.2 / 8.4 / 8.2 / 8.4 / 8.6 / 8.2 / 8.6.
  - Round 8 was a PASS with no blockers. 20111d1 fixes its should-fixes, checked on its preview.
  - The NITs are listed in the PR as follow-ups.
- **NEXT:**
  1. Merge ONLY with David's OK. Production deploys from main.
  2. After the merge, check production at 1440 and 430.
  3. Then the follow-ups: the Variants chips, Variant 1/2/3 vs A/B/C, Prompt studio badges.

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
- **Not tested on a real iPhone (WebKit)**, only headless Chromium at 430/440.
