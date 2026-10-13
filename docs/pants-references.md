# Shared pants reference collection

Pants (including shorts) and skirts use one shared reference picker: front, side
and back waist-down, plus one full shot (restored 2026-10-13, David). No
Celine/Vision grouping.

**Full shot.** The ERP shoots behind these references are mostly waist-down, so
the full shot's base is a full-body photo the operator picks from the ERP
(`https://system.davidani.com/upload/style/...`) or uploads (Blob), sent as
`fullReferenceUrl` with `view: "full"`. Only those two hosts are accepted. A set
with its own full view (Donuts' archived `full.png`) needs none; any other set
without one is refused before spending. A base without a reviewed contour gets
the automatic draft outline (`lib/draft-contour.ts`); when the head cannot be
found, Simple refuses it. Same-shoot full-body photos exist only for DP62024A
(`_1`, `_3`–`_5`) and DP60245 (`_12`).
The collection is DP52083 Donuts, DP62024, DP67305, DP60245, DP62024A,
DP43109, DP69017, DP67040, DP60197B, in that order.

`lib/pants-references.json` records each new ERP Style File source URL, original
filename, file ID and SHA256. The 24 files under `public/pants-references/` are
unchanged original ERP downloads, visually selected from matching colorways.
No AI image generation, cropping, resizing, sharpening or face editing was used.
DP67040's front is identified by its button/fly; its back has elastic and patch
pockets. Never infer view from the ERP filename's numeric suffix alone.

Donuts retains its existing front/side/back bytes and stable studio 103 pose ID.
Its side/back remain previously generated pose references with inferred unseen
construction; they are not newly verified ERP product photos. Its archived
full image is offered again as its full-shot base.

`listBaseHumanModels` installs the collection before admin overrides, so existing
admin photo replacement/deletion applies. Both Model Studio pickers and the
extension/Daily read this catalog. Keep original face (the Donuts face lock) stays retired.

Validation: npm test + npm run build; file SHA256 checks; desktop/phone browser
checks with all nine real-reference cards and mocked three-view generation.
Extension test: thumbnail-optimizer/test_pants_browser.cjs in management repo.
