# Handoff — 2026-10-12, Claude Code (Mac mini)

Branch claude/model-library-trash → PR #35 (unmerged, awaiting David's OK). Base: origin/main 8f2abc3.

## Just done
- Model library (/admin/models): a delete jumped into Trash with the deleted model selected, and the
  Tops/Bottoms/All tabs counted Trash ("Tops 1"), so it looked like the only model left (David, 10-12).
- Now: a delete stays on the live list, opens the next model, and shows a sticky "Moved … to Trash" notice
  with Undo. Tabs always count live models; Trash has its own count, lists every section, and a trashed
  model gets one Restore button (`ModelAdmin.tsx` trashModel / restoreModel; CSS in admin.css).
- Tests: ModelAdmin.test.tsx (delete → stay → Undo). npm test 1245/1245; `next build --webpack` OK.
  Screenshots at 1440/430 from a local dev server with mocked /api/admin/models.

## Next steps
1. David OKs → merge #35 (Vercel deploys main). Check /admin/models signed in, at desktop and phone.
2. "Draft · Claude · Plus test 2 (generated)" is still live in the catalog; David deletes it in Model
   library (Plus test 1 is already in Trash). Agents don't sign in with the team password.

## Gotchas
- A worktree with symlinked node_modules breaks Turbopack: use `next dev --webpack` / `next build --webpack`.
- Local dev auth: AUTH_SECRET env + a cookie minted with lib/auth createSessionToken (throwaway secret only).
