# Handoff — 2026-10-12, Claude Code (Mac mini)

Two open PRs off origin/main 6063893. Both built READY on Vercel, but Vercel stopped posting its
required "Vercel" GitHub status (none on #36, #37 or #38), so main's protection blocks the merge.
David asked for both to be merged.

## Just done
- **PR #36 `claude/vision-model-haiku-5-5`**: Image studio failed with "Analyze: garment analysis
  failed: Unprocessable Entity". fal retired `anthropic/claude-haiku-4.5` from `fal-ai/any-llm/vision`
  (422 literal_error). Moved all 4 callers to `anthropic/claude-haiku-5.5` (live test call OK); Faire
  SEO's direct-Anthropic id moved to `claude-haiku-5-5`.
- **PR #38 `claude/studio-speed`** (David: "slow uploading / moving between tabs"):
  - Single/Multi model rebuilt the catalogue from Blob on every click (0.5–1.3 s) with nothing on
    screen. Now: `loading.tsx` skeleton (shows ~7 ms after click), a 5-min `unstable_cache`
    catalogue for page renders (`lib/human-models-cached.ts`), and a fresh `/api/models` read on mount.
  - Uploads: resize threshold 3 MB → 1 MB (alpha PNGs stay PNG). PNG/JPEG go straight to fal via the
    signed URL from `POST /api/upload/direct` (`lib/upload-images.ts`), falling back to `/api/upload`.
    Wired into Image studio, Single/Multi model and Photoshoot only.
  - vitest 1253/1253; local prod build checked with a headless browser (see the PR body).

## Next steps
1. Get #36 then #38 merged: David merges on GitHub, or the Vercel status comes back. Check for it with
   `gh api repos/davidani-davi/davidani-studio/commits/<sha>/statuses`.
2. After deploy: run Analyze in Image studio on a real style, and time Single model TTFB twice (it
   should be about 0.15 s from the cache). Ask David whether uploads and tabs feel faster on his MacBook.
3. Optional: move the other studios (Inspiration, Library, Playground, CAD…) to `uploadImages`.
4. `davistudio-batch/lib/analyze.js` still names claude-haiku-4.5 on any-llm/vision and will 422.
5. Carried over: "Draft · Claude · Plus test 2 (generated)" is still live in the catalogue; David
   deletes it in Model library.

## Gotchas
- A worktree with symlinked node_modules breaks Turbopack: use `next dev --webpack` / `next build --webpack`.
- Dev mode doesn't prefetch, so loading.tsx only shows instantly in `next build && next start`.
- `unstable_cache` throws outside Next: tests that render the pages mock `next/cache`.
