# Handoff — original garment concept generation
Written 2026-09-09 by Codex. Branch codex/design-concepts; base 44a5c4a.
Worktree /tmp/davidani-design-concepts; current checkpoint is implementation.

## Accomplished
- New authenticated /api/design-concepts: original front/back garment concept
  from title/direction/month. Fixed Nano Banana Pro, one 2:3 requested-2K PNG.
- Encrypted immutable job records; reserve-before-spend, stable request IDs,
  no automatic submission retry, persistent provider handle and saved PNG.
- Signed completion callback polls the stored provider job, ignores supplied
  payload, saves result while app is closed; GET remains a recovery path.
- Faire Daily branch codex/design-evidence adds generator/feedback UI and bridge.
- Real first concept generated, saved, read back: Arc Quilt, 1696×2528 PNG.
  Job 0eef5ed5-0174-49a3-aea1-eddccd3ec3e6; evidence/artifact in Faire worktree
  output/design-concepts/arc-quilt/. Independent exploration, no sales claim.
- 738 tests + production build pass. docs/design-concepts.md has contracts.

## Next steps / verify before claiming live
1. Merge/push this branch and verify production routes/auth + completion callback.
   Then finish/release Faire branch after merging latest main (other task edits).
2. Verify a live callback writes completionSource=callback without UI polling.
3. Overall Faire research goal remains ACTIVE: buyer access, real per-variant
   capture, dormant winners, backups, year+ history and sales learning unfinished.
4. Local built server session 31087 :8812; revalidate handle before reuse.
   Real saved request state /tmp/faire-real-design.json; never resubmit blindly.

## Preserved / gotchas
- Existing GPT 2.5 reference masters 97/98/99/100 untouched; prior 726 tests.
- Main still has pre-existing dirty tsconfig.tsbuildinfo; do not stage it.
- /tmp/studio-concepts-production.env is PRIVATE. No tokens in git or logs.
- Keep pulled env outside Next project; dotenv expansion changed local auth
  interpretation. Keychain import of buyer cookies also failed; user input pending.
- Generated concepts need sampling validation; no finished techpack claims.
