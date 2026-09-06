# Changelog

## [Unreleased] - 2026-09-05

### Fixed

- Model shots: a long top or outerwear piece (a coat of any kind, longline, duster, knee/midi/maxi length in the title) is shot on the full-length plate in every view. The head-to-thigh crop plate has no room for its hem, and DJ67094 came back as a shacket on the side and a stretched, oversized figure on the front (`lib/plate-framing.ts` hemFor).
- The garment contract now asserts length and fit from the listing copy the way it asserts closure, so four views describe one hem ("longline, the hem falls at mid-calf") and one fit ("relaxed through the body, shoulder seams at her natural shoulder line").
- Under a long layer the model wears one plain house styling (black straight-leg trousers, black ankle boots) in every view instead of each plate's own invented bottoms: the swap scope widens to the full look and the styling is written into the analyzer's base prompt (`applyStyling`), with the plate's own trousers and shoes struck from its keep-list.
- Known, left as is: `optimizeForGptImage` strips from "Negative prompt:" to the end of the string, and the multi-view framing, scale and consistency suffixes sit after that marker — the GPT editor has never seen them. Restoring them for GPT is a prompt change to evaluate on its own.

## [0.2.0.0] - 2026-07-29

### Added

- Added team-shared, Blob-backed reference presets and user model uploads across Image Studio and Model Studio.
- Added CAD extraction queueing, cleanup, progress reporting, and deep-link garment preloading.
- Added Image Playground batch generation with persistent, explicitly ordered image references.
- Added Vitest coverage and CI verification for reference ordering, image compatibility, asset manifests, and CAD prompt behavior.

### Changed

- Improved image-generation responsiveness with parallel queues, speculative analysis, cached vision results, and background finalization.
- Updated Image Playground defaults, timing feedback, attachment labels, and native-aspect result previews.
- Stored shared user assets as independent manifests so concurrent saves and deletes cannot overwrite unrelated entries.

### Fixed

- Converted unsupported reference formats before sending them to Nano Banana and restricted legacy URL conversion to trusted storage.
- Restored active Image Playground attachments after refresh instead of showing unusable “ghost” references.
- Preserved attachment order from left to right so “Image 1/A”, “Image 2/B”, and later prompt references remain deterministic.
- Fixed model upload validation, shared-index cache behavior, queued CAD requests, output sizing, and multi-model placeholder state.
