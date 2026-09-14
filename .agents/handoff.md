# Handoff — Model Studio shoulder fix deployed and checked
Written 2026-09-14 by Codex.
Branch: codex/studio-shoulder-verification (documentation follow-up).
Deployed code: main 52ced69 (PR #9); this handoff commit changes docs only.

## Completed
- Simple face compositing feathers inward; no old-shirt seam colour transfer.
- CI initially timed out deep-comparing a full-size mask; Buffer.equals fixed
  the test without weakening its assertion. 993 tests and builds passed.
- Production alias verified on deployment dpl_94ns3b8jZhH9ULdqfgRUTNtYW4H7:
  https://davidani-studio-nxa6d7x3s-davidani-davis-projects.vercel.app
- Browser loaded in 1.127s, no console errors.
- Recovered exact DET70088 saved job through Daily listing-workspace API.
- Its managed reference had protection crossing striped shoulder (778 rows).
  Final reviewed protection: protectedRows=748, transitionRows=48, 2000x2992.
  Blend runs below the face and above clothing. 718/15 first trial had a hair join.
- Reference model identity-3e39d9b6-88b5-436d-abc1-322105390544,
  pose pose-3e39d9b6-88b5-436d-abc1-322105390544, front only.
- Cloud change f02342e8-364f-43fb-a536-717cafd6ad77 written using
  appendCatalogChange after reviewing the exact source and validating its hash.
- Final live GPT 2.5 job 96e1f840-f5a8-4f9a-92df-85eaf87f064c passed visual
  shoulder/hair check and exact comparison of 1,404,000 protected pixels.
- Saved new front in shared DET70088 studio + Washed Grey color draft;
  old front retained in history. New front unselected; no listing upload.
- Evidence: docs/debug/DET70088-shoulder-check.png and DET70088-verification.json.

## Next / gotchas
- User can refresh/reopen Model Studio and review/select the corrected front.
- Other views were not generated or changed.
- Face boundaries must be below the complete face AND above clothing; do not
  blindly enlarge a blend below that boundary. This reference needs 48 rows.
- Protected-pixel checksum is not a visual-quality check; inspect outputs too.
- Original Studio checkout still has unrelated dirty plates.json/next-env.d.ts.
- Production credentials are in /tmp/shoulder-live/.env.production (600), not Git.
- Docs-only follow-up push may automatically redeploy the same verified code.
