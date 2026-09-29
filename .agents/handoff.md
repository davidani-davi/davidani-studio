# Handoff — 2026-09-29, Claude Code

David said the studio "is so slow and not up to date with the rest of the Davi & Dani apps". The work is on two branches.
The previous handoff (2026-09-24, open-front underlayer) is in git history.

## 1. Speed: `claude/fast-thumbnails`, merged to main (production)
- **What changed:** thumbnails load through `/_next/image` (`lib/thumb.ts` + `components/Thumb.tsx`) instead of the 2–8 MB
  originals. Ledger chips are ~5 KB and library cards ~45 KB.
- **Large images:** the stage, solo output, library preview and result grids show the resized copy first. Each downloads
  the original alongside and swaps it in (`upgrade`), so picks are judged on the real file.
- **The resizer is public.** Vercel serves `/_next/image` before proxy.ts runs (checked 2026-09-29), so its only fence is
  `images.remotePatterns` in next.config.js:
  - hosts are pinned, with no port and no query string;
  - ERP is limited to one file directly in /upload/style/, and %2F/%5C escapes are refused.
- Keep `lib/thumb.ts` REMOTE in step with those patterns; lib/thumb.test.ts checks both with Next's own matcher.
- **Reviews:** round 4 scored 8.8 (PASS).
- **Open for David:** check the team's Vercel image-transformation allowance. Each render makes 3–4 widths, and if the
  allowance runs out, every Thumb makes one failed request before falling back to the original.

## 2. Paper restyle: `claude/paper-restyle` (worktree ../davidani-studio-paper12), NOT merged
- **What changed:** moves the whole studio onto Paper (~/Code/DESIGN.md).
  - `app/paper.css` holds the header/nav, the Job Center, the Tailwind-status → Paper tint map and the admin-page overrides.
  - The old header CSS is gone from globals.css.
  - The Library, Inspiration, Prompt Studio and Faire SEO markup was reworked.
- **Reviews:** round 1 scored 7.6 (FAIL). e25f7bf addresses every blocker and should-fix. Round 2 is running.
- **NEXT:**
  1. Pass the review loop (≥ 8.5).
  2. Rebase onto main. Expect conflicts in the LibraryClient / InspirationClient Thumb props.
  3. Open a PR. Merge ONLY with David's OK.

## Gotchas
- **Local dev in a worktree:** run `npx next dev --webpack -p 3017`, because Turbopack panics on the symlinked node_modules.
  Local login uses APP_PASSWORD (.env.local); previews use DAVIDANI_STUDIO_PASSWORD.
- **Browser collisions:** sessions share the default gstack browse instance. Set `BROWSE_STATE_FILE=<own path>` per session.
- **Before committing:** tsc has 10 pre-existing errors (the baseline). Run `git checkout -- tsconfig.tsbuildinfo next-env.d.ts`.
- **Not tested on a real iPhone (WebKit).** All phone checks were headless Chromium at 430/440.
