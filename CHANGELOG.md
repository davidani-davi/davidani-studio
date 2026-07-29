# Changelog

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
