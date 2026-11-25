# Studio redesign plan (2026-11-24)

David's brief (2026-11-24): the studio **looks cheap/dated** and is **slow/unclear while
rendering**. He wants to **see both looks (Paper and Kobra) on real screens before choosing**.
Nothing about how the tools work changes: same routes, same API calls, same job store,
all 1,589 tests stay green.

Done already: Tailwind v3 → v4 (PR #68, pixel-identical). PR #8 (Sep Paper redesign
draft, 155 commits behind main) is reference only; close it once a look is chosen.

## Phase 0 — two-look preview (decision gate)

Build a clickable claude.ai artifact (static HTML, real D&D photos uploaded to the
artifact asset store, not live API) with the same 3 screens in each look:

1. **Image Studio** (`app/page.tsx`, 1,923 lines, the most-used screen): upload, model/pose
   picker, Generate, results grid.
2. **The render in progress**: queued → analysing → generating → saving, one failed render
   with Retry, then the finished image fading in. This is the "slow/unclear" fix, so it
   gets its own screen, not a footnote.
3. **Navigation + Job Center**: how the 14 tools are reached, and the running/finished
   jobs list (`components/JobCenter.tsx`, `RunProgress.tsx`).

Looks:
- **A, Paper**: `~/Code/DESIGN.md` + `design/paper.css` (3px radii, hairlines, every control
  visible). Kobra only for behaviour-heavy parts (dialog, menu, toast), restyled to Paper.
- **B, Kobra**: Kobra components and theme as shipped (`mcp__kobra__search_components`).
  Today David called a Kobra board "AI and cheap" (noreboard), so show B honestly, not as a straw man.

Audit both before showing them (UI ship gate): screenshots at 1280, 430, 440; every image loads;
skeletons where results land; hover/press states; no pill radii. David picks A, B or a mix.

## Decision (2026-11-24)
David picked **B · Kobra** after the two-look preview (https://claude.ai/artifact/8YXtaSnXbCNkGTpuhgW4sL).
Applied as an opt-in scope: a screen wraps its root in `.kobra`; everything else stays Paper.
Badge corners are 6px (no pills).

## Phase 1 — foundation (after the pick) — built on `claude/kobra-foundation`
- Tokens + base components in one place (`components/ui/`): Button, Segmented, Field,
  Card, Dialog, Toast, Skeleton, ProgressSteps. If Kobra is used: `components.json` +
  `@kobra` registry, `KOBRA_TOKEN` in `.env.local` (see https://kobra.systems/setup.md).
- **One render-status pattern for every tool**: named steps with elapsed time
  ("Generating · 42 s, usually ~60 s"), a skeleton in the result slot, a clear failure card
  with the reason and Retry, a fade-in when the image lands. Driven by the existing
  `studio-job-store` statuses, so no API changes.
- Check new class names against `app/globals.css` for clashes.

## Phase 2 — screens, one PR each, in order of use
1. Image Studio (`/`) · 2. Single + Multi Model Studio · 3. Photoshoot Studio ·
4. Job Center + navigation · 5. Library + Inspiration · 6. CAD extractor, Techpack,
Prompt Studio, Image Playground · 7. Faire SEO (+ batch), Reference identity, admin/models, login.
Wording Studio follows whichever page it shares components with.

Each PR: before/after screenshots at 1280/430/440, `next build`, vitest green, a real
render through the redesigned screen on a Vercel preview (or production right after merge,
since previews sit behind Vercel SSO), and the loading, empty and error states checked.

## Not in scope
Prompt/render logic, provider choice, the mini Wording worker, extension calls to
`/api/model-shots`.

## Open questions for David
- After Phase 0: A, B, or which parts of each.
- Does the Job Center stay a separate page or become a panel on every tool?
