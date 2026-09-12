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
- **Not verified against a live render** — would cost a real FAL charge. Ask David
  before triggering an actual DJ60404 regeneration to confirm the hem visually.

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
- David decides whether to spend a FAL render to visually confirm the hem fix on
  DJ60404, or verify next time he's in the extension normally.
- Push b193780 (and 1c30510, which is harmless but currently unused) whenever David
  wants it live — not pushed yet.
- Unrelated: this branch still carries the earlier "reference sets 108-111" and
  "knee framing" work from the prior handoff — see git log for that thread.
