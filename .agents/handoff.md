# Handoff — 2026-09-21T22:51-07:00, Codex
Main1e83116 (PR21 merged); release verified 2026-09-21T23:02-07:00.
- Real shoot now recolors first without identity refs, then edits face/hair separately.
- SAM3 clothing/hair masks restore mutually visible garment interiors from recolor pass.
- Hair union excluded with margin; no horizontal restoration. Dimensions/coverage/overlap fail closed.
- PNG protected pixels are checked after encoding; hosted bytes still verified.
- Direct and Simple modes unchanged; garmentProtection/stagePrompts report stage provenance.
- DWJ62218A front/side/back/full visually reviewed; zero changed protected garment pixels.
- Evidence in Faire output/real-shoot-protection; repaired-front.png is separate built-in retouch of user's image.
- Identity and recolor still generative; protection only certifies masked pixels relative to recolor pass.
- Tests1165/85 files, webpack build and GitHub CI passed.
- Production dpl_5yfpa7r3XgQUv7dLoJBkhVc1m5pm Ready; alias and live no-detail front verified.
- NEXT: user regenerates front in existing Real shoot method. No extension update needed.
- Faire30781fd contains SOP, repaired front and four-view/live evidence; hosted hash passed.
- No ERP/Faire product uploads. Celine3 rejected reference remains unpublished.
