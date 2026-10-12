# Handoff — 2026-10-12, Claude Code (Mac mini)

Branch `claude/upload-images-everywhere` off origin/main 02fe1e0 (PR open, see `gh pr list`).

## Just done
- PR #36 (Image studio Analyze 422: fal retired `anthropic/claude-haiku-4.5` → `claude-haiku-5.5`) and
  PR #38 (instant Single/Multi model tab loading screen + cached catalogue; uploads shrunk in the browser
  and sent straight to fal) are merged and live. Checked on production: Analyze 200 in ~4 s, direct
  upload PUT + fetch OK, Single model TTFB ~0.21–0.28 s warm (was 0.5 s, 1.3 s cold).
- This branch moves every remaining `/api/upload` caller to `uploadImages` (lib/upload-images.ts):
  Techpack, CAD, Prompt, Inspiration (2 places), Image playground, Faire SEO, Library manual view,
  Output panel fit/back references, feedback markup (Image studio + Single model). The fit/back,
  Library and markup uploads used to send the raw file, so phone photos over 4.5 MB failed at Vercel.
- Verified: vitest 1254/1254; non-test tsc clean; local prod build + headless upload in Techpack, CAD,
  Prompt, Playground, Faire SEO, Inspiration (2.8 MB PNG → 146 KB JPEG, PUT straight to fal, thumb loads).
  Not exercised in a browser: Output panel fit/back, Library manual view, feedback markup.

## Next steps
1. Merge this PR once `test` + `Vercel` are green; after deploy, upload once in Techpack on production.
2. Ask David whether uploads and tab switches feel faster on his MacBook Pro.
3. `davistudio-batch/lib/analyze.js` still names claude-haiku-4.5 on any-llm/vision and will 422.
4. Carried over: "Draft · Claude · Plus test 2 (generated)" is still live in the catalogue; David
   deletes it in Model library.

## Gotchas
- Still on the old path on purpose: ModelSidebar (`/api/user-models`, named multipart fields) and
  Photoshoot `uploadReference` (`/api/user-references`): they store to Blob server-side.
- A late "Vercel" status on a PR is usually a Vercel incident (vercel-status.com), not a broken link.
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- gstack `browse upload` uses a strict selector: with two file inputs use `'input[type=file] >> nth=0'`.
