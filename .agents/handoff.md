# Handoff — davidani-studio

Written 2026-09-12 by Claude Code. Branch `codex/garment-only-pixel-lock`, NOT pushed.

## Done this session — DJ60404 hem-length bug
- David reported DJ60404 (Tapestry Floral Cotton Twill Shirt Jacket, "Simple garment
  swap" method) rendered with the hem drifted past hip to mid-thigh.
- First fix (1c30510) targeted `lib/garment-contract.ts` `lengthFor()` — correct in
  isolation (added a hip-length default for shirt jacket/shacket titles with no length
  word, mirroring the existing coat default) but **`buildGarmentContract`/`lengthFor`
  is dead code from this path's point of view** — DJ60404 went through the "Simple
  garment swap" editing method, which is `lib/simple-reference-shot.ts`, a fully
  separate prompt-builder that never imports garment-contract.
- Real fix (b193780): `simpleReferenceShot` now calls `lengthFor({title: o.garmentName})`
  and appends an explicit hem-length sentence when the title has no length word of its
  own. Verified via `lib/simple-reference-shot.test.ts` (82 tests pass) that DJ60404's
  exact title now produces the hip-length clause in the built prompt.
- **First live-render attempt was invalid**: I drove the standalone "Single Model
  Studio" web UI (`/model-studio`), which posts to `/api/analyze-model` +
  `/api/generate-model` — a vision-based prompt pipeline that never touches
  `simple-reference-shot.ts`/`lengthFor`. It happened to render a correct hem, but
  that told us nothing about the actual fix.
- **Real verification** (`9c2a7ee` era): called `/api/model-shots` directly
  (`editMode: "simple"`, `humanModelId`/`poseId`: `"studio 100"`, DJ60404's ERP
  FRONT photo, GPT Image 2.5) — this is the extension's actual route and the one
  that calls `simple-reference-shot.ts`. Response `prompt` field contained the
  fix's exact clause: "This is a hip-length piece: the hem falls at the hip, at or
  just below the waistband." Rendered image confirms the hem lands correctly.
  Image saved at `/tmp/dj60404-fixed.png` (not committed, local only).
- **David's follow-up correction (still same session)**: the hip-length sentence
  was a flat guess detached from any image, and coats had a real gap — lengthFor's
  coat default only fires when a caller already threads `known.hem="long"` back
  in, which simple-reference-shot.ts never does (it only passes `title`). Fixed
  (`02afb26`): `lengthFor()` now recognizes bare coat words (pea/over/trench/
  duster/etc.) from title text alone; the prompt's length clause is reframed to
  say image 2 (the actual garment photo) alone decides the hem, never image 1
  (the pose reference) — lengthFor's adjective is offered as a "typically X"
  checkpoint, not a hard override, and steps aside when an operator note already
  asks for a specific length. 990/990 tests pass.
- Fixed the `category=pants` mislabel noticed during the first (invalid) test:
  `inferGarmentCategory` (`lib/fal.ts`) was scanning the whole assembled prompt,
  including the upper-body template's own "preserve any visible skirt, pants,
  shorts, or other lower-body garment" boilerplate — so it matched "pants" on
  every jacket/top swap. Now strips that clause before scanning (`9c2a7ee`). Was
  cosmetic (only picks a default style-reference image when none is supplied,
  never on the simple-swap path), all 986 tests still pass.

## Local dev environment set up this session
- `.env.local` created (gitignored) with `APP_PASSWORD`, `AUTH_SECRET`, `FAL_KEY`
  (from `davistudio-batch/.env`), `ERP_USER_ID`/`ERP_PASSWORD` (from
  `~/davidani-marketing-agent/.env`) — lets `npm run dev` run Model Studio locally
  without the Faire Chrome extension or a Faire login at all.
- `~/.claude/skills/gstack/browse` (needs `PATH="$HOME/.bun/bin:$PATH"` — bun isn't
  on the default shell PATH on this machine) can drive it headlessly: log in via
  `/api/auth` with `APP_PASSWORD`, then `/model-studio`, ERP photo search works live
  (confirmed against real DJ60404 ERP photos). Headed Chrome (`connect-chrome` skill)
  does NOT work here — no reachable GUI display from this session — and gstack browse
  only auto-loads its own sidebar extension, not arbitrary third-party ones, so the
  actual Faire extension can't be driven directly. This local-dev-server path is the
  workaround: same generation pipeline, no extension needed.
- Loading a garment photo via the ERP picker triggers an automatic `/api/analyze-model`
  FAL vision call as a side effect (small cost) — happened once this session,
  unavoidable side effect of using the UI, not something to be alarmed about but worth
  knowing before poking around for verification purposes.

## Next
- Push the branch whenever David wants it live — not pushed yet (1c30510, b193780,
  9c2a7ee, 02afb26, 6385943, plus handoff commits).
- The shoulder-ghost artifact is still open. Suggest one more render on a
  different `humanModelId`/`poseId` (not "studio 100") before spending more
  cycles on prompt wording, to find out if it's the photo or the prompt.
- Reframed prompt (02afb26) re-verified with a second live render, same
  `/api/model-shots editMode:simple` call: hem still lands correctly at hip.
- **New artifact found by David zooming into that render**: a translucent
  ghost of the plate's own top survives at the shoulder/collar, under the
  new jacket. Strengthened the removal clause twice (`6385943` — first pass
  added explicit no-ghosting language, second pass named cuffs after a
  third render also showed the plate's own sleeve print ghosted at the
  wrist). **Not fully closed**: the shoulder ghost was in the same spot on
  both the 2nd and 3rd renders, same pose reference (`studio 100`/"Celine
  2") — may be specific to that photo (hair falls over the collar there,
  possibly ambiguous fabric-vs-hair to the edit model) rather than
  something prompt wording alone fixes. Next render should try a different
  pose reference to isolate whether it's the photo or the prompt.
- Calling `/api/model-shots` directly with curl (bypassing any UI) is the fast way
  to exercise the extension's actual "Simple garment swap" path from this dev
  environment going forward — see git log for the exact body shape used.
- Unrelated: this branch still carries the earlier "reference sets 108-111" and
  "knee framing" work from the prior handoff — see git log for that thread.
