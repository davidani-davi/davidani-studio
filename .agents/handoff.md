# Handoff — Studio redesign Phase 1: Kobra foundation (2026-11-24, Claude Code)

Branch `claude/kobra-foundation` (off main 85c1b1d); PR open, see `gh pr list`. Previous handoff (Wording Studio, live ops notes) is in git history: `git show 85c1b1d:.agents/handoff.md`.

## Done
- David picked look **B · Kobra**. Plan: `docs/superpowers/plans/2026-11-24-studio-redesign.md`.
- Kobra registry in `components.json` (needs `KOBRA_TOKEN` in `.env.local`; value in `~/.claude.json` mcpServers.kobra). Components in `components/ui/`.
- Opt-in scope: wrap a screen's root in `.kobra`. Paper rules in `app/paper.css` sit in `@scope (html) to (.kobra, popups)`; the 3px `.rounded-*` rule in `app/globals.css` skips Kobra areas; `.kobra` sets its own radii and `--muted`.
- `lib/render-status.ts` (+ tests) and `components/kit/RenderStatus.tsx`: the one render card (steps, elapsed vs usual time, slow warning, failure + Retry, photo fade-in), driven by `studio-job-store` statuses.
- `/ui-kit` gallery page (login-gated, not linked).
- Checked: 1,595 tests, `next build`, `@scope` survives minify, screenshots 1280/440/430 clean, Image studio unchanged.

## Next
- Phase 2: one PR per screen in order of use (plan doc). Wrap the screen in `.kobra`, swap controls for `components/ui`, use `RenderStatus` for every job.
- Not checked: dark mode, real iPhone, every existing screen.

## Gotchas
- A `node_modules` symlink is tracked in git; `npm ci` replaces it. Never stage its deletion.
- Kobra ships React 19 types; `components/ui/image-gallery.tsx` has a local fix for React 18.
- Kobra's tokens (`--muted`, `--radius-*`, `--color-foreground`) collide with Paper names; keep overrides inside `.kobra`.
