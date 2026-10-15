# Handoff — 2026-10-15, Claude Code (Mac mini)

Branch `claude/flatlay-colourway-lock` off origin/main 0748244. PR open, NOT merged (production
deploys from main: merging needs David's OK).

## Just done
- Image Studio flat lays drifted to another colourway when a style number was given (the Image
  Studio fills it in from the file name): `/api/analyze` described the style's whole ERP gallery,
  which spans every colourway. 10 of 21 category-tile flat lays were wrong on 2026-10-15
  (DP52083 donut print → florals, DS52187A purple → pink, ...).
- Fix: the gallery now only NAMES the product, without colour (`identifyGalleryProduct`, still
  needed for DDT9040 halter-vs-cardigan). The uploaded photo is described with that name as a
  hint (`extractCatalogGarmentFields(url, label, hint)`), and every single-garment prompt ends with
  the colour lock (`colourLockClause`). Vision cache key gained `describe: "intake-photo-v2"`.
- Rail row now reads "Uploaded photo + gallery · N frames". `detected.view` works on the gallery
  path too (the upload is what gets described).
- Tests: `app/api/analyze/route.test.ts`, `lib/gallery-colourway.test.ts`; vitest 1270/1270.
- Before/after (prod analyze vs this branch on `next dev --webpack`, same upload + canvas + prod
  generate): see the PR description.

## Next steps
1. David reviews the before/after; on his OK merge the PR, then re-run one flat lay with a style
   number on production and check the rail says "Uploaded photo + gallery".
2. Carried over: `davistudio-batch/lib/analyze.js` still names claude-haiku-4.5 (422 on fal).

## Gotchas
- Worktree with symlinked node_modules breaks Turbopack: `next dev --webpack` / `next build --webpack`.
- The colour lock is appended AFTER the descriptor pass in `buildTwoImagePrompt`; putting it inside
  `render()` would make the template introspection strip "print"/"colour" words from analyzer text.
