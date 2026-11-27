# Handoff: Photoshoot Studio on Kobra (2026-11-27, Claude Code)

- **Branch:** `claude/project-thread-uy83q6`, off main a7fe60b (#69 + #70 merged). PR: see `gh pr list` ("Photoshoot Studio on Kobra").
- **Earlier handoffs** (git history): Model Studio upgrade `git show a7fe60b:.agents/handoff.md`; Image studio canvas-first `git show origin/claude/kobra-image-studio:.agents/handoff.md`; Kobra foundation `git show origin/claude/kobra-foundation:.agents/handoff.md`.
- **Plan order** (`docs/superpowers/plans/2026-11-24-studio-redesign.md`, Phase 2): 1 Image ✓ (#71 open) · 2 Model ✓ (#70, canvas-first waits on David) · **3 Photoshoot (this PR)** · 4 Job Center + navigation · 5 Library + Inspiration · 6 CAD, Techpack, Prompt, Playground · 7 Faire SEO, Reference identity, admin/models, login.

## Done
- PR #71 retargeted from `claude/kobra-foundation` to `main` (David's topic asked for it). It merges cleanly except `.agents/handoff.md`; whichever of #71 / this PR merges second keeps both handoffs' notes.
- `/photoshoot-studio` on Kobra, same look as the new Model Studio: header outside `.kobra`, two columns at >=1024px (setup left, run + shots right), one column below.
  - Sections from `components/model-studio/bits.tsx` (Section, Segmented, Tag, Thumb). Reference picker is a radiogroup, 4 per row (5 at 481-1023px).
  - Run bar: Generate, one-line summary (`lib/photoshoot-run.ts` `runSummary`), Download all.
  - Each running/failed shot is the kit's `RenderStatus` (Reading garment = prompt writing, Generating = /api/generate). Failed shots have **Retry**, which anchors on the earliest finished shot (`anchorFor`). Done shots: Download (via `/api/download`), Open.
  - Phone (<=480px): fixed bottom bar with the summary and Generate.
  - Request bodies are unchanged from the old page.
- `Thumb` fix (shared with Model Studio): an image that loads before hydration no longer stays invisible. It showed up here because the page is static, so the reference photos are server-rendered.
- Checks: vitest 1736 pass. The 2 failures also fail on clean main in the cloud box: `mini-worker/wording/evidence.test.mjs` (no sqlite3) and `ModelAdmin.test.tsx` "saves the stored original". `next build` passes. tsc has only the 10 old test-file errors. Screenshots at 1280/900/440/430 (empty, mid-run, done), mocked API: `docs/screenshots/photoshoot-redesign/`. No paid renders.

## Next
1. David reviews this PR. A real render through the page after merge (paid, needs David's OK).
2. Then #4 Job Center + navigation. #71 already has `ToolMenu` and a compact header; build on it once #71 merges.
3. Still open from before: Model studio canvas-first (ask David), retire `/model-studio-legacy` once he approves the new page, ERP upload waits on #43.

## Gotchas
- **`node_modules`** is a tracked symlink to the Mac's folder. In the cloud: `git update-index --skip-worktree node_modules`, then remove it and `npm ci`. Never stage it. Leave `tsconfig.tsbuildinfo` unstaged (`git checkout` it before committing).
- **Screenshots without the API:** run `next start` with any `AUTH_SECRET`, sign a `davidani_session` cookie (HMAC-SHA256 like `lib/auth.ts`), and stub `/api/upload/direct`, `/api/user-references`, `/api/prompt-studio/photoshoot`, `/api/generate` with Playwright routes.
- Full-page phone screenshots show the fixed bottom bar in the middle of the page. That's how the capture works; the viewport shots are what a phone shows.
- #71 uses a 560px phone breakpoint. The project rule is 480px; worth fixing in #71 or its follow-up.
