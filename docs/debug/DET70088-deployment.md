# DET70088 production verification — 2026-09-14

PR #9 merged as `52ced69`. Production alias `davidani-studio.vercel.app` was verified
on deployment `dpl_94ns3b8jZhH9ULdqfgRUTNtYW4H7` before submitting the live check.
All 993 tests and production builds passed. Browser check: 1.127-second load,
no console errors, populated studio page.

The exact saved setup used GPT Image 2.5, Simple garment swap, and the original ERP
photos `DET70088_1.jpg` / `DET70088_2.jpg`. The managed model is
`identity-3e39d9b6-88b5-436d-abc1-322105390544` (Celine · DETP60100 mint stripe).
Its original 26% protection boundary crossed clothing. A 24% boundary with a
15-row transition removed stripes but left a hair join. Reviewing the source
showed a 48-row transition ending at row 748 stays below the face and above
clothing. That final protection is saved in the reference library.

Final job: `96e1f840-f5a8-4f9a-92df-85eaf87f064c`.
[Full-resolution checked PNG](https://v3b.fal.media/files/b/0aaa66e8/TCymeJ3phFC-Z6YWYXgq6_garment-only.png).

The shoulder remnant and pale halo are absent; the hair transition is clean in
this render. The upper 702 rows (1,404,000 pixels) match the decoded original
exactly. Hosted PNG hash matches the server's preservation report. Output is
2000 × 2992. See `DET70088-verification.json` and `DET70088-shoulder-check.png`.

The checked front is saved in the shared studio and Washed Grey color draft,
with the previous image retained in history and the new front unselected for
user review. No listing photos were uploaded, and no other views were generated.
