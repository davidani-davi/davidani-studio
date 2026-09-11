# Shared pants reference collection

Pants (including shorts) use one shared reference picker with exactly front,
side and back, all waist-down. No Celine/Vision grouping or full-shot generation.
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
full image remains on disk, but is not offered in the pants collection.

`listBaseHumanModels` installs the collection before admin overrides, so existing
admin photo replacement/deletion applies. Both Model Studio pickers and the
extension/Daily read this catalog. Generation rejects pants full-shot requests
before queuing or contacting an image provider. Existing saved full photos do
not add a fourth slot to a pants run. Other garment categories retain four views.

Validation: npm test + npm run build; file SHA256 checks; desktop/phone browser
checks with all nine real-reference cards and mocked three-view generation.
Extension test: thumbnail-optimizer/test_pants_browser.cjs in management repo.
