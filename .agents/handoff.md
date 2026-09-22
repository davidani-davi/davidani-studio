# Handoff — 2026-09-21T22:51-07:00, Codex
Branch codex/real-shoot-garment-protection; base356676a (PR20 main).
- Real shoot now recolors first without identity refs, then edits face/hair separately.
- SAM3 clothing/hair masks restore mutually visible garment interiors from recolor pass.
- Hair union excluded with margin; no horizontal restoration. Dimensions/coverage/overlap fail closed.
- PNG protected pixels are checked after encoding; hosted bytes still verified.
- Direct and Simple modes unchanged; garmentProtection/stagePrompts report stage provenance.
- DWJ62218A front/side/back/full visually reviewed; zero changed protected garment pixels.
- Evidence in Faire output/real-shoot-protection; repaired-front.png is separate built-in retouch of user's image.
- Identity and recolor still generative; protection only certifies masked pixels relative to recolor pass.
- Tests and webpack build passed before final review; rerun final checks before merge/deploy.
- NEXT: merge PR, deploy production, verify alias and live pipeline. Update Faire canonical guide/handoff.
- No ERP/Faire product uploads. Celine3 rejected reference remains unpublished.
