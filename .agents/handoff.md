# Handoff — reference library categories and layout
Updated 2026-09-10T20:47-07:00 by Codex.
Branch codex/reference-library; implementation729491a pushed to main.
- Models & pose references now has Tops / Bottoms / All category tabs.
- Sidebar300px, nonshrinking90px rows, contained thumbnails and wrapped names.
- Fixed sidebar controls; only model list scrolls. Phone list has bounded height.
- Classification uses curated pants IDs / explicit low pose framing; wearing
  pants in a full-body photo never classifies a top model as a bottom.
- Mixed custom models appear in both with category-appropriate pose/thumbnail.
- Bottoms show front/side/back only. Tops keep all four views.
- Model/pose rename and delete controls are under Edit details disclosures.
- Search clears invisible selection; Trash remains category-scoped.
- Adding low pose switches to Bottoms. IDs/bytes/backend/generation unchanged.
- All942 tests pass; standard npm run build passed (Next16.2.4).
- Browser Chromium/WebKit: separate categories, nine bottoms,3/4 views,
  search, selection, disclosures, row geometry,390/1024/1536/2560 widths.
- Local integration: create model/pose, four uploads, independent replacement,
  invalid URL rejection, remove/reload, Trash/restore and catalog propagation.
- No live reference edits or generations used for verification.
- Deployed clean committed source:20k9xq5le at davidani-studio.vercel.app.
- Authenticated read-only live browser passed categories, nine bottoms,
 3/4 views, search, details and390/1024/1536/2560px row/overflow checks.
- Next: David refreshes /admin/models; no extension update needed.
- Worktree /tmp/studio-reference-library; screenshots /tmp/model-library-qa.
- Local QA server3016 uses temporary local catalog entries (gitignored .data).
- Preserve original repo's modified tsconfig.tsbuildinfo.
