# Handoff — 2026-09-29 (evening), Claude Code

David said the studio "is so slow and not up to date with the rest of the Davi & Dani apps". The work is on two branches.
The previous handoff (2026-09-24, open-front underlayer) is in git history.

## 1. Speed: merged as PR #27 (665372c), live in production and verified 2026-09-29
- **What changed:** thumbnails load through `/_next/image` (`lib/thumb.ts` + `components/Thumb.tsx`) instead of the 2–8 MB
  originals. On production a 397 KB ERP photo comes back at 6 KB (w=256 WebP), and a fal render at 7/28/60 KB (w=256/640/1080).
- **Large images:** the stage, solo output, library preview and result grids show the resized copy first. Each downloads
  the original alongside and swaps it in (`upgrade`), so picks are judged on the real file.
- **The resizer is public.** Vercel serves `/_next/image` before proxy.ts runs, so its only fence is
  `images.remotePatterns` in next.config.js (pinned hosts, no port or query, ERP limited to one file in /upload/style/,
  %2F/%5C refused). On production, `..%2F`, `..%5C`, other ERP paths, other hosts and `?query` all return 400.
- Keep `lib/thumb.ts` REMOTE in step with those patterns; lib/thumb.test.ts checks both with Next's own matcher.
- **Open for David:** check the team's Vercel image-transformation allowance (each render makes 3–4 widths).

## 2. Paper restyle: `claude/paper-restyle` (worktree ../davidani-studio-paper12), NOT merged
- **What changed:** moves the whole studio onto Paper (~/Code/DESIGN.md).
  - `app/paper.css` holds the header/nav, the Job Center, the Tailwind-status → Paper tint map and the admin-page overrides.
  - The old header CSS is gone from globals.css. Library, Inspiration, Prompt Studio and Faire SEO markup reworked.
- **Reviews:** round 1 scored 7.6, round 2 8.2 (both FAIL). 1dc5d60 addresses every round 2 item. Round 3 is running.
- Rebased onto main after #27 (no conflicts).
- **NEXT:**
  1. Pass the review loop (≥ 8.5, no blockers).
  2. Open a PR. Merge ONLY with David's OK.

## Gotchas
- **Local dev in a worktree:** run `npx next dev --webpack -p 3017`, because Turbopack panics on the symlinked node_modules.
  Local login uses APP_PASSWORD (.env.local); previews use DAVIDANI_STUDIO_PASSWORD.
- **Browser collisions:** sessions share the default gstack browse instance. Set `BROWSE_STATE_FILE=<own path>` per session.
- **Before committing:** tsc has 10 pre-existing errors (the baseline). Run `git checkout -- tsconfig.tsbuildinfo next-env.d.ts`.
- **Not tested on a real iPhone (WebKit).** All phone checks were headless Chromium at 430/440.
- **Dev-only hydration warning:** with a running job in localStorage, `next dev` can report a JobCenter count mismatch while
  Fast Refresh rebuilds during load. Production (checked with a stored running job) logs nothing.
